import { StatusRegistry } from '../core/status';
import { renderFrame, renderTitle, SIDE_BY_SIDE_COLUMNS } from './frame';
import { visibleWidth } from './style';

function frame(
  columns: number,
  mutate: (status: StatusRegistry) => void = () => undefined,
  logs: string[] = [],
  showLogs = false,
): string[] {
  const status = new StatusRegistry();
  mutate(status);

  return renderFrame({
    status: status.snapshot(),
    version: '0.3.0',
    columns,
    logs,
    showLogs,
    prompt: null,
  });
}

// Reading assertions against a coloured frame means reading them against the
// escapes too, so the plain text is what most of these look at.
function plain(
  columns: number,
  mutate?: (status: StatusRegistry) => void,
  logs?: string[],
  showLogs?: boolean,
): string {
  process.env.NO_COLOR = '1';

  try {
    return frame(columns, mutate, logs, showLogs).join('\n');
  } finally {
    delete process.env.NO_COLOR;
  }
}

function signedIn(status: StatusRegistry): void {
  status.set('api', 'connected');
  status.setCrew({ name: 'Oskar Barcz', email: 'pilot@example.com' });
}

function onService(status: StatusRegistry): void {
  signedIn(status);
  status.setService({
    callsign: 'DLH5540',
    departure: { iata: 'BER', icao: 'EDDB', name: 'Berlin' },
    arrival: { iata: 'WAW', icao: 'EPWA', name: 'Warsaw Chopin' },
    airframe: 'B77W',
    registration: 'SP-LVD',
  });
}

describe('renderFrame', () => {
  it('pads every line to the terminal width', () => {
    for (const line of frame(80)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(80);
    }
  });

  // The assertion above used to read `line.length`, which colour quietly
  // broke: an escape adds characters and no columns, so a .length budget
  // gets easier to satisfy the more styling you add.
  it('fills the width in visible columns rather than characters', () => {
    for (const line of frame(80).filter((line) => line !== '')) {
      expect(visibleWidth(line)).toBe(80);
      expect(line.length).toBeGreaterThan(80);
    }
  });

  it('lays out identically with colour turned off', () => {
    process.env.NO_COLOR = '1';

    try {
      for (const line of frame(80).filter((line) => line !== '')) {
        expect(line).not.toContain('[0m');
        expect(line.length).toBe(80);
      }
    } finally {
      delete process.env.NO_COLOR;
    }
  });

  it('shows the wordmark and the version', () => {
    const lines = frame(80);

    expect(lines[1]).toContain('FLIGHT TRACKER');
    expect(lines[1]).toContain('v0.3.0');
  });

  it('draws all five sections, numbered', () => {
    const lines = plain(80);

    for (const title of [
      '1 CREW',
      '2 CRNT SERVICE',
      '3 XPNDR',
      '4 COMMS',
      '5 STATUS',
    ]) {
      expect(lines).toContain(title);
    }
  });

  it('pairs the first four sections two to a row when there is room', () => {
    const rows = plain(80).split('\n');

    expect(rows.find((row) => row.includes('1 CREW'))).toContain(
      '2 CRNT SERVICE',
    );
    expect(rows.find((row) => row.includes('3 XPNDR'))).toContain('4 COMMS');
  });

  it('gives the status section the full width to itself', () => {
    const rows = plain(80).split('\n');
    const row = rows.find((line) => line.includes('5 STATUS'));

    expect(row).not.toContain('4 COMMS');
    expect(visibleWidth(row ?? '')).toBe(80);
  });

  it('stacks the pairs when the terminal is narrow', () => {
    const rows = plain(SIDE_BY_SIDE_COLUMNS - 1).split('\n');

    expect(rows.find((row) => row.includes('1 CREW'))).not.toContain(
      '2 CRNT SERVICE',
    );
    expect(rows.some((row) => row.includes('2 CRNT SERVICE'))).toBe(true);
  });

  it('names the signed-in pilot and their address', () => {
    const lines = plain(80, signedIn);

    expect(lines).toContain('Oskar Barcz');
    expect(lines).toContain('pilot@example.com');
  });

  it('says who is not signed in, and how to be', () => {
    const lines = plain(80);

    expect(lines).toContain('not signed in');
    expect(lines).toContain('press s to sign in');
  });

  it('reads the current service as callsign, route, airframe and tail', () => {
    const lines = plain(120, onService);

    expect(lines).toContain('DLH5540 * [BER] Berlin -> [WAW] Warsaw Chopin');
    expect(lines).toContain('airframe: [B77W] * tail: [SP-LVD]');
  });

  // Half of an eighty-column terminal cannot hold the names, and a name cut off
  // mid-word identifies an airport less well than its code alone.
  it('drops the airport names before it lets the route be truncated', () => {
    const lines = plain(80, onService);

    expect(lines).toContain('DLH5540 * [BER] -> [WAW]');
    expect(lines).not.toContain('Warsa');
  });

  it('says there is no current flight when there is none', () => {
    expect(plain(80, signedIn)).toContain('no current flight');
  });

  it('reports the transponder as an aircraft would', () => {
    const lines = plain(80, (status) => {
      status.setAircraftIdentifier('SP-LVD');
      status.setTransponder('2000', 451.4);
      status.recordAcceptedReport(new Date(Date.UTC(2026, 7, 14, 11, 30, 30)));
    });

    expect(lines).toContain('tail:   [SP-LVD]');
    expect(lines).toContain('squawk: [2000]');
    expect(lines).toContain('spd:    451kt');
    expect(lines).toContain('call:   11:30:30z');
  });

  it.each([
    [true, 'mode:   [MODE C]'],
    [false, 'mode:   [STBY]'],
  ])('reads mode from the switch, not the network (%s)', (on, expected) => {
    expect(plain(80, (status) => status.setTransmitting(on))).toContain(
      expected,
    );
  });

  it('leaves the transponder rows blank until the simulator says otherwise', () => {
    const lines = plain(80);

    expect(lines).toContain('squawk: [—]');
    expect(lines).toContain('call:   —');
  });

  it('reports the Discord client and whether presence is published', () => {
    expect(
      plain(80, (status) => {
        status.set('discord', 'connected');
        status.setPresence('Boarding', 'EPWA -> EDDF');
      }),
    ).toContain('presence: [ON]');

    expect(plain(80)).toContain('presence: [OFF]');
  });

  it('states both services and itself on one line, with versions', () => {
    const lines = plain(80, (status) => {
      status.set('api', 'connected');
      status.set('adsb', 'connected');
      status.setServiceVersion('api', '3.24.0');
      status.setServiceVersion('adsb', '0.5.0');
    });

    expect(lines).toContain(
      'adsb: [OK, v0.5.0] · tracker: [OK, v3.24.0] · xpndr: [OK, v0.3.0]',
    );
  });

  // `standby` and `waiting-for-flight` are this app's states, not the service's:
  // the service answered, so from here it is up.
  it.each([
    ['waiting-for-flight', 'adsb: [OK]'],
    ['standby', 'adsb: [OK]'],
    ['disconnected', 'adsb: [OFFLINE]'],
    ['unauthorised', 'adsb: [UNAUTHORISED]'],
  ])('reads %s as %s', (state, expected) => {
    expect(
      plain(80, (status) => status.set('adsb', state as 'connected')),
    ).toContain(expected);
  });

  it('offers the update when a newer release exists', () => {
    expect(plain(80, (status) => status.setLatestRelease('0.8.0'))).toContain(
      'xpndr: [UPDATE to v0.8.0 possible]',
    );
  });

  it('says nothing about updates when it is already the newest', () => {
    const lines = plain(80, (status) => status.setLatestRelease('0.3.0'));

    expect(lines).toContain('xpndr: [OK, v0.3.0]');
    expect(lines).not.toContain('UPDATE');
  });

  it('hides the log pane until it is asked for', () => {
    const logs = ['20:14:22 WARN  simulator connection failed'];

    expect(plain(80, undefined, logs, false)).not.toContain(
      'simulator connection failed',
    );
    expect(plain(80, undefined, logs, true)).toContain(
      'simulator connection failed',
    );
  });

  it('shows only the most recent log lines', () => {
    const logs = Array.from({ length: 40 }, (_, index) => `line-${index}`);
    const lines = plain(80, undefined, logs, true);

    expect(lines).toContain('line-39');
    expect(lines).not.toContain('line-0 ');
  });

  // The key used to be the same colour as its label, which made the bottom line
  // read as a sentence rather than as a list of things to press.
  it('brackets every key so it can be told from its label', () => {
    const lines = plain(80);

    expect(lines).toContain('[s] sign in');
    expect(lines).toContain('[t] toggle xpndr mode');
    expect(lines).toContain('[c] custom callsign');
    expect(lines).toContain('[d] debug');
  });

  it('marks the key brighter than the words around it', () => {
    const line = frame(80).at(-1) ?? '';

    // The letter carries its own style; the label is dim.
    expect(line).toContain('[[1ms[0m]');
  });

  it('offers signing out once there is a session to end', () => {
    const lines = plain(80, (status) => {
      signedIn(status);
      status.setTransmitting(false);
    });

    expect(lines).toContain('[s] sign out');
    expect(lines).not.toContain('[s] sign in');
  });

  it('does not offer quitting as a key to learn', () => {
    expect(plain(80)).not.toContain('ctrl-c');
    expect(plain(80)).not.toContain('quit');
  });

  it('survives an absurdly narrow terminal', () => {
    expect(() => frame(1)).not.toThrow();

    for (const line of frame(1)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(24);
    }
  });
});

