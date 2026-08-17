import type { SimSample } from './sim-sample';

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

export const NO_SQUAWK = '2000';

export function decodeSquawk(transponderCode: number): string | undefined {
  if (!Number.isInteger(transponderCode) || transponderCode < 0) {
    return undefined;
  }

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
