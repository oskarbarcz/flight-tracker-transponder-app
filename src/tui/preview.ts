import { CONNECTION_STATES, StatusRegistry } from '../core/status';
import { marker, renderFrame } from './frame';
import { dim, toVisibleWidth } from './style';

export const PREVIEW_COLUMNS = 80;

// One frame drawn from a fixed status, so a compiled build can be asked to
// render without a simulator, a sign-in or even a terminal. CI runs this on
// Windows because it is the only thing that puts the dashboard's box drawing
// and colour through the real executable — the app itself only builds a
// dashboard when stdout is a TTY, which no CI runner gives it.
export function previewFrame(version: string): string {
  const status = new StatusRegistry();

  status.set('api', 'connected');
  status.set('simulator', 'waiting-for-flight');
  status.set('adsb', 'unauthorised');
  status.set('discord', 'disconnected');

  // One known and one not, so section 3 draws both a version and the dash that
  // stands in for one that could not be read.
  status.setServiceVersion('api', '3.24.0');
  status.setServiceVersion('adsb', null);

  status.setCallsign('SP-LOT');
  status.setAircraftIdentifier('A320');
  status.setPresence('Boarding', 'EPWA -> EDDF');
  status.recordAcceptedReport(new Date(0));
  status.setDroppedCount(1);

  return [
    ...renderFrame({
      status: status.snapshot(),
      version,
      columns: PREVIEW_COLUMNS,
      logs: ['preview frame: connected to nothing'],
      showLogs: true,
      prompt: null,
    }),
    '',
    legend(),
  ].join('\n');
}

// There are more states than there are connections to hold them, so the
// glyphs and their colours are listed rather than staged: the frame cannot
// show `standby` and `disconnected` at once, and a marker nobody drew is a
// marker nobody would notice arriving as a letter on an OEM code page.
function legend(): string {
  const markers = CONNECTION_STATES.map(marker).join(' ');

  return toVisibleWidth(
    `  markers ${markers}  ${dim('- all five should be shapes, not letters')}`,
    PREVIEW_COLUMNS,
  );
}
