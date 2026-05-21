// @ts-check

const uniqueAccessoryNames = [];

/**
 * @typedef {Object} PollEntry
 * @property {import('@homebridge/hap-nodejs').Characteristic} characteristic
 * @property {() => Promise<unknown>} getter
 */

const POLL_MIN_INTERVAL_MS = 15000;

class VerisureAccessory {
  /**
   * @param {object} platform
   * @param {object} config
   * @param {object} installation
   * @param {import('homebridge').PlatformAccessory} [platformAccessory]
   */
  constructor(platform, config, installation, platformAccessory = null) {
    this.platform = platform;
    this.homebridge = { hap: platform.api.hap };
    this.logger = platform.log;
    this.config = config;
    this.installation = installation;
    this.platformConfig = platform.config;
    this.platformAccessory = platformAccessory;

    this.serialNumber = config.device && config.device.deviceLabel;

    /** @type {string | undefined} */
    this.name = undefined;

    this.value = null;
    this.service = null;
    this.pollCharacteristics = [];
    /** @type {import('@homebridge/hap-nodejs').Service | null} */
    this.accessoryInformation = null;

    this.pollInFlight = false;
    this.pollWarned = false;

    if (platform.config && platform.config.pollInterval) {
      const intervalMs = Math.max(platform.config.pollInterval * 1000, POLL_MIN_INTERVAL_MS);
      setInterval(() => {
        if (this.pollInFlight || this.pollCharacteristics.length === 0) {
          return;
        }
        this.pollInFlight = true;
        Promise.all(this.pollCharacteristics.map(async ({ characteristic, getter }) => {
          try {
            const value = await getter();
            characteristic.updateValue(value);
          } catch (error) {
            if (!this.pollWarned) {
              this.log(error.message, 'warn');
              this.pollWarned = true;
            } else {
              this.log(error.message, 'debug');
            }
          }
        })).finally(() => {
          this.pollInFlight = false;
        });
      }, intervalMs);
    }
  }

  /**
   * @param {import('homebridge').PlatformAccessory} platformAccessory
   */
  attach(platformAccessory) {
    this.platformAccessory = platformAccessory;
  }

  static resetUniqueAccessoryNames() {
    uniqueAccessoryNames.length = 0;
  }

  static getUniqueAccessoryName(name) {
    if (uniqueAccessoryNames.includes(name)) {
      const match = name.match(/(.+) #(\d+)/) || [null, name, 1];
      return VerisureAccessory.getUniqueAccessoryName(`${match[1]} #${parseInt(match[2], 10) + 1}`);
    }
    uniqueAccessoryNames.push(name);
    return name;
  }

  getOverviewCacheTtlMs() {
    const seconds = this.platformConfig?.pollInterval || 60;
    return seconds * 1000;
  }

  ensureAccessoryInformation() {
    const { Service, Characteristic } = this.homebridge.hap;

    if (this.platformAccessory) {
      let info = this.platformAccessory.getService(Service.AccessoryInformation);
      if (!info) {
        info = this.platformAccessory.addService(Service.AccessoryInformation);
      }
      this.accessoryInformation = info;
    } else if (!this.accessoryInformation) {
      this.accessoryInformation = new Service.AccessoryInformation();
    }

    this.accessoryInformation
      .setCharacteristic(Characteristic.Manufacturer, 'Verisure')
      .setCharacteristic(Characteristic.SerialNumber, this.serialNumber);

    return this.accessoryInformation;
  }

  /**
   * @param {typeof import('@homebridge/hap-nodejs').Service} ServiceClass
   * @param {string} [name]
   * @param {string} [subtype]
   */
  ensureService(ServiceClass, name, subtype) {
    if (this.platformAccessory) {
      let service;
      if (subtype) {
        service = this.platformAccessory.getServiceById(/** @type {any} */ (ServiceClass), subtype);
      } else {
        service = this.platformAccessory.getService(/** @type {any} */ (ServiceClass));
      }
      if (!service) {
        service = subtype
          ? this.platformAccessory.addService(/** @type {any} */ (ServiceClass), name, subtype)
          : this.platformAccessory.addService(/** @type {any} */ (ServiceClass), name);
      }
      return service;
    }

    const Service = /** @type {any} */ (ServiceClass);
    return subtype
      ? new Service(name, subtype)
      : new Service(name || '');
  }

  resolveChangeResult(operation, attempt = 0) {
    const maxAttempts = 150;

    this.log(`Resolving: ${operation.operationName}`);

    return this.installation.client(operation)
      .then((response) => {
        const pollResult = response?.installation?.pollResult;
        if (!pollResult || typeof pollResult.result === 'undefined') {
          throw new Error(`Invalid poll response from ${operation.operationName}`);
        }
        const { result } = pollResult;
        this.log(`Got "${result}" back from: ${operation.operationName}`);
        if (result === null) {
          if (attempt >= maxAttempts) {
            throw new Error(`Timed out waiting for ${operation.operationName}`);
          }
          return new Promise((resolve) => {
            setTimeout(
              () => resolve(this.resolveChangeResult(operation, attempt + 1)),
              200
            );
          });
        }
        return result;
      });
  }

  log(message, level = 'info') {
    return this.logger[level](`${this.installation.config.alias} ${this.name}: ${message}`);
  }

  /** @deprecated Use setupServices() */
  getServices() {
    return this.setupServices();
  }

  /** @throws {Error} */
  // eslint-disable-next-line class-methods-use-this
  setupServices() {
    throw new Error('setupServices() must be implemented by accessory subclass');
  }
}

module.exports = VerisureAccessory;
