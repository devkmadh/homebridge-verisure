const VerisureAccessory = require('./verisure');
const { getOverview } = require('../overviewCache');
const i18n = require('../i18n');

const deviceNames = {
  HOMEPAD: 'VoiceBox',
  HUMIDITY: 'Climate sensor',
  SIREN: 'Siren',
  SMOKE: 'Smoke detector',
  VOICEBOX: 'VoiceBox',
  // TODO: Old ones, not verified from GraphQL.
  SMARTCAMERA1: 'SmartCam',
  WATER1: 'Water detector',
};

class ClimateSensor extends VerisureAccessory {
  constructor(platform, config, installation, platformAccessory) {
    super(platform, config, installation, platformAccessory);

    const { device: { area } } = this.config;
    const label = this.config.device.gui && this.config.device.gui.label;
    const _ = i18n(this.installation.locale);
    const name = _(deviceNames[label]) || label || 'Climate sensor';

    this.model = label;
    const areaName = (area || '').trim();
    this.name = VerisureAccessory.getUniqueAccessoryName(
      areaName ? `${name} - ${areaName}` : name
    );
  }

  async getCurrentPropertyValue(property) {
    this.log(`Getting current ${property} value.`);

    const overview = await getOverview(
      this.installation,
      this.getOverviewCacheTtlMs()
    );
    const device = overview.installation.climates.find(
      (climate) => climate.device.deviceLabel === this.serialNumber
    );

    if (!device) {
      throw new Error(`Could not find climate sensor for ${this.name}.`);
    }

    return device[`${property}Value`];
  }

  setupServices() {
    const { Service, Characteristic } = this.homebridge.hap;

    const services = [];

    services.push(
      this.ensureAccessoryInformation().setCharacteristic(Characteristic.Model, this.model)
    );

    if (this.config.temperatureValue) {
      this.temperatureService = this.ensureService(Service.TemperatureSensor, this.name);
      this.temperatureService
        .getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({ minValue: -40.0, maxValue: 60.0 })
        .onGet(this.getCurrentPropertyValue.bind(this, 'temperature'));
      services.push(this.temperatureService);
    }

    if (this.config.humidityValue) {
      this.humidityService = this.ensureService(Service.HumiditySensor, this.name);
      this.humidityService
        .getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .onGet(this.getCurrentPropertyValue.bind(this, 'humidity'));
      services.push(this.humidityService);
    }

    return this.platformAccessory ? undefined : services;
  }
}

module.exports = ClimateSensor;
