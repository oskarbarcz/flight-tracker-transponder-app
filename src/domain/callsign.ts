// What the ADS-B service will store under, and what `flight-tracker-api`
// looks a track up by: whitespace removed, upper case.
export function normalizeCallsign(callsign: string): string {
  return callsign.replace(/\s+/g, '').toUpperCase();
}

// Hyphens are in because registrations are callsigns too — SP-LOT is a flight
// the API hands out. The bound only guards the hand-typed override: a callsign
// the API supplies is authoritative whatever it looks like.
const PLAUSIBLE = /^[A-Z0-9-]{2,12}$/;

export function isPlausibleCallsign(callsign: string): boolean {
  return PLAUSIBLE.test(normalizeCallsign(callsign));
}
