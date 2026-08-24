import {
  type FlightStatus,
  STANDBY_FROM,
  TRANSMIT_FROM,
  transmitsAt,
} from './flight-status';

export class TransponderSchedule {
  private seen: FlightStatus | null = null;

  decide(status: FlightStatus | null): boolean | null {
    const previous = this.seen;
    this.seen = status;

    if (status === null) {
      return null;
    }

    if (previous === null) {
      return transmitsAt(status);
    }

    if (status === previous) {
      return null;
    }

    if (status === TRANSMIT_FROM) {
      return true;
    }

    return status === STANDBY_FROM ? false : null;
  }
}
