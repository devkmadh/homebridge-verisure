/**
 * @typedef {Object} VerisurePlatformConfig
 * @property {string} [alarmCode]
 * @property {string} [doorCode]
 * @property {string} [email]
 * @property {string} [password]
 * @property {string[]} cookies
 * @property {string[]} installations
 * @property {number} pollInterval
 * @property {boolean} showAutoLockSwitch
 * @property {boolean} showAudioSwitch
 * @property {string} audioOffValue
 * @property {string} audioOnValue
 */

/** @type {typeof import('verisure')} */
const Verisure = require('verisure');

const accessoryClasses = require('./accessories');
const VerisureAccessory = require('./accessories/verisure');
const { PLUGIN_NAME, PLATFORM_NAME } = require('./constants');
const { overviewOperation } = require('./operations');

const normalizePollInterval = (value) => {
  const seconds = parseInt(value, 10);
  if (Number.isNaN(seconds)) {
    return 60;
  }
  return Math.min(Math.max(seconds, 15), 3600);
};

const normalizeBoolean = (value, defaultValue) => (
  typeof value === 'boolean' ? value : defaultValue
);

const normalizeCookies = (cookies, envCookies) => {
  let raw = [];
  if (envCookies) {
    raw = envCookies.split(';').map((c) => c.trim()).filter(Boolean);
  } else if (Array.isArray(cookies)) {
    raw = cookies.map((c) => String(c).trim()).filter(Boolean);
  }
  return raw.filter((entry) => entry.includes('='));
};

const normalizePlatformConfig = (config) => {
  const {
    VERISURE_ALARM_CODE,
    VERISURE_DOOR_CODE,
    VERISURE_EMAIL,
    VERISURE_PASSWORD,
    VERISURE_COOKIES,
    VERISURE_TOKEN, // Deprecated.
  } = process.env;

  const {
    alarmCode,
    doorcode, doorCode,
    email,
    cookies,
    password,
    installations = [],
    pollInterval = 60,
    showAutoLockSwitch = true,
    showAudioSwitch = true,
    audioOffValue = 'LOW',
    audioOnValue = 'HIGH',
    token, // Deprecated.
  } = config;

  return {
    alarmCode: VERISURE_ALARM_CODE || alarmCode,
    doorCode: VERISURE_DOOR_CODE || doorcode || doorCode,
    email: VERISURE_EMAIL || email,
    password: VERISURE_PASSWORD || password,
    cookies: normalizeCookies(cookies, VERISURE_COOKIES),
    installations: Array.isArray(installations) ? installations : [],
    pollInterval: normalizePollInterval(pollInterval),
    showAutoLockSwitch: normalizeBoolean(showAutoLockSwitch, true),
    showAudioSwitch: normalizeBoolean(showAudioSwitch, true),
    audioOffValue,
    audioOnValue,
    deprecatedToken: VERISURE_TOKEN || token,
  };
};

class VerisurePlatform {
  /**
   * @param {import('homebridge').Logging} log
   * @param {import('homebridge').PlatformConfig} config
   * @param {import('homebridge').API} api
   */
  constructor(log, config, api) {
    this.log = log;
    this.api = api;
    this.config = normalizePlatformConfig(config);

    if (this.config.deprecatedToken) {
      this.log.error('DEPRECATED: Property "token" in config. Please see README to get and configure "cookies".');
    }

    /** @type {Map<string, import('homebridge').PlatformAccessory>} */
    this.accessories = new Map();
    /** @type {Map<string, VerisureAccessory>} */
    this.accessoryHandlers = new Map();
    /** @type {string[]} */
    this.discoveredCacheUUIDs = [];

    this.verisure = new Verisure(
      this.config.email,
      this.config.password,
      this.config.cookies
    );

    api.on('didFinishLaunching', () => {
      this.discoverDevices().catch((error) => {
        this.log.error(`Verisure discovery failed: ${error.message}`);
      });
    });
  }

  static overviewToDeviceConfigs(overview) {
    const alarm = overview.armState
      ? [{ statusType: overview.armState.statusType }]
      : [];

    // TODO: Use renaming in query instead.
    const deviceTypes = {
      alarm,
      climateSensor: overview.climates || [],
      contactSensor: overview.doorWindows || [],
      doorLock: overview.doorlocks || [],
      smartPlug: overview.smartplugs || [],
    };

    return deviceTypes;
  }

  static getInstallationId(installation) {
    return installation.giid || installation.config.alias;
  }

  static getDeviceUuid(api, installation, deviceType, deviceConfig) {
    const installationId = VerisurePlatform.getInstallationId(installation);

    if (deviceType === 'alarm') {
      return api.hap.uuid.generate(`${installationId}:alarm`);
    }

    const serialNumber = deviceConfig.device?.deviceLabel || deviceType;
    return api.hap.uuid.generate(`${installationId}:${deviceType}:${serialNumber}`);
  }

