import type { SimSample } from './sim-sample';

// Every field is required, because the service's `CreatePositionRequest` says
// so: it lists all thirteen under `required`, and a report missing one is
// answered 400 rather than stored. That is worth stating in the type, since
// the alternative — omitting what the simulator did not supply — reads as the
// tidier choice right up until the whole feed stops.
export type PositionReport = {
  callsign: string;
  date: string;
  latitude: number;
  longitude: number;
  altitude: number;
  groundSpeed: number;
  track: number;
  verticalRate: number;
  squawk: string;
  isOnGround: boolean;
  alert: boolean;
  emergency: boolean;
  spi: boolean;
};

const EMERGENCY_SQUAWKS = ['7500', '7600', '7700'];

// What travels when the transponder value could not be read as a squawk at
// all. 2000 is the ICAO conventional code for an aircraft that has not been
// assigned one, so a controller reading it draws the right conclusion — the
// code is not known — rather than a wrong one.
export const NO_SQUAWK = '2000';

export function decodeSquawk(transponderCode: number): string | undefined {
  if (!Number.isInteger(transponderCode) || transponderCode < 0) {
    return undefined;
  }

  // MSFS documents `TRANSPONDER CODE:1` as binary-coded decimal — squawk 1200
  // arrives as 0x1200 — and that spelling is tried first for exactly that
  // reason. Not every aircraft honours it though: some hand back the plain
  // decimal, whose BCD reading is either a wrong squawk or no squawk at all,
  // and no squawk used to cost the whole report.
  return (
    octalDigits(transponderCode.toString(16)) ??
    octalDigits(transponderCode.toString(10))
  );
}

export function isEmergencySquawk(squawk: string | undefined): boolean {
  return squawk !== undefined && EMERGENCY_SQUAWKS.includes(squawk);
}

export function toPositionReport(
  sample: SimSample,
  callsign: string,
): PositionReport {
  const squawk = decodeSquawk(sample.transponderCodeBcd);

  return {
    callsign,
    date: sample.sampledAt.toISOString(),
    latitude: sample.latitude,
    longitude: sample.longitude,
    altitude: numeric(sample.altitude),
    groundSpeed: numeric(sample.groundSpeed),
    track: numeric(sample.track),
    verticalRate: numeric(sample.verticalRate),
    squawk: squawk ?? NO_SQUAWK,
    isOnGround: sample.isOnGround,
    alert: false,
    // Derived from what was actually decoded, so the fallback squawk cannot
    // declare an emergency the aircraft never squawked.
    emergency: isEmergencySquawk(squawk),
    spi: false,
  };
}

export function isPublishable(report: PositionReport): boolean {
  return !(report.latitude === 0 && report.longitude === 0);
}

function octalDigits(digits: string): string | undefined {
  const four = digits.padStart(4, '0').slice(-4);

  return /^[0-7]{4}$/.test(four) ? four : undefined;
}

function numeric(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}
