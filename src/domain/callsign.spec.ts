import { isPlausibleCallsign, normalizeCallsign } from './callsign';

describe('normalizeCallsign', () => {
  it.each([
    ['AAL4908', 'AAL4908'],
    ['aal4908', 'AAL4908'],
    ['AAL 4908', 'AAL4908'],
    ['  dlh 42 ', 'DLH42'],
    ['LH\t880', 'LH880'],
  ])('normalizes %s the way the API does', (input, expected) => {
    expect(normalizeCallsign(input)).toBe(expected);
  });
});

describe('isPlausibleCallsign', () => {
  it.each([['LH455'], ['AAL4908'], ['SP-LVD'], ['sp-lot'], ['dlh 42']])(
    'accepts %s',
    (callsign) => {
      expect(isPlausibleCallsign(callsign)).toBe(true);
    },
  );

  it.each([[''], ['L'], ['   '], ['LH455!'], ['LOT/1234'], ['ABCDEFGHIJKLM']])(
    'turns %s away before it can stall the queue as a 400',
    (callsign) => {
      expect(isPlausibleCallsign(callsign)).toBe(false);
    },
  );
});