  hasCredentials() {
    return Boolean(
      this.config.cookies.length
      || (this.config.email && this.config.password)
    );
  }

  /**
   * @param {import('homebridge').PlatformAccessory} accessory
   */
  configureAccessory(accessory) {
    this.log.debug('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  overviewToDeviceDescriptors([installation, { installation: overview }]) {
    const descriptors = [];
    const deviceTypes = VerisurePlatform.overviewToDeviceConfigs(overview);

    Object.keys(deviceTypes).forEach((deviceType) => {
      if (deviceType === 'alarm' && !this.config.alarmCode) {
        return;
      }

      if (deviceType === 'doorLock' && !this.config.doorCode) {
        return;
      }

      deviceTypes[deviceType].forEach((deviceConfig) => {
        const AccessoryClass = accessoryClasses[deviceType];
        const handler = new AccessoryClass(this, deviceConfig, installation);
        const uuid = VerisurePlatform.getDeviceUuid(
          this.api,
          installation,
          deviceType,
          deviceConfig
        );

        descriptors.push({
          uuid,
          deviceType,
          deviceConfig,
          installation,
          displayName: handler.name,
          handler,
        });
      });
    });

    return descriptors;
  }

  registerDeviceDescriptor(descriptor) {
    const {
      uuid, deviceType, deviceConfig, installation, displayName, handler,
    } = descriptor;

    this.discoveredCacheUUIDs.push(uuid);

    let platformAccessory = this.accessories.get(uuid);

    if (platformAccessory) {
      this.log.info('Restoring existing accessory from cache:', platformAccessory.displayName);
      if (displayName && platformAccessory.displayName !== displayName) {
        platformAccessory.updateDisplayName(displayName);
      }
    } else {
      this.log.info('Adding new accessory:', displayName);
      // eslint-disable-next-line new-cap
      platformAccessory = new this.api.platformAccessory(displayName, uuid);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platformAccessory]);
      this.accessories.set(uuid, platformAccessory);
    }

    platformAccessory.context = {
      deviceType,
      installationId: VerisurePlatform.getInstallationId(installation),
      serialNumber: deviceConfig.device?.deviceLabel,
    };

    handler.attach(platformAccessory);
    handler.setupServices();
    this.accessoryHandlers.set(uuid, handler);
  }

  removeStaleAccessories() {
    [...this.accessories.entries()].forEach(([uuid, platformAccessory]) => {
      if (!this.discoveredCacheUUIDs.includes(uuid)) {
        this.log.info('Removing existing accessory from cache:', platformAccessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platformAccessory]);
        this.accessories.delete(uuid);
        this.accessoryHandlers.delete(uuid);
      }
    });
  }

  async loadDeviceDescriptors() {
    VerisureAccessory.resetUniqueAccessoryNames();

    if (!this.hasCredentials()) {
      this.log.error('Verisure: configure cookies or email and password.');
      return [];
    }

    try {
      if (!this.verisure.cookies.length) {
        await this.verisure.getToken();

        if (!this.verisure.getCookie('vid')) {
          this.log.error('MFA is enabled for user. Please see README.');
          return [];
        }
      }

      this.installations = (await this.verisure.getInstallations())
        .filter((installation) => this.config.installations.length === 0
          || this.config.installations.includes(installation.config.alias));
    } catch (error) {
      this.log.error(`Unable to get installations. Please check configured credentials: ${error.message}`);
      return [];
    }

    if (this.installations.length === 0) {
      this.log.error(`No installations found matching config: ${JSON.stringify(this.config.installations)}`);
      return [];
    }

    const overviews = [];
    let overviewFailures = 0;

    await Promise.all(
      this.installations.map(async (installation) => {
        try {
          const overview = await installation.client(overviewOperation);
          overviews.push([installation, overview]);
        } catch (error) {
          overviewFailures += 1;
          this.log.error(
            `Unable to load overview for ${installation.config.alias}: ${error.message}`
          );
        }
      })
    );

    if (overviewFailures > 0) {
      this.log.warn(`Verisure: skipped ${overviewFailures} installation(s) due to overview errors.`);
    }

    if (overviews.length === 0) {
      return [];
    }

    return overviews.flatMap(this.overviewToDeviceDescriptors.bind(this));
  }

  async discoverDevices() {
    this.discoveredCacheUUIDs = [];

    let descriptors;
    try {
      descriptors = await this.loadDeviceDescriptors();
    } catch (error) {
      this.log.error((error.response && error.response.data) || error.message);
      return;
    }

    descriptors.forEach((descriptor) => {
      this.registerDeviceDescriptor(descriptor);
    });

    this.removeStaleAccessories();
  }
}

module.exports = VerisurePlatform;
