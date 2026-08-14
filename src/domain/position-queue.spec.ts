import { PositionQueue } from './position-queue';
import type { PositionReport } from './position-report';

function report(second: number): PositionReport {
  return {
    callsign: 'AAL4908',
    date: new Date(Date.UTC(2026, 7, 13, 12, 0, second)).toISOString(),
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
  };
}

describe('PositionQueue', () => {
  it('hands reports back in the order they were sampled', () => {
    const queue = new PositionQueue();
    queue.add(report(1));
    queue.add(report(2));

    expect(queue.peek()).toEqual(report(1));
    queue.acknowledge();
    expect(queue.peek()).toEqual(report(2));
  });

  it('keeps the newest reports when it overflows', () => {
    const queue = new PositionQueue(3);
    for (const second of [1, 2, 3, 4, 5]) {
      queue.add(report(second));
    }

    expect(queue.size).toBe(3);
    expect(queue.peek()).toEqual(report(3));
    expect(queue.droppedCount).toBe(2);
  });

  it('empties as reports are acknowledged', () => {
    const queue = new PositionQueue();
    queue.add(report(1));
    queue.acknowledge();

    expect(queue.size).toBe(0);
    expect(queue.peek()).toBeUndefined();
  });

  it('preserves the sampled timestamp of a delayed report', () => {
    const queue = new PositionQueue();
    queue.add(report(7));

    expect(queue.peek()?.date).toBe('2026-08-13T12:00:07.000Z');
  });

  it('counts a discarded report as dropped and moves on to the next', () => {
    const queue = new PositionQueue();
    queue.add(report(1));
    queue.add(report(2));

    queue.discard();

    expect(queue.peek()).toEqual(report(2));
    expect(queue.droppedCount).toBe(1);
  });

  it('discards nothing, and counts nothing, when it is already empty', () => {
    const queue = new PositionQueue();

    queue.discard();

    expect(queue.droppedCount).toBe(0);
  });

  it('empties on clear without counting what nobody asked for', () => {
    const queue = new PositionQueue();
    queue.add(report(1));
    queue.add(report(2));

    queue.clear();

    expect(queue.size).toBe(0);
    expect(queue.droppedCount).toBe(0);
  });
});
