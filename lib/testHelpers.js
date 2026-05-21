// @ts-nocheck
/* eslint-disable import/no-extraneous-dependencies */
const hap = require('@homebridge/hap-nodejs');

/**
 * @param {object} [platformConfig]
 */
function createTestPlatform(platformConfig = {}) {
  const log = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  return {
    api: { hap },
    log,
    config: platformConfig,
  };
}

/**
 * @param {typeof import('./accessories/verisure')} AccessoryClass
 * @param {object} options
 * @param {object} options.deviceConfig
 * @param {object} options.installation
 * @param {object} [options.platformConfig]
 */
function createAccessory(AccessoryClass, {
  deviceConfig,
  installation,
  platformConfig = {},
}) {
  const platform = createTestPlatform(platformConfig);
  const accessory = new AccessoryClass(platform, deviceConfig, installation);
  accessory.setupServices();
  return accessory;
}

module.exports = {
  createAccessory,
  createTestPlatform,
};
