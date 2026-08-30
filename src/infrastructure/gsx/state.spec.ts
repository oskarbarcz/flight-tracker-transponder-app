import { DISCARDED_KEYS, GsxState } from './state';

describe('GsxState', () => {
  it('holds what a snapshot carries', () => {
    const state = new GsxState();

    state.replaceAll({ services: [1], parking: 'Gate 20A' });

    expect(state.get('services')).toEqual([1]);
    expect(state.get('parking')).toBe('Gate 20A');
  });

  it('replaces a key outright, because GSX resends the whole value', () => {
    const state = new GsxState();

    state.replaceAll({ services: [{ id: 'Boarding' }, { id: 'Catering' }] });
    state.replace('services', [{ id: 'Boarding' }]);

    expect(state.get('services')).toEqual([{ id: 'Boarding' }]);
  });

  it('forgets a key GSX patches to null, rather than keeping the old value', () => {
    const state = new GsxState();

    state.replaceAll({ prompt: { question: 'ready?' } });
    state.replace('prompt', null);

    expect(state.get('prompt')).toBeUndefined();
  });

  it('drops a key a later snapshot no longer carries', () => {
    const state = new GsxState();

    state.replaceAll({ services: [1], menu: {} });
    state.replaceAll({ services: [2] });

    expect(state.keys()).toEqual(['services']);
  });

  it.each(DISCARDED_KEYS)('never retains %s', (key) => {
    const state = new GsxState();

    state.replaceAll({ [key]: 'x'.repeat(1000), services: [] });
    state.replace(key, 'x'.repeat(1000));

    expect(state.get(key)).toBeUndefined();
    expect(state.keys()).toEqual(['services']);
  });

  it('discards the stand database, which is megabytes this app never reads', () => {
    expect(DISCARDED_KEYS).toContain('handlerData');
  });

  it('forgets everything when cleared', () => {
    const state = new GsxState();

    state.replaceAll({ services: [1] });
    state.clear();

    expect(state.keys()).toEqual([]);
  });
});
