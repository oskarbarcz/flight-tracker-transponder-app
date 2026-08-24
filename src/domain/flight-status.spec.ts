import {
  FLIGHT_STATUSES,
  STANDBY_FROM,
  TRANSMIT_FROM,
  toFlightStatus,
  transmitsAt,
} from './flight-status';

describe('toFlightStatus', () => {
  it('takes every status the API documents', () => {
    for (const status of FLIGHT_STATUSES) {
      expect(toFlightStatus(status)).toBe(status);
    }
  });

  it('reads a status it does not know as none at all', () => {
    expect(toFlightStatus('airborne')).toBeNull();
    expect(toFlightStatus(undefined)).toBeNull();
    expect(toFlightStatus(7)).toBeNull();
  });
});

describe('transmitsAt', () => {
  it('starts transmitting when boarding starts, not before', () => {
    expect(transmitsAt('created')).toBe(false);
    expect(transmitsAt('ready')).toBe(false);
    expect(transmitsAt('checked_in')).toBe(false);
    expect(transmitsAt(TRANSMIT_FROM)).toBe(true);
  });

  it('keeps transmitting for the whole of the flight', () => {
    expect(transmitsAt('boarding_finished')).toBe(true);
    expect(transmitsAt('taxiing_out')).toBe(true);
    expect(transmitsAt('in_cruise')).toBe(true);
    expect(transmitsAt('taxiing_in')).toBe(true);
  });

  it('stops on block, and stays stopped', () => {
    expect(transmitsAt(STANDBY_FROM)).toBe(false);
    expect(transmitsAt('offboarding_started')).toBe(false);
    expect(transmitsAt('offboarding_finished')).toBe(false);
    expect(transmitsAt('closed')).toBe(false);
  });
});
