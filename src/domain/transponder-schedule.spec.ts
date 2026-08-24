import { TransponderSchedule } from './transponder-schedule';

describe('TransponderSchedule', () => {
  it('switches transmission on when boarding starts', () => {
    const schedule = new TransponderSchedule();
    schedule.decide('checked_in');

    expect(schedule.decide('boarding_started')).toBe(true);
  });

  it('switches transmission off on block', () => {
    const schedule = new TransponderSchedule();
    schedule.decide('boarding_started');
    schedule.decide('in_cruise');

    expect(schedule.decide('on_block')).toBe(false);
  });

  it('says nothing at all while the flight sits at the same status', () => {
    const schedule = new TransponderSchedule();
    schedule.decide('boarding_started');

    expect(schedule.decide('boarding_started')).toBeNull();
    expect(schedule.decide('boarding_started')).toBeNull();
  });

  it('leaves the switch where the pilot put it between the two edges', () => {
    const schedule = new TransponderSchedule();
    schedule.decide('boarding_started');

    expect(schedule.decide('boarding_finished')).toBeNull();
    expect(schedule.decide('taxiing_out')).toBeNull();
    expect(schedule.decide('in_cruise')).toBeNull();
    expect(schedule.decide('taxiing_in')).toBeNull();
  });

  it('arms itself when the app starts up in the middle of a flight', () => {
    expect(new TransponderSchedule().decide('in_cruise')).toBe(true);
    expect(new TransponderSchedule().decide('taxiing_out')).toBe(true);
  });

  it('stays in standby when the app starts up before boarding, or after it', () => {
    expect(new TransponderSchedule().decide('ready')).toBe(false);
    expect(new TransponderSchedule().decide('on_block')).toBe(false);
    expect(new TransponderSchedule().decide('closed')).toBe(false);
  });

  it('says nothing while there is no flight to follow', () => {
    expect(new TransponderSchedule().decide(null)).toBeNull();
  });

  it('reads the next flight as a flight of its own', () => {
    const schedule = new TransponderSchedule();
    schedule.decide('boarding_started');
    schedule.decide('on_block');
    schedule.decide(null);

    expect(schedule.decide('boarding_started')).toBe(true);
  });

  it('does not re-arm a flight already under way after a status it ignored', () => {
    const schedule = new TransponderSchedule();
    schedule.decide('in_cruise');

    expect(schedule.decide('taxiing_in')).toBeNull();
  });
});
