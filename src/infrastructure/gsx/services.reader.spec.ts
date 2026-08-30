import boarding from './fixtures/services-boarding.json';
import { readServices } from './services.reader';

const services = readServices(boarding.value);

function find(id: string) {
  return services.find((service) => service.id === id);
}

describe('readServices, against a real boarding captured from GSX', () => {
  it('reads every service GSX published', () => {
    expect(services).toHaveLength(12);
    expect(services.map((service) => service.id).sort()).toEqual([
      'boarding',
      'catering',
      'cleaning',
      'deboarding',
      'deicing',
      'gpu',
      'jetway',
      'lavatory',
      'pushback',
      'refueling',
      'stairs',
      'water',
    ]);
  });

  it('reads the states, in the app own vocabulary', () => {
    expect(find('boarding')?.state).toBe('performing');
    expect(find('jetway')?.state).toBe('completed');
    expect(find('catering')?.state).toBe('requestable');
  });

  it('reads the passengers aboard', () => {
    expect(find('boarding')?.passengers).toEqual({ done: 1, total: 1 });
  });

  it('reads the phase as free text, whatever equipment is in play', () => {
    expect(find('boarding')?.phase).toBe(
      'front loader loading, front train approaching',
    );
    expect(find('jetway')?.phase).toBe('docked');
  });

  it('reads every cargo hold, which GSX reports per hold', () => {
    expect(find('boarding')?.cargo).toEqual([
      { hold: 'front', unit: 'ULDs', done: 16, total: 20 },
      { hold: 'rear', unit: 'ULDs', done: 16, total: 16 },
    ]);
  });

  it('reads the baggage percentage alongside the holds', () => {
    expect(find('boarding')?.bagsPercent).toBe(100);
  });

  it('leaves the operator unstated, because GSX did not name one', () => {
    expect(find('boarding')?.operator).toBeNull();
  });

  it('leaves progress unstated for a service that has none', () => {
    expect(find('gpu')).toMatchObject({
      passengers: null,
      bagsPercent: null,
      cargo: [],
      fuel: null,
    });
  });
});

describe('readServices, on what GSX might publish', () => {
  it('answers nothing for anything that is not a list', () => {
    expect(readServices(undefined)).toEqual([]);
    expect(readServices({ services: [] })).toEqual([]);
    expect(readServices('none')).toEqual([]);
  });

  it('drops a service it does not know, and keeps the rest', () => {
    expect(
      readServices([
        { id: 'SomethingNew', state: 'performing' },
        { id: 'Boarding', state: 'performing' },
      ]).map((service) => service.id),
    ).toEqual(['boarding']);
  });

  it('keeps a service whose state it cannot read, without claiming a state', () => {
    const read = readServices([{ id: 'Boarding', state: 'dawdling' }]);

    expect(read).toHaveLength(1);
    expect(read[0]?.state).toBeNull();
  });

  it('names the operator when GSX does', () => {
    expect(
      readServices([{ id: 'Refueling', operator: 'United Ground Express' }])[0]
        ?.operator,
    ).toBe('United Ground Express');
  });

  it('reads fuel loaded and the aircraft total', () => {
    expect(
      readServices([
        {
          id: 'Refueling',
          state: 'performing',
          detail: {
            fuel: {
              current: 2221,
              target: 5252,
              aircraftTotal: 5252,
              unit: 'kg',
            },
          },
        },
      ])[0]?.fuel,
    ).toEqual({ loaded: 2221, aircraftTotal: 5252, unit: 'kg' });
  });

  it('reads fuel without an aircraft total rather than dropping it', () => {
    expect(
      readServices([
        { id: 'Refueling', detail: { fuel: { current: 100, unit: 'kg' } } },
      ])[0]?.fuel,
    ).toEqual({ loaded: 100, aircraftTotal: null, unit: 'kg' });
  });

  it('ignores a cargo hold with no figures rather than reporting zero', () => {
    expect(
      readServices([
        {
          id: 'Boarding',
          detail: {
            cargo: [{ hold: 'front' }, { hold: 'rear', done: 1, total: 2 }],
          },
        },
      ])[0]?.cargo,
    ).toEqual([{ hold: 'rear', unit: '', done: 1, total: 2 }]);
  });

  it('survives entries that are not objects at all', () => {
    expect(readServices([null, 7, 'Boarding', []])).toEqual([]);
  });
});

describe('the passenger count', () => {
  it('comes from the passenger detail, never from the progress bar', () => {
    const read = readServices([
      {
        id: 'Deboarding',
        state: 'performing',
        detail: { pax: { done: 181, total: 186 } },
        progress: { current: 181, total: 181, unit: 'pax' },
        progressText: '181/181',
      },
    ]);

    expect(read[0]?.passengers).toEqual({ done: 181, total: 186 });
  });
});
