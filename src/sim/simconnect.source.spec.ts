import { Protocol } from 'node-simconnect';
import {
  MSFS_PIPE,
  PROTOCOL_NAMES,
  PROTOCOLS,
  SimconnectSource,
  SimulatorNotRunningError,
} from './simconnect.source';

const handlers = {
  onSample: () => undefined,
  onAircraftIdentifier: () => undefined,
  onClosed: () => undefined,
};

describe('SimconnectSource', () => {
  it('refuses to connect locally while the simulator pipe is absent', async () => {
    const source = new SimconnectSource(null, PROTOCOLS, () =>
      Promise.resolve(false),
    );

    await expect(source.connect(handlers)).rejects.toBeInstanceOf(
      SimulatorNotRunningError,
    );
  });

  it('looks for the pipe the simulator actually opens', async () => {
    const probed: string[] = [];
    const source = new SimconnectSource(null, PROTOCOLS, (path) => {
      probed.push(path);

      return Promise.resolve(false);
    });

    await source.connect(handlers).catch(() => undefined);

    expect(probed).toEqual([MSFS_PIPE]);
  });

  it('tries the 2024 protocol before the 2020 one', () => {
    expect(PROTOCOLS).toEqual([Protocol.SunRise, Protocol.KittyHawk]);
  });

  it('names every protocol it will try', () => {
    for (const protocol of PROTOCOLS) {
      expect(PROTOCOL_NAMES[protocol]).toBeDefined();
    }
  });

  it('never probes the pipe when a remote host is configured', async () => {
    let probed = false;
    const source = new SimconnectSource(
      { host: '127.0.0.1', port: 1 },
      PROTOCOLS,
      () => {
        probed = true;

        return Promise.resolve(false);
      },
    );

    await source.connect(handlers).catch(() => undefined);

    expect(probed).toBe(false);
  });
});
