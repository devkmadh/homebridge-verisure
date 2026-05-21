const uniqueAccessoryNames = [];

const POLL_MIN_INTERVAL_MS = 15000;

class VerisureAccessory {
  constructor(homebridge, logger, config, installation, platformConfig) {
    this.homebridge = homebridge;
    this.logger = logger;
    this.config = config;
    this.installation = installation;
    this.platformConfig = platformConfig;

    this.serialNumber = config.device && config.device.deviceLabel;

    this.value = null;
    this.service = null;
    this.pollCharacteristics = [];

    const { Characteristic, Service } = homebridge.hap;

    this.accessoryInformation = new Service.AccessoryInformation();
    this.accessoryInformation
      .setCharacteristic(Characteristic.Manufacturer, 'Verisure')
      .setCharacteristic(Characteristic.SerialNumber, this.serialNumber);

    this.pollInFlight = false;

    if (platformConfig && platformConfig.pollInterval) {
      const intervalMs = Math.max(platformConfig.pollInterval * 1000, POLL_MIN_INTERVAL_MS);
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
            this.log(error.message, 'debug');
          }
        })).finally(() => {
          this.pollInFlight = false;
        });
      }, intervalMs);
    }
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

  resolveChangeResult(operation, attempt = 0) {
    const maxAttempts = 150;

    this.log(`Resolving: ${operation.operationName}`);

    return this.installation.client(operation)
      .then(({ installation: { pollResult: { result } } }) => {
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
}

module.exports = VerisureAccessory;
