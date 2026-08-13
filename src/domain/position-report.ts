import type { SimSample } from './sim-sample';

export type PositionReport = {
  callsign: string;
  date: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  groundSpeed?: number;
  track?: number;
  verticalRate?: number;
  squawk?: string;
  isOnGround?: boolean;
  alert: boolean;
  emergency: boolean;
  spi: boolean;
};

const EMERGENCY_SQUAWKS = ['7500', '7600', '7700'];

export function decodeSquawk(transponderCodeBcd: number): string | undefined {
  if (!Number.isInteger(transponderCodeBcd) || transponderCodeBcd < 0) {
    return undefined;
  }

  const digits = transponderCodeBcd.toString(16).padStart(4, '0').slice(-4);

  return /^[0-7]{4}$/.test(digits) ? digits : undefined;
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
    ...numeric('altitude', sample.altitude),
    ...numeric('groundSpeed', sample.groundSpeed),
    ...numeric('track', sample.track),
    ...numeric('verticalRate', sample.verticalRate),
    ...(squawk !== undefined ? { squawk } : {}),
    isOnGround: sample.isOnGround,
    alert: false,
    emergency: isEmergencySquawk(squawk),
    spi: false,
  };
}

export function isPublishable(report: PositionReport): boolean {
  return !(report.latitude === 0 && report.longitude === 0);
}

function numeric<K extends string>(
  key: K,
  value: number,
): Record<K, number> | Record<string, never> {
  return Number.isFinite(value)
    ? ({ [key]: Math.round(value * 1000) / 1000 } as Record<K, number>)
    : {};
}
