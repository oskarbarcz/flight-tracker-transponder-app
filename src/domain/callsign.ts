export function normalizeCallsign(callsign: string): string {
  return callsign.replace(/\s+/g, '').toUpperCase();
}
