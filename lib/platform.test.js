const VerisurePlatform = require('./platform');

const createApi = () => ({
  on: jest.fn(),
});

describe('Platform', () => {
  const log = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers for didFinishLaunching on construction', () => {
    const api = createApi();
    // eslint-disable-next-line no-new
    new VerisurePlatform(log, {}, api);
    expect(api.on).toHaveBeenCalledWith('didFinishLaunching', expect.any(Function));
  });

  it('module exposes a platform class with default values', () => {
    const platform = new VerisurePlatform(log, {}, createApi());
    expect(platform).toBeInstanceOf(VerisurePlatform);
    expect(platform.config).toMatchObject({
      pollInterval: 60,
      showAutoLockSwitch: true,
      showAudioSwitch: true,
      audioOffValue: 'LOW',
      audioOnValue: 'HIGH',
    });
    expect(platform.log).toBe(log);
  });

  it('platform builds config with defaults', () => {
    const platform = new VerisurePlatform(log, {
      alarmCode: '2345',
      doorcode: '1234', // deprecated door code config key
    }, createApi());
    expect(platform.config).toMatchObject({
      alarmCode: '2345',
      doorCode: '1234', // resolves to camel case 👍
      installations: [],
      pollInterval: 60,
    });
  });

  it('platform builds config with passed values', () => {
    const config = {
      alarmCode: '2345',
      doorCode: '1234',
      email: 'foo@bar.com',
      password: 't0ps3cret',
      installations: ['Alias'],
      pollInterval: 120,
    };
    const platform = new VerisurePlatform(log, config, createApi());
    expect(platform.config).toMatchObject(config);
  });

  it('clamps poll interval to a safe range', () => {
    const platform = new VerisurePlatform(log, { pollInterval: 5 }, createApi());
    expect(platform.config.pollInterval).toBe(15);

    const platformMax = new VerisurePlatform(log, { pollInterval: 99999 }, createApi());
    expect(platformMax.config.pollInterval).toBe(3600);
  });

  it('normalizes cookie strings from the environment', () => {
    process.env.VERISURE_COOKIES = ' vid=abc ; vs-access=def ';
    const platform = new VerisurePlatform(log, {}, createApi());
    expect(platform.config.cookies).toEqual(['vid=abc', 'vs-access=def']);
    process.env.VERISURE_COOKIES = undefined;
  });

  it('reports missing credentials', () => {
    const keys = ['VERISURE_COOKIES', 'VERISURE_EMAIL', 'VERISURE_PASSWORD'];
    const saved = keys.map((key) => [key, process.env[key]]);
    keys.forEach((key) => { delete process.env[key]; });

    const platform = new VerisurePlatform(log, {}, createApi());
    expect(platform.hasCredentials()).toBe(false);

    saved.forEach(([key, value]) => {
      if (typeof value === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  it('platform builds config with environment variables', () => {
    const envVars = {
      VERISURE_ALARM_CODE: '2345',
      VERISURE_DOOR_CODE: '1234',
      VERISURE_EMAIL: 'foo@bar.com',
      VERISURE_COOKIES: 'foo=bar;asd=123',
      VERISURE_PASSWORD: 't0ps3cret',
    };

    const envKeys = Object.keys(envVars);

    envKeys.forEach((key) => { process.env[key] = envVars[key]; });

    const config = {
      alarmCode: envVars.VERISURE_ALARM_CODE,
      doorCode: envVars.VERISURE_DOOR_CODE,
      email: envVars.VERISURE_EMAIL,
      cookies: ['foo=bar', 'asd=123'],
      password: envVars.VERISURE_PASSWORD,
    };

    const platform = new VerisurePlatform(log, {}, createApi());
    expect(platform.config).toMatchObject(config);

    envKeys.forEach((key) => { process.env[key] = null; });
  });

  it('filters malformed cookie entries', () => {
    const saved = process.env.VERISURE_COOKIES;
    delete process.env.VERISURE_COOKIES;

    const platform = new VerisurePlatform(log, {
      cookies: ['vid=abc', 'not-a-cookie', 'vs-access=def'],
    }, createApi());
    expect(platform.config.cookies).toEqual(['vid=abc', 'vs-access=def']);

    if (typeof saved === 'undefined') {
      delete process.env.VERISURE_COOKIES;
    } else {
      process.env.VERISURE_COOKIES = saved;
    }
  });

  it('transform empty overview into empty lists of device configs', () => {
    const deviceConfigs = {
      alarm: [],
      climateSensor: [],
      contactSensor: [],
      doorLock: [],
      smartPlug: [],
    };
    expect(VerisurePlatform.overviewToDeviceConfigs({})).toMatchObject(deviceConfigs);
  });

  it('transform overview into device configs', () => {
    const overview = {
      armState: { statusType: 'DISARMED' },
      climates: [{ device: { deviceLabel: 'ABCD 1234' } }],
      doorWindows: [{ device: { deviceLabel: 'DEFG 2345' } }],
      doorlocks: [],
      smartplugs: [{ device: { deviceLabel: 'EFGH 3456' } }],
    };
    expect(VerisurePlatform.overviewToDeviceConfigs(overview)).toMatchObject({
      alarm: [{ statusType: 'DISARMED' }],
      climateSensor: [{ device: { deviceLabel: 'ABCD 1234' } }],
      contactSensor: [{ device: { deviceLabel: 'DEFG 2345' } }],
      doorLock: [],
      smartPlug: [{ device: { deviceLabel: 'EFGH 3456' } }],
    });
  });
});