function healthy(status: StatusRegistry): void {
  status.set('simulator', 'connected');
  status.set('adsb', 'waiting-for-flight');
  status.set('api', 'connected');
}

function title(
  mutate: (status: StatusRegistry) => void = () => undefined,
): string {
  const status = new StatusRegistry();
  mutate(status);

  return renderTitle(status.snapshot());
}

describe('renderTitle', () => {
  it('leads with whatever is broken', () => {
    expect(title()).toBe('simulator disconnected · Flight Tracker');
  });

  it('names a connection that turned us away', () => {
    expect(
      title((status) => {
        healthy(status);
        status.set('adsb', 'unauthorised');
      }),
    ).toBe('adsb unauthorised · Flight Tracker');
  });

  it('leaves discord off the title however badly it is doing', () => {
    expect(
      title((status) => {
        healthy(status);
        status.set('discord', 'disconnected');
      }),
    ).not.toContain('discord');
  });

  it('treats waiting for a flight as quiet rather than broken', () => {
    expect(title(healthy)).toBe('no flight · Flight Tracker');
  });

  // The switch is the pilot's, but forgetting it is how a flight ends up with
  // no track at all, so the tab says so from behind the simulator.
  it('says so from the tab when transmission is switched off', () => {
    expect(
      title((status) => {
        healthy(status);
        status.setCallsign('SP-LOT');
        status.setTransmitting(false);
      }),
    ).toBe('standby · Flight Tracker');
  });

  it('shows the callsign and how much it has sent once flying', () => {
    expect(
      title((status) => {
        healthy(status);
        status.set('adsb', 'connected');
        status.setCallsign('SP-LOT');
        status.recordAcceptedReport(new Date());
        status.recordAcceptedReport(new Date());
      }),
    ).toBe('SP-LOT · 2 sent · Flight Tracker');
  });
});
