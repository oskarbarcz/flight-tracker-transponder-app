export function normalizeCallsign(callsign: string): string {
  return callsign.replace(/\s+/g, '').toUpperCase();
}

const PLAUSIBLE = /^[A-Z0-9-]{2,12}$/;

export function isPlausibleCallsign(callsign: string): boolean {
  return PLAUSIBLE.test(normalizeCallsign(callsign));
}
