import { redact } from './logger';

describe('redact', () => {
  it('hides a bearer token', () => {
    expect(redact('Authorization: Bearer eyJhbGciOi.J9.abc-_123')).toBe(
      'Authorization: Bearer [redacted]',
    );
  });

  it('hides tokens and passwords in serialized payloads', () => {
    expect(
      redact('{"refreshToken":"abc123","password":"P@$$w0rd","other":"kept"}'),
    ).toBe(
      '{"refreshToken":"[redacted]","password":"[redacted]","other":"kept"}',
    );
  });

  it('leaves ordinary messages alone', () => {
    expect(redact('published 42 reports for AAL4908')).toBe(
      'published 42 reports for AAL4908',
    );
  });
});
