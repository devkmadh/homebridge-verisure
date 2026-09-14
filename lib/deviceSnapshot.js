const fs = require('fs');
const path = require('path');

const SNAPSHOT_FILE = 'verisure-devices.json';

const getSnapshotPath = (api) => {
  const storage = api.user && typeof api.user.storagePath === 'function'
    ? api.user.storagePath()
    : process.cwd();
  return path.join(storage, SNAPSHOT_FILE);
};

const readSnapshot = (api, log) => {
  const file = getSnapshotPath(api);
  try {
    if (!fs.existsSync(file)) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || !Array.isArray(parsed.devices) || parsed.devices.length === 0) {
      return null;
    }
    return parsed;
  } catch (error) {
    if (log) {
      log.warn(`Verisure: could not read accessory snapshot: ${error.message}`);
    }
    return null;
  }
};

const writeSnapshot = (api, devices, log) => {
  if (!devices.length) {
    return;
  }
  const file = getSnapshotPath(api);
  const payload = {
    savedAt: new Date().toISOString(),
    devices,
  };
  try {
    fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch (error) {
    if (log) {
      log.warn(`Verisure: could not write accessory snapshot: ${error.message}`);
    }
  }
};

module.exports = {
  SNAPSHOT_FILE,
  getSnapshotPath,
  readSnapshot,
  writeSnapshot,
};
