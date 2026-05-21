const hap = require('@homebridge/hap-nodejs');

const DoorLock = require('./doorlock');
const { createAccessory } = require('../testHelpers');

describe('DoorLock', () => {
  const config = {
    device: {
      area: 'Entré',
      deviceLabel: '1234',
    },
    currentLockState: 'LOCKED',
    motorJam: false,
  };
  const installation = {
    giid: 'abc123',
    client: null,
    config: {
      alias: 'Home',
    },
  };
  const platformConfig = {
    doorCode: '000000',
    showAutoLockSwitch: true,
    showAudioSwitch: true,
    audioOffValue: 'LOW',
    audioOnValue: 'HIGH',
  };
  const { LockCurrentState, LockTargetState } = hap.Characteristic;
  const doorLock = createAccessory(DoorLock, {
    deviceConfig: config,
    installation,
    platformConfig,
  });

  it('setup names and code', () => {
    expect(doorLock.name).toBe('SmartLock - Entré');

    expect(doorLock.switchName).toBe('Auto-lock - Entré');
    expect(doorLock.doorCode).toBe('000000');
  });

  it('resolves jammed lock state', () => {
    const state = doorLock.resolveCurrentLockState({ motorJam: true });
    expect(state).toBe(LockCurrentState.JAMMED);
  });

  it('resolves secured lock state', () => {
    const state = doorLock.resolveCurrentLockState({
      currentLockState: 'LOCKED',
    });
    expect(state).toBe(LockCurrentState.SECURED);
  });

  it('resolves unknown lock state for unexpected api values', () => {
    const state = doorLock.resolveCurrentLockState({ currentLockState: 'PENDING' });
    expect(state).toBe(LockCurrentState.UNKNOWN);
  });

  it('resolves jammed even if locked', () => {
    const state = doorLock.resolveCurrentLockState({
      currentLockState: 'LOCKED',
      motorJam: true,
    });
    expect(state).toBe(LockCurrentState.JAMMED);
  });

  it('gets lock state', async () => {
    expect.assertions(1);
    installation.client = () => Promise.resolve({
      installation: {
        doorlocks: [
          {
            device: {
              deviceLabel: doorLock.serialNumber,
            },
            currentLockState: 'LOCKED',
          },
        ],
      },
    });
    const value = await doorLock.getCurrentLockState();
    expect(value).toBe(LockCurrentState.SECURED);
  });

  it('errors when not able to get lock state', async () => {
    expect.assertions(2);
    installation.client = () => Promise.resolve({
      installation: {
        doorlocks: [
          {
            device: { deviceLabel: 'NOT MATCHING LABEL' },
            currentLockState: 'LOCKED',
          },
        ],
      },
    });
    const currentDoorLockValue = doorLock.value;
    await expect(doorLock.getCurrentLockState()).rejects.toThrow(
      'Could not find lock state for SmartLock - Entré.'
    );
    expect(doorLock.value).toBe(currentDoorLockValue);
  });

  it('get target lock state equal to current state when target is not changed', async () => {
    installation.client = jest.fn();
    installation.client.mockResolvedValueOnce({
      installation: {
        doorlocks: [
          {
            device: {
              deviceLabel: doorLock.serialNumber,
            },
            currentLockState: 'UNLOCKED',
          },
        ],
      },
    });

    doorLock.targetLockState = 'NONE';

    const value = await doorLock.getTargetLockState();
    expect(value).toBe(LockTargetState.UNSECURED);
  });

  it('errors on unknown lock state when getting target state', async () => {
    installation.client = jest.fn();
    installation.client.mockResolvedValueOnce({
      installation: {
        doorlocks: [
          {
            device: {
              deviceLabel: doorLock.serialNumber,
            },
            currentLockState: 'PENDING',
          },
        ],
      },
    });

    doorLock.targetLockState = 'NONE';

    await expect(doorLock.getTargetLockState()).rejects.toThrow(
      'Unknown lock state from Verisure: PENDING'
    );
  });

  it('get target lock state when target is changed', async () => {
    installation.client = jest.fn();
    installation.client.mockResolvedValueOnce({
      installation: {
        doorlocks: [
          {
            device: {
              deviceLabel: doorLock.serialNumber,
            },
            currentLockState: 'UNLOCKED',
          },
        ],
      },
    });

    doorLock.targetLockState = 'LOCKED';

    const value = await doorLock.getTargetLockState();
    expect(value).toBe(LockTargetState.SECURED);
  });

  it('sets target lock state', async () => {
    expect.assertions(3);
    installation.client = jest.fn();
    installation.client.mockResolvedValueOnce({
      transactionId: 'asd123',
    });
    installation.client.mockResolvedValueOnce({
      installation: {
        pollResult: {
          result: null,
        },
      },
    });
    installation.client.mockResolvedValueOnce({
      installation: {
        pollResult: {
          result: 'OK',
        },
      },
    });

    await doorLock.setTargetLockState(LockTargetState.SECURED);

    const { calls } = installation.client.mock;
    expect(calls.length).toBe(3);

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(doorLock.lockService.getCharacteristic(LockCurrentState).value).toBe(
      LockTargetState.SECURED
    );
    expect(doorLock.targetLockState).toBe('NONE');
  });

  it('sets target lock state to same as current state', async () => {
    expect.assertions(2);
    installation.client = jest.fn();
    installation.client.mockRejectedValue({
      errors: [
        {
          data: {
            errorCode: 'VAL_00819',
          },
        },
      ],
    });

    await doorLock.setTargetLockState(LockTargetState.SECURED);

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(doorLock.lockService.getCharacteristic(LockCurrentState).value).toBe(
      LockTargetState.SECURED
    );
    expect(doorLock.targetLockState).toBe('NONE');
  });

  it('handles error when setting lock state', async () => {
    expect.assertions(1);
    installation.client = jest.fn();
    installation.client.mockRejectedValue({
      errors: [
        {
          data: {
            errorCode: 'VAL_1337',
          },
        },
      ],
    });

    await expect(doorLock.setTargetLockState(LockTargetState.SECURED)).rejects.toBeTruthy();
  });

  it('handles malformed Verisure error when setting lock state', async () => {
    installation.client = jest.fn().mockRejectedValue(new Error('network failure'));

    await expect(doorLock.setTargetLockState(LockTargetState.SECURED)).rejects.toThrow('network failure');
  });

  it('resolves disabled auto lock state from config', () => {
    const state = DoorLock.resolveAutoLockState({ autoLockEnabled: false });
    expect(state).toBe(false);
  });

  it('resolves enabled auto lock state from config', () => {
    const state = DoorLock.resolveAutoLockState({ autoLockEnabled: true });
    expect(state).toBe(true);
  });

  it('get current auto lock disabled state', async () => {
    installation.client = jest.fn();
    installation.client.mockResolvedValueOnce({
      installation: {
        smartLocks: [
          {
            configuration: {
              autoLockEnabled: false,
            },
          },
        ],
      },
    });
    const value = await doorLock.getAutoLockState();
    expect(value).toBe(false);
  });

  it('set auto lock switch state', async () => {
    expect.assertions(1);
    installation.client = jest.fn();
    installation.client.mockResolvedValueOnce({ something: 'something' });

    await doorLock.setAutoLockState(true);
    expect(doorLock.autoLockState).toBe(true);
  });

  it('get current audio switch state', async () => {
    installation.client = jest.fn();
    installation.client.mockResolvedValueOnce({
      installation: {
        smartLocks: [
          {
            configuration: {
              volume: 'LOW',
            },
          },
        ],
      },
    });
    const value = await doorLock.getAudioState();
    expect(value).toBe(false); // LOW
  });

  it('set audio switch state on', async () => {
    expect.assertions(1);
    installation.client = jest.fn();
    installation.client.mockResolvedValueOnce({ something: 'something' });

    await doorLock.setAudioState(true);
    expect(doorLock.audioState).toBe(true); // HIGH
  });
});
