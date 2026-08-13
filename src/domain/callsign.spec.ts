import { normalizeCallsign } from './callsign';

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
