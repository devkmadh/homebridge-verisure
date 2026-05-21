const Verisure = require('./verisure');
const { createTestPlatform } = require('../testHelpers');

describe('Verisure', () => {
  const config = {
    device: {
      deviceLabel: 'ASD123',
    },
  };
  const installation = {
    client: null,
    config: {
      alias: 'Home',
    },
  };

  const platform = createTestPlatform();
  const verisure = new Verisure(platform, config, installation);

  beforeEach(() => {
    platform.log.info.mockClear();
  });

  it('get lock state change result', () => {
    expect.assertions(4);
    installation.client = jest.fn();
    installation.client.mockResolvedValueOnce({ installation: { pollResult: { result: null } } });
    installation.client.mockResolvedValueOnce({ installation: { pollResult: { result: 'OK' } } });

    const operation = {
      operationName: 'pollArmState',
      variables: {
        transactionId: '1234',
        futureState: 'SOME_STATE',
      },
    };

    return verisure.resolveChangeResult(operation).then((result) => {
      expect(result).toBe('OK');
      const { calls } = installation.client.mock;
      expect(calls[0][0].variables).toMatchObject(operation.variables);
      expect(calls[1][0].variables).toMatchObject(operation.variables);
      expect(calls.length).toBe(2);
    });
  });

  it('prefixes logs with installation and accessory name', () => {
    verisure.name = 'SmartPlug - Hallway';
    verisure.log('Something happened.');
    expect(platform.log.info.mock.calls[0][0]).toBe('Home SmartPlug - Hallway: Something happened.');
  });

  it('times out when poll result stays null', async () => {
    jest.useFakeTimers();
    installation.client = jest.fn().mockResolvedValue({
      installation: { pollResult: { result: null } },
    });

    const promise = verisure.resolveChangeResult({ operationName: 'pollArmState' });
    const expectation = expect(promise).rejects.toThrow('Timed out waiting for pollArmState');
    await jest.advanceTimersByTimeAsync(200 * 151);
    await expectation;
    jest.useRealTimers();
  });

  it('errors when poll response is missing pollResult', async () => {
    installation.client = jest.fn().mockResolvedValueOnce({ installation: {} });

    await expect(verisure.resolveChangeResult({ operationName: 'pollArmState' }))
      .rejects.toThrow('Invalid poll response from pollArmState');
  });
});
