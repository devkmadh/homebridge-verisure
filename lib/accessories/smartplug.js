const VerisureAccessory = require('./verisure');
const { getOverview } = require('../overviewCache');
const { smartPlugStateOperation } = require('../operations');

class SmartPlug extends VerisureAccessory {
  constructor(platform, config, installation, platformAccessory) {
    super(platform, config, installation, platformAccessory);

    this.model = 'SMARTPLUG';
    const area = (this.config.device.area || '').trim();
    this.name = VerisureAccessory.getUniqueAccessoryName(
      area ? `SmartPlug - ${area}` : 'SmartPlug'
    );
    this.value = SmartPlug.resolveSwitchState(this.config.currentState);
  }

  static resolveSwitchState(input) {
    return input === 'ON';
  }

  async getSwitchState() {
    this.log('Getting current switch state.');

    const overview = await getOverview(
      this.installation,
      this.getOverviewCacheTtlMs()
    );
    const smartplug = overview.installation.smartplugs.find(
      (sp) => sp.device.deviceLabel === this.serialNumber
    );

    if (!smartplug) {
      throw new Error(`Could not find smart plug state for ${this.name}.`);
    }

    this.value = SmartPlug.resolveSwitchState(smartplug.currentState);
    return this.value;
  }

  async setSwitchState(value) {
    this.log(`Setting switch state to: ${value}`);

    this.value = value;

    try {
      await this.installation.client(smartPlugStateOperation(this.serialNumber, value));
    } catch (error) {
      this.log(`Error setting switch state: ${error.errorMessage}`);
      throw new Error(error.errorMessage);
    }
  }

  setupServices() {
    const { Service, Characteristic } = this.homebridge.hap;

    this.service = this.ensureService(Service.Switch, this.name);
    this.service
      .getCharacteristic(Characteristic.On)
      .onGet(this.getSwitchState.bind(this))
      .onSet(this.setSwitchState.bind(this));

    this.service.updateCharacteristic(Characteristic.On, this.value);

    this.ensureAccessoryInformation().setCharacteristic(Characteristic.Model, this.model);

    const services = [this.accessoryInformation, this.service];
    return this.platformAccessory ? undefined : services;
  }
}

module.exports = SmartPlug;
