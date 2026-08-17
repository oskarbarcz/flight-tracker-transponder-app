import {
  decodeSquawk,
  isEmergencySquawk,
  isPublishable,
  NO_SQUAWK,
  toPositionReport,
} from './position-report';
import type { SimSample } from './sim-sample';

function sample(overrides: Partial<SimSample> = {}): SimSample {
  return {
    sampledAt: new Date('2026-08-13T12:00:00.000Z'),
    latitude: 42.36454,
    longitude: -71.01663,
    altitude: 35000,
    groundSpeed: 456,
    track: 271.5,
    verticalRate: -12,
    isOnGround: false,
    transponderCodeBcd: 0x1200,
    aircraftIdentifier: 'N720AN',
    ...overrides,
  };
}

describe('decodeSquawk', () => {
  it.each([
    [0x1200, '1200'],
    [0x7000, '7000'],
    [0x2000, '2000'],
    [0x0, '0000'],
    [0x7777, '7777'],
    [0x1000, '1000'],
    [0x0021, '0021'],
  ])('decodes BCD %s', (code, expected) => {
    expect(decodeSquawk(code)).toBe(expected);
  });

  it('reads the BCD spelling first, since that is what MSFS documents', () => {
    expect(decodeSquawk(4608)).not.toBe('4608');
    expect(decodeSquawk(0x1200)).toBe('1200');
  });

  it.each([
    [4744, '4744'],
    [7000, '7000'],
  ])('falls back to the decimal spelling for %s', (code, expected) => {
    expect(decodeSquawk(code)).toBe(expected);
  });

  it.each([[0x9999], [-1], [1.5]])(
    'reports nothing for the impossible code %s',
    (code) => {
      expect(decodeSquawk(code)).toBeUndefined();
    },
  );
});

describe('toPositionReport', () => {
  it('maps a sample onto the ADS-B contract', () => {
    expect(toPositionReport(sample(), 'AAL4908')).toEqual({
      callsign: 'AAL4908',
      date: '2026-08-13T12:00:00.000Z',
      latitude: 42.36454,
      longitude: -71.01663,
      altitude: 35000,
      groundSpeed: 456,
      track: 271.5,
      verticalRate: -12,
      squawk: '1200',
      isOnGround: false,
      alert: false,
      emergency: false,
      spi: false,
    });
  });

  it.each([
    [0x7500, true],
    [0x7600, true],
    [0x7700, true],
    [0x1200, false],
    [0x7000, false],
  ])('derives emergency from squawk %s', (code, expected) => {
    const report = toPositionReport(
      sample({ transponderCodeBcd: code }),
      'AAL4908',
    );

    expect(report.emergency).toBe(expected);
  });

  it('never asserts alert or ident', () => {
    const report = toPositionReport(sample(), 'AAL4908');

    expect(report.alert).toBe(false);
    expect(report.spi).toBe(false);
  });

  it('publishes the vertical rate the previous feeder dropped', () => {
    const report = toPositionReport(sample({ verticalRate: -1850 }), 'AAL4908');

    expect(report.verticalRate).toBe(-1850);
  });

  it('sends every field the contract requires, whatever the simulator withheld', () => {
    const report = toPositionReport(
      sample({
        groundSpeed: Number.NaN,
        verticalRate: Number.NaN,
        transponderCodeBcd: 0x9999,
      }),
      'AAL4908',
    );

    for (const field of [
      'callsign',
      'date',
      'latitude',
      'longitude',
      'altitude',
      'groundSpeed',
      'track',
      'verticalRate',
      'squawk',
      'isOnGround',
      'alert',
      'emergency',
      'spi',
    ]) {
      expect(report).toHaveProperty(field);
    }
  });

  it('sends a zero for a value the simulator did not supply', () => {
    const report = toPositionReport(
      sample({ groundSpeed: Number.NaN, verticalRate: Number.NaN }),
      'AAL4908',
    );

    expect(report.groundSpeed).toBe(0);
    expect(report.verticalRate).toBe(0);
    expect(report.altitude).toBe(35000);
  });

  it('falls back to 2000, the code for an aircraft with no assignment', () => {
    expect(NO_SQUAWK).toBe('2000');
  });

  it('squawks the unknown code when the transponder value makes no sense', () => {
    const report = toPositionReport(
      sample({ transponderCodeBcd: 0x9999 }),
      'AAL4908',
    );

    expect(report.squawk).toBe(NO_SQUAWK);
    expect(report.emergency).toBe(false);
  });

  it('reports the on-ground state as the simulator states it', () => {
    const report = toPositionReport(
      sample({ isOnGround: true, altitude: 19 }),
      'AAL4908',
    );

    expect(report.isOnGround).toBe(true);
  });
});

describe('isEmergencySquawk', () => {
  it.each([['7500'], ['7600'], ['7700']])('treats %s as emergency', (code) => {
    expect(isEmergencySquawk(code)).toBe(true);
  });

  it.each([['1200'], ['7000'], [undefined]])(
    'treats %s as ordinary',
    (code) => {
      expect(isEmergencySquawk(code)).toBe(false);
    },
  );
});

describe('isPublishable', () => {
  it('rejects the null island the API filters out anyway', () => {
    const report = toPositionReport(
      sample({ latitude: 0, longitude: 0 }),
      'AAL4908',
    );

    expect(isPublishable(report)).toBe(false);
  });

  it('accepts a real position', () => {
    expect(isPublishable(toPositionReport(sample(), 'AAL4908'))).toBe(true);
  });
});
