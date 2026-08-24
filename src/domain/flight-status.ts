export const FLIGHT_STATUSES = [
  'created',
  'ready',
  'checked_in',
  'boarding_started',
  'boarding_finished',
  'taxiing_out',
  'in_cruise',
  'taxiing_in',
  'on_block',
  'offboarding_started',
  'offboarding_finished',
  'closed',
] as const;

export type FlightStatus = (typeof FLIGHT_STATUSES)[number];

export const TRANSMIT_FROM: FlightStatus = 'boarding_started';

export const STANDBY_FROM: FlightStatus = 'on_block';

const AIRBORNE_WINDOW: FlightStatus[] = [
  'boarding_started',
  'boarding_finished',
  'taxiing_out',
  'in_cruise',
  'taxiing_in',
];

export function toFlightStatus(value: unknown): FlightStatus | null {
  return FLIGHT_STATUSES.find((status) => status === value) ?? null;
}

export function transmitsAt(status: FlightStatus): boolean {
  return AIRBORNE_WINDOW.includes(status);
}
