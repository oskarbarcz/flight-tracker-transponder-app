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

  it('puts both modules on the same rows when there is room', () => {
    const lines = frame(80).join('\n');
    const row = lines
      .split('\n')
      .find((line) => line.includes('1 TRANSPONDER'));

    expect(row).toContain('2 DISCORD');
  });

  it('stacks the modules when the terminal is narrow', () => {
    const lines = frame(SIDE_BY_SIDE_COLUMNS - 1);
    const row = lines.find((line) => line.includes('1 TRANSPONDER'));

    expect(row).not.toContain('2 DISCORD');
    expect(lines.some((line) => line.includes('2 DISCORD'))).toBe(true);
  });

  it('reports what the transponder is doing', () => {
    const lines = frame(80, (status) => {
      status.set('simulator', 'connected');
      status.set('adsb', 'connected');
      status.setCallsign('SP123');
      status.setAircraftIdentifier('A320');
      status.recordAcceptedReport(new Date('2026-08-13T20:00:00.000Z'));
    }).join('\n');

    expect(lines).toContain('SP123');
    expect(lines).toContain('A320');
    expect(lines).toContain('sent 1');
  });

  it('reports the published presence', () => {
    const lines = frame(80, (status) => {
      status.set('discord', 'connected');
      status.setPresence('Checked in, takeoff at 13:15 UTC', 'BOS -> PHL');
    }).join('\n');

    expect(lines).toContain('BOS -> PHL');
    expect(lines).toContain('Checked in');
  });

  it('hides the log pane until it is asked for', () => {
    const logs = ['20:14:22 WARN  simulator connection failed'];

    expect(frame(80, undefined, logs, false).join('\n')).not.toContain(
      'simulator connection failed',
    );
    expect(frame(80, undefined, logs, true).join('\n')).toContain(
      'simulator connection failed',
    );
  });

  it('shows only the most recent log lines', () => {
    const logs = Array.from({ length: 40 }, (_, index) => `line-${index}`);
    const lines = frame(80, undefined, logs, true).join('\n');

    expect(lines).toContain('line-39');
    expect(lines).not.toContain('line-0 ');
  });

  it('tells the pilot how to reach the logs and how to quit', () => {
    expect(frame(80).join('\n')).toContain(
      's sign in · c callsign · t standby · l show logs · ctrl-c quit',
    );
    expect(frame(80, undefined, [], true).join('\n')).toContain('l hide logs');
  });

  // Losing the session used to leave `api ! unauthorised` on screen with
  // nothing on the frame saying how to get out of it.
  it('names the sign-in key, which is the only way out of unauthorised', () => {
    expect(
      frame(80, (status) => status.set('api', 'unauthorised')).join('\n'),
    ).toContain('s sign in');
  });

  it('offers the opposite of whatever the transponder is doing', () => {
    expect(
      frame(80, (status) => status.set('adsb', 'standby')).join('\n'),
    ).toContain('t transmit');
    expect(
      frame(80, (status) => status.set('adsb', 'connected')).join('\n'),
    ).toContain('t standby');
  });

  it('shows standby as its own state rather than as a fault', () => {
    process.env.NO_COLOR = '1';

    try {
      const lines = frame(80, (status) => status.set('adsb', 'standby')).join(
        '\n',
      );

      expect(lines).toContain('adsb      ◌ standby');
      expect(lines).not.toContain('adsb      ○');
    } finally {
      delete process.env.NO_COLOR;
    }
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
        status.set('adsb', 'standby');
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
