const mockGetInstallations = jest.fn();

jest.mock('verisure', () => jest.fn().mockImplementation(() => ({
  cookies: ['vid=test'],
  getToken: jest.fn(),
  getCookie: jest.fn(),
  getInstallations: mockGetInstallations,
})));

const fs = require('fs');
const os = require('os');
const path = require('path');
const hap = require('@homebridge/hap-nodejs');
const VerisurePlatform = require('./platform');
const { PLUGIN_NAME, PLATFORM_NAME } = require('./constants');
const { SNAPSHOT_FILE } = require('./deviceSnapshot');

describe('Platform discoverDevices()', () => {
  const log = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };

  const createApi = (storagePath) => ({
    hap,
    user: {
      storagePath: () => storagePath,
    },
    platformAccessory: jest.fn((displayName, uuid) => ({
      displayName,
      UUID: uuid,
      context: {},
      updateDisplayName: jest.fn(),
      getService: jest.fn(),
      getServiceById: jest.fn(),
      addService: jest.fn((ServiceClass, name, subtype) => {
        const service = subtype
          ? new ServiceClass(name, subtype)
          : new ServiceClass(name);
        return service;
      }),
    })),
    registerPlatformAccessories: jest.fn(),
    unregisterPlatformAccessories: jest.fn(),
    updatePlatformAccessories: jest.fn(),
    on: jest.fn((event, callback) => {
      if (event === 'didFinishLaunching') {
        createApi.launchCallback = callback;
      }
    }),
  });

  let api;
  let storagePath;
  let platform;

  beforeEach(() => {
    jest.clearAllMocks();
    storagePath = fs.mkdtempSync(path.join(os.tmpdir(), 'verisure-'));
    api = createApi(storagePath);
  });

  afterEach(() => {
    if (platform && platform.retryTimer) {
      clearTimeout(platform.retryTimer);
    }
    fs.rmSync(storagePath, { recursive: true, force: true });
  });

  it('registers no accessories when credentials are missing', async () => {
    platform = new VerisurePlatform(log, {}, api);

    await platform.discoverDevices();

    expect(api.registerPlatformAccessories).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith('Verisure: configure cookies or email and password.');
  });

  it('skips installations with overview failures and loads the rest', async () => {
    const goodInstallation = {
      giid: 'good-giid',
      config: { alias: 'Good' },
      client: jest.fn().mockResolvedValue({
        installation: {
          doorWindows: [{
            device: { deviceLabel: 'ABC', area: 'Door' },
            state: 'CLOSE',
          }],
        },
      }),
    };
    const badInstallation = {
      giid: 'bad-giid',
      config: { alias: 'Bad' },
      client: jest.fn().mockRejectedValue(new Error('overview failed')),
    };

    mockGetInstallations.mockResolvedValueOnce([goodInstallation, badInstallation]);

    platform = new VerisurePlatform(log, {
      cookies: ['vid=test'],
    }, api);

    await platform.discoverDevices();

    expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
    expect(api.registerPlatformAccessories).toHaveBeenCalledWith(
      PLUGIN_NAME,
      PLATFORM_NAME,
      expect.any(Array)
    );
    expect(log.warn).toHaveBeenCalledWith(
      'Verisure: skipped 1 installation(s) due to overview errors.'
    );
  });

  it('uses stable UUIDs derived from installation and device identity', async () => {
    const installation = {
      giid: 'installation-1',
      config: { alias: 'Home' },
      client: jest.fn().mockResolvedValue({
        installation: {
          doorWindows: [{
            device: { deviceLabel: 'ABC', area: 'Door' },
            state: 'CLOSE',
          }],
        },
      }),
    };

    mockGetInstallations.mockResolvedValueOnce([installation]);

    platform = new VerisurePlatform(log, {
      cookies: ['vid=test'],
    }, api);

    await platform.discoverDevices();

    const expectedUuid = hap.uuid.generate('installation-1:contactSensor:ABC');
    expect(api.platformAccessory).toHaveBeenCalledWith(
      'Door',
      expectedUuid
    );
  });

  it('does not unregister cached accessories when Verisure API discovery fails', async () => {
    const uuid = hap.uuid.generate('cached-lock');
    const cached = {
      displayName: 'SmartLock - Entré',
      UUID: uuid,
      context: { deviceType: 'doorLock' },
    };

    platform = new VerisurePlatform(log, {
      cookies: ['vid=test'],
    }, api);
    platform.configureAccessory(cached);

    mockGetInstallations.mockRejectedValueOnce(new Error('getaddrinfo EAI_AGAIN'));

    await platform.discoverDevices();

    expect(api.unregisterPlatformAccessories).not.toHaveBeenCalled();
    expect(platform.accessories.get(uuid)).toBe(cached);
    expect(platform.retryTimer).toBeTruthy();
  });

  it('writes a snapshot after successful discovery and restores it when the API is down', async () => {
    const installation = {
      giid: 'installation-1',
      config: { alias: 'Home' },
      client: jest.fn().mockResolvedValue({
        installation: {
          doorWindows: [{
            device: { deviceLabel: 'ABC', area: 'Door' },
            state: 'CLOSE',
          }],
        },
      }),
    };

    mockGetInstallations.mockResolvedValueOnce([installation]);
    platform = new VerisurePlatform(log, {
      cookies: ['vid=test'],
    }, api);
    await platform.discoverDevices();
    platform.clearRetry();

    const snapshotFile = path.join(storagePath, SNAPSHOT_FILE);
    expect(fs.existsSync(snapshotFile)).toBe(true);
    expect(api.updatePlatformAccessories).toHaveBeenCalled();

    const api2 = createApi(storagePath);
    mockGetInstallations.mockRejectedValueOnce(new Error('getaddrinfo EAI_AGAIN'));
    const platform2 = new VerisurePlatform(log, {
      cookies: ['vid=test'],
    }, api2);
    await platform2.discoverDevices();

    expect(api2.registerPlatformAccessories).toHaveBeenCalled();
    expect(api2.unregisterPlatformAccessories).not.toHaveBeenCalled();
    expect(platform2.accessories.size).toBeGreaterThan(0);
    clearTimeout(platform2.retryTimer);
  });
});
