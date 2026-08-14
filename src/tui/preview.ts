import { StatusRegistry } from '../core/status';
import { renderFrame } from './frame';

export const PREVIEW_COLUMNS = 80;

// One frame drawn from a fixed status, so a compiled build can be asked to
// render without a simulator, a sign-in or even a terminal. CI runs this on
// Windows because it is the only thing that puts the dashboard's box drawing
// and colour through the real executable — the app itself only builds a
// dashboard when stdout is a TTY, which no CI runner gives it.
export function previewFrame(version: string): string {
  const status = new StatusRegistry();

  // One connection per state, so every marker and every colour appears.
  status.set('api', 'connected');
  status.set('simulator', 'waiting-for-flight');
  status.set('adsb', 'unauthorised');
  status.set('discord', 'disconnected');

  status.setCallsign('SP-LOT');
  status.setAircraftIdentifier('A320');
  status.setPresence('Boarding', 'EPWA -> EDDF');
  status.recordAcceptedReport(new Date(0));
  status.setDroppedCount(1);

  return renderFrame({
    status: status.snapshot(),
    version,
    columns: PREVIEW_COLUMNS,
    logs: ['preview frame: connected to nothing'],
    showLogs: true,
    prompt: null,
  }).join('\n');
}
