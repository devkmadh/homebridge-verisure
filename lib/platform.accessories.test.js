const mockGetInstallations = jest.fn();

jest.mock('verisure', () => jest.fn().mockImplementation(() => ({
  cookies: ['vid=test'],
  getToken: jest.fn(),
  getCookie: jest.fn(),
  getInstallations: mockGetInstallations,
})));

const hap = require('@homebridge/hap-nodejs');
const VerisurePlatform = require('./platform');
const { PLUGIN_NAME, PLATFORM_NAME } = require('./constants');

describe('Platform discoverDevices()', () => {
  const log = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };

  const createApi = () => ({
    hap,
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
    on: jest.fn((event, callback) => {
      if (event === 'didFinishLaunching') {
        createApi.launchCallback = callback;
      }
    }),
  });

  let api;

  beforeEach(() => {
    jest.clearAllMocks();
    api = createApi();
  });

  it('registers no accessories when credentials are missing', async () => {
    const platform = new VerisurePlatform(log, {}, api);

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

    const platform = new VerisurePlatform(log, {
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

    const platform = new VerisurePlatform(log, {
      cookies: ['vid=test'],
    }, api);

    await platform.discoverDevices();

    const expectedUuid = hap.uuid.generate('installation-1:contactSensor:ABC');
    expect(api.platformAccessory).toHaveBeenCalledWith(
      'Door',
      expectedUuid
    );
  });
});
