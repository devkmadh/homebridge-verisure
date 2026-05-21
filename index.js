const VerisurePlatform = require('./lib/platform');

/** @param {import('homebridge').API} api */
module.exports = (api) => {
  api.registerPlatform('homebridge-verisure', 'verisure', VerisurePlatform);
};
