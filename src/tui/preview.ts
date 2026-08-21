import { CONNECTION_STATES, StatusRegistry } from '../core/status';
import { marker, renderFrame } from './frame';
import { dim, toVisibleWidth } from './style';

export const PREVIEW_COLUMNS = 80;

export function previewFrame(version: string): string {
  const status = new StatusRegistry();

  status.set('api', 'connected');
  status.set('simulator', 'waiting-for-flight');
  status.set('adsb', 'unauthorised');
  status.set('discord', 'disconnected');

  status.setServiceVersion('api', '3.24.0');
  status.setServiceVersion('adsb', null);
  status.setLatestRelease('99.0.0');

  status.setCrew({ name: 'Oskar Barcz', email: 'pilot@example.com' });
  status.setService({
    callsign: 'DLH5540',
    departure: { iata: 'BER', icao: 'EDDB', name: 'Berlin' },
    arrival: { iata: 'WAW', icao: 'EPWA', name: 'Warsaw Chopin' },
    airframe: 'B77W',
    registration: 'SP-LVD',
  });

  status.setCallsign('DLH5540');
  status.setAircraftIdentifier('SP-LVD');
  status.setTransponder('2000', 451.4);
  status.setPresence('Boarding', 'EPWA -> EDDF');
  status.recordAcceptedReport(new Date(Date.UTC(2026, 7, 14, 11, 30, 30)));
  status.setDroppedCount(1);

  status.setFault(
    'adsb',
    'The ADS-B service rejected a position report with 400: squawk must be a string',
  );

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

function legend(): string {
  const markers = CONNECTION_STATES.map(marker).join(' ');

  return toVisibleWidth(
    `  markers ${markers}  ${dim('- all five should be shapes, not letters')}`,
    PREVIEW_COLUMNS,
  );
}
