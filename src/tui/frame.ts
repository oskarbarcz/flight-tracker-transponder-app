import type {
  ConnectionName,
  ConnectionState,
  StatusSnapshot,
} from '../core/status';

export const MIN_COLUMNS = 24;
export const SIDE_BY_SIDE_COLUMNS = 56;
export const LOG_ROWS = 8;

const TITLE_SUFFIX = 'Flight Tracker';

// Discord is deliberately absent: presence failing is worth a marker on the
// dashboard, but it is not worth shouting about from a background tab.
const TITLE_CRITICAL: ConnectionName[] = ['simulator', 'adsb', 'api'];
const TITLE_BROKEN: ConnectionState[] = ['disconnected', 'unauthorised'];

const MARKERS: Record<ConnectionState, string> = {
  connected: '●',
  disconnected: '○',
  unauthorised: '!',
  'waiting-for-flight': '~',
};

export type FramePrompt = {
  label: string;
  value: string;
};

export type FrameInput = {
  status: StatusSnapshot;
  version: string;
  columns: number;
  logs: string[];
  showLogs: boolean;
  prompt: FramePrompt | null;
};

export function renderFrame(input: FrameInput): string[] {
  const width = Math.max(input.columns, MIN_COLUMNS);
  const status = input.status;

  const lines = [
    '',
    wordmark(width, input.version),
    indent('═'.repeat(width - 4), width),
    indent(
      `api ${MARKERS[status.connections.api]} ${status.connections.api}`,
      width,
    ),
    '',
    ...modules(status, width),
    '',
  ];

  if (input.showLogs) {
    lines.push(...logPane(input.logs, width), '');
  }

  lines.push(
    indent(
      input.prompt === null ? hint(input.showLogs) : promptLine(input.prompt),
      width,
    ),
  );

  return lines;
}

// What the terminal puts in its tab or titlebar, which is all the pilot sees
// once the window is behind the simulator. Trouble outranks progress: a feed
// that has stopped is the one thing worth noticing from over there.
export function renderTitle(status: StatusSnapshot): string {
  // Not `!== 'connected'`: waiting-for-flight is where adsb sits whenever
  // nobody is flying, which is the quiet case below rather than a fault.
  const broken = TITLE_CRITICAL.find((name) =>
    TITLE_BROKEN.includes(status.connections[name]),
  );

  if (broken !== undefined) {
    return `${broken} ${status.connections[broken]} · ${TITLE_SUFFIX}`;
  }

  if (status.callsign === null) {
    return `no flight · ${TITLE_SUFFIX}`;
  }

  return `${status.callsign} · ${status.publishedCount} sent · ${TITLE_SUFFIX}`;
}

function promptLine(prompt: FramePrompt): string {
  return `${prompt.label} › ${prompt.value}█  enter to set · empty follows the flight · esc cancels`;
}

function wordmark(width: number, version: string): string {
  const name = 'FLIGHT TRACKER · transponder';
  const tag = `v${version}`;
  const gap = width - 4 - name.length - tag.length;

  return gap < 1
    ? indent(toWidth(name, width - 4), width)
    : indent(`${name}${' '.repeat(gap)}${tag}`, width);
}

function modules(status: StatusSnapshot, width: number): string[] {
  const transponder = box('1 TRANSPONDER', transponderRows(status));
  const discord = box('2 DISCORD', discordRows(status));

  if (width < SIDE_BY_SIDE_COLUMNS) {
    return [...transponder(width), ...discord(width)];
  }

  const left = Math.floor(width / 2);

  return join(transponder(left), discord(width - left));
}

function transponderRows(status: StatusSnapshot): string[] {
  const { connections, callsign, aircraftIdentifier } = status;

  return [
    `simulator ${MARKERS[connections.simulator]} ${connections.simulator}`,
    `adsb      ${MARKERS[connections.adsb]} ${connections.adsb}`,
    `${callsign ?? '—'} · ${aircraftIdentifier ?? '—'}`,
    `sent ${status.publishedCount}  dropped ${status.droppedCount}`,
  ];
}

function discordRows(status: StatusSnapshot): string[] {
  const { connections, presenceState, presenceDetails } = status;

  return [
    `client   ${MARKERS[connections.discord]} ${connections.discord}`,
    `presence ${presenceDetails === null ? '—' : presenceDetails}`,
    presenceState ?? '',
    '',
  ];
}

function box(title: string, rows: string[]): (width: number) => string[] {
  return (width) => {
    const inner = width - 2;
    const head = `─ ${title} `;

    return [
      `┌${headingRule(head, inner)}┐`,
      ...rows.map((row) => `│${toWidth(` ${row}`, inner)}│`),
      `└${'─'.repeat(Math.max(inner, 0))}┘`,
    ];
  };
}

function join(left: string[], right: string[]): string[] {
  const height = Math.max(left.length, right.length);
  const lines: string[] = [];

  for (let row = 0; row < height; row += 1) {
    lines.push(`${left[row] ?? ''}${right[row] ?? ''}`);
  }

  return lines;
}

function logPane(logs: string[], width: number): string[] {
  const recent = logs.slice(-LOG_ROWS);
  const padding = Array.from({ length: LOG_ROWS - recent.length }, () => '');

  return [
    indent('─'.repeat(width - 4), width),
    ...[...recent, ...padding].map((line) =>
      indent(toWidth(line, width - 4), width),
    ),
  ];
}

function hint(showLogs: boolean): string {
  return `c callsign · l ${showLogs ? 'hide' : 'show'} logs · ctrl-c quit`;
}

function indent(text: string, width: number): string {
  return toWidth(`  ${text}`, width);
}

function toWidth(text: string, length: number): string {
  const room = Math.max(length, 0);

  return text.length > room
    ? text.slice(0, room)
    : text + ' '.repeat(room - text.length);
}

function headingRule(head: string, inner: number): string {
  return head.length > inner
    ? head.slice(0, inner)
    : head + '─'.repeat(inner - head.length);
}
