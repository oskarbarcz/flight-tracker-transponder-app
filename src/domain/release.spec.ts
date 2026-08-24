import { isUpdateAvailable, versionedName } from './release';

describe('versionedName', () => {
  it('stamps the version into the file name', () => {
    expect(versionedName('mypreflight-transponder.exe', '0.12.0')).toBe(
      'mypreflight-transponder-0.12.0.exe',
    );
  });

  it('copes with a name that has no extension', () => {
    expect(versionedName('transponder', '1.0.0')).toBe('transponder-1.0.0');
  });
});

describe('isUpdateAvailable', () => {
  it.each([
    ['0.7.0', '0.8.0', true],
    ['0.7.0', '0.7.1', true],
    ['0.7.0', '1.0.0', true],
    ['0.9.0', '0.10.0', true],
    ['0.7.0', '0.7.0', false],
    ['0.8.0', '0.7.0', false],
    ['1.0.0', '0.9.9', false],
  ])('%s against %s is %s', (running, latest, expected) => {
    expect(isUpdateAvailable(running, latest)).toBe(expected);
  });

  it('says nothing when the newest release is unknown', () => {
    expect(isUpdateAvailable('0.7.0', null)).toBe(false);
  });

  it.each([
    ['dev', '9.9.9'],
    ['0.7.0', 'nightly'],
    ['', '1.0.0'],
  ])('stays quiet for the unparseable pair %s / %s', (running, latest) => {
    expect(isUpdateAvailable(running, latest)).toBe(false);
  });
});
