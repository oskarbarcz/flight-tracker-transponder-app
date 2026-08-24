import type { StatusSnapshot } from '../../application/status';
import type { TrayColour } from './icon';

export interface Tray {
  show(colour: TrayColour, tooltip: string): void;
  hide(): void;
}

export class NoTray implements Tray {
  show(_colour: TrayColour, _tooltip: string): void {
    return;
  }

  hide(): void {
    return;
  }
}

export function trayColour(status: StatusSnapshot): TrayColour {
  const faulted = Object.values(status.faults).some((fault) => fault !== null);

  if (faulted) {
    return 'fault';
  }

  if (!status.transmitting) {
    return 'standby';
  }

  return status.callsign === null ? 'waiting' : 'transmitting';
}

export function trayTooltip(status: StatusSnapshot, version: string): string {
  const lines = [`MyPreflight transponder v${version}`];

  if (!status.transmitting) {
    lines.push('STBY — not transmitting');
  } else if (status.callsign === null) {
    lines.push('No current flight');
  } else {
    lines.push(
      `${status.callsign} — ${status.publishedCount} sent${
        status.droppedCount > 0 ? `, ${status.droppedCount} dropped` : ''
      }`,
    );
  }

  const fault = Object.entries(status.faults).find(
    ([, message]) => message !== null,
  );

  if (fault !== undefined) {
    lines.push(`! ${fault[0]}: ${fault[1] ?? ''}`);
  }

  return clamp(lines.join('\n'));
}

export const TOOLTIP_LIMIT = 127;

function clamp(tooltip: string): string {
  return tooltip.length <= TOOLTIP_LIMIT
    ? tooltip
    : `${tooltip.slice(0, TOOLTIP_LIMIT - 1)}…`;
}
