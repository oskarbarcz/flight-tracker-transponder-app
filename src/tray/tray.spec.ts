import { StatusRegistry } from '../core/status';
import { TRAY_COLOURS, TRAY_SIZE, trayIcon } from './icon';
import { NoTray, TOOLTIP_LIMIT, trayColour, trayTooltip } from './tray';

function snapshot(mutate: (status: StatusRegistry) => void = () => undefined) {
  const status = new StatusRegistry();
  mutate(status);

  return status.snapshot();
}

describe('trayIcon', () => {
  it('writes an icon image Windows can read', () => {
    const icon = trayIcon('transmitting');

    expect(icon.readUInt32LE(0)).toBe(40);
    expect(icon.readInt32LE(4)).toBe(TRAY_SIZE);
    expect(icon.readInt32LE(8)).toBe(TRAY_SIZE * 2);
    expect(icon.readUInt16LE(12)).toBe(1);
    expect(icon.readUInt16LE(14)).toBe(32);
  });

  it('is exactly as long as its header, pixels and mask', () => {
    const maskStride = ((TRAY_SIZE + 31) >> 5) << 2;

    expect(trayIcon('fault')).toHaveLength(
      40 + TRAY_SIZE * TRAY_SIZE * 4 + maskStride * TRAY_SIZE,
    );
  });

  it('paints the middle in the state colour, opaque', () => {
    const icon = trayIcon('fault');
    const centre = 40 + (TRAY_SIZE / 2) * TRAY_SIZE * 4 + (TRAY_SIZE / 2) * 4;

    expect(icon[centre]).toBe(TRAY_COLOURS.fault.blue);
    expect(icon[centre + 1]).toBe(TRAY_COLOURS.fault.green);
    expect(icon[centre + 2]).toBe(TRAY_COLOURS.fault.red);
    expect(icon[centre + 3]).toBe(255);
  });

  it('leaves the corners clear, so the disc is a disc', () => {
    const icon = trayIcon('standby');

    expect(icon[40 + 3]).toBe(0);
  });

  it('gives each state its own colour', () => {
    const colours = new Set(
      (['transmitting', 'standby', 'waiting', 'fault'] as const).map(
        (state) => {
          const icon = trayIcon(state);
          const centre =
            40 + (TRAY_SIZE / 2) * TRAY_SIZE * 4 + (TRAY_SIZE / 2) * 4;

          return `${icon[centre]},${icon[centre + 1]},${icon[centre + 2]}`;
        },
      ),
    );

    expect(colours.size).toBe(4);
  });
});

describe('trayColour', () => {
  it('answers "is something wrong" before "what is it doing"', () => {
    expect(
      trayColour(
        snapshot((status) => {
          status.setTransmitting(true);
          status.setCallsign('LH455');
          status.setFault('simulator', 'the simulator is not running');
        }),
      ),
    ).toBe('fault');
  });

  it('reads standby from the switch', () => {
    expect(
      trayColour(snapshot((status) => status.setTransmitting(false))),
    ).toBe('standby');
  });

  it('distinguishes waiting for a flight from publishing one', () => {
    expect(trayColour(snapshot())).toBe('waiting');
    expect(trayColour(snapshot((status) => status.setCallsign('LH455')))).toBe(
      'transmitting',
    );
  });
});

describe('trayTooltip', () => {
  it('names the build, then what it is doing', () => {
    const tooltip = trayTooltip(
      snapshot((status) => {
        status.setCallsign('LH455');
        status.recordAcceptedReport(new Date());
      }),
      '0.9.0',
    );

    expect(tooltip).toContain('v0.9.0');
    expect(tooltip).toContain('LH455 — 1 sent');
  });

  it('mentions dropped reports only when there are some', () => {
    expect(
      trayTooltip(
        snapshot((status) => {
          status.setCallsign('LH455');
          status.setDroppedCount(3);
        }),
        '0.9.0',
      ),
    ).toContain('3 dropped');

    expect(
      trayTooltip(
        snapshot((status) => status.setCallsign('LH455')),
        '0.9.0',
      ),
    ).not.toContain('dropped');
  });

  it('says standby, and says no flight', () => {
    expect(
      trayTooltip(
        snapshot((status) => status.setTransmitting(false)),
        '0.9.0',
      ),
    ).toContain('STBY');
    expect(trayTooltip(snapshot(), '0.9.0')).toContain('No current flight');
  });

  it('carries the fault, since the icon can only say that there is one', () => {
    expect(
      trayTooltip(
        snapshot((status) =>
          status.setFault('simulator', 'the simulator is not running'),
        ),
        '0.9.0',
      ),
    ).toContain('! simulator: the simulator is not running');
  });

  it('stays inside what a tooltip can hold', () => {
    const tooltip = trayTooltip(
      snapshot((status) => status.setFault('adsb', 'x'.repeat(500))),
      '0.9.0',
    );

    expect(tooltip.length).toBeLessThanOrEqual(TOOLTIP_LIMIT);
    expect(tooltip.endsWith('…')).toBe(true);
  });
});

describe('NoTray', () => {
  it('is what every platform without a notification area gets', () => {
    const tray = new NoTray();

    expect(() => {
      tray.show('fault', 'anything');
      tray.hide();
    }).not.toThrow();
  });
});
