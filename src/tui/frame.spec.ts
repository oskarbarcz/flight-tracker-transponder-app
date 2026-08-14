import { StatusRegistry } from '../core/status';
import { renderFrame, SIDE_BY_SIDE_COLUMNS } from './frame';

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
      expect(line.length).toBeLessThanOrEqual(80);
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
      'c callsign · l show logs · ctrl-c quit',
    );
    expect(frame(80, undefined, [], true).join('\n')).toContain('l hide logs');
  });

  it('survives an absurdly narrow terminal', () => {
    expect(() => frame(1)).not.toThrow();

    for (const line of frame(1)) {
      expect(line.length).toBeLessThanOrEqual(24);
    }
  });
});
