const VerisureAccessory = require('./verisure');
const { getOverview } = require('../overviewCache');

class ContactSensor extends VerisureAccessory {
  constructor(platform, config, installation, platformAccessory) {
    super(platform, config, installation, platformAccessory);

    const {
      device: { area },
      state,
    } = this.config;

    this.name = VerisureAccessory.getUniqueAccessoryName((area || '').trim() || 'Contact sensor');
    this.value = ContactSensor.resolveSensorState(state);
  }

  static resolveSensorState(input) {
    return input !== 'CLOSE';
  }

  async getCurrentSensorState() {
    this.log('Getting current sensor state.', 'debug');

    const overview = await getOverview(
      this.installation,
      this.getOverviewCacheTtlMs()
    );
    const doorWindow = overview.installation.doorWindows.find(
      (dw) => dw.device.deviceLabel === this.serialNumber
    );

    if (!doorWindow) {
      throw new Error(`Could not find contact sensor state for ${this.name}.`);
    }

    this.value = ContactSensor.resolveSensorState(doorWindow.state);
    return this.value;
  }

  setupServices() {
    const { Service, Characteristic } = this.homebridge.hap;

    this.service = this.ensureService(Service.ContactSensor, this.name);
    const currentStateCharacteristic = this.service
      .getCharacteristic(Characteristic.ContactSensorState)
      .onGet(this.getCurrentSensorState.bind(this));

    this.pollCharacteristics.push({
      characteristic: currentStateCharacteristic,
      getter: this.getCurrentSensorState.bind(this),
    });

    const services = [this.ensureAccessoryInformation(), this.service];
    return this.platformAccessory ? undefined : services;
  }
}

module.exports = ContactSensor;
