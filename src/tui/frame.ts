import type {
  ConnectionName,
  ConnectionState,
  StatusSnapshot,
} from '../core/status';
import {
  amber,
  bold,
  cyan,
  dim,
  green,
  red,
  type Style,
  toVisibleWidth,
  visibleWidth,
} from './style';

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
  standby: '◌',
};

// Kept apart from the glyphs so the colour is chosen per render rather than
// once at import, which is what lets NO_COLOR be honoured at all.
const MARKER_COLOURS: Record<ConnectionState, Style> = {
  connected: green,
  disconnected: red,
  unauthorised: amber,
  'waiting-for-flight': cyan,
  standby: dim,
};

export function marker(state: ConnectionState): string {
  return MARKER_COLOURS[state](MARKERS[state]);
}

export type FramePrompt = {
  label: string;
  value: string;
  hint: string;
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
    indent(dim('═'.repeat(width - 4)), width),
    '',
    ...modules(status, width),
    // Flush against the modules above, the way the two of them stack on a
    // narrow terminal. The standalone `api` line that used to sit above the
    // boxes is gone: section 3 states the same thing and states it with a
    // version beside it.
    ...services(status, input.version)(width),
    '',
  ];

  if (input.showLogs) {
    lines.push(...logPane(input.logs, width), '');
  }

  lines.push(
    indent(
      input.prompt === null
        ? hint(input.showLogs, status.connections.adsb === 'standby')
        : promptLine(input.prompt),
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

  // Ahead of the callsign, because a pilot who left the switch off and went
  // flying wants to learn that from the tab rather than from an empty track.
  if (status.connections.adsb === 'standby') {
    return `standby · ${TITLE_SUFFIX}`;
  }

  if (status.callsign === null) {
    return `no flight · ${TITLE_SUFFIX}`;
  }

  return `${status.callsign} · ${status.publishedCount} sent · ${TITLE_SUFFIX}`;
}

function promptLine(prompt: FramePrompt): string {
  return `${prompt.label} › ${bold(prompt.value)}${cyan('█')}  ${dim(prompt.hint)}`;
}

function wordmark(width: number, version: string): string {
  const name = bold('FLIGHT TRACKER · transponder');
  const tag = dim(`v${version}`);
  const gap = width - 4 - visibleWidth(name) - visibleWidth(tag);

  return gap < 1
    ? indent(toVisibleWidth(name, width - 4), width)
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
    `simulator ${marker(connections.simulator)} ${connections.simulator}`,
    `adsb      ${marker(connections.adsb)} ${connections.adsb}`,
    `${callsign === null ? '—' : bold(callsign)} · ${aircraftIdentifier ?? '—'}`,
    `sent ${status.publishedCount}  dropped ${status.droppedCount}`,
  ];
}

// The two services and this app, each with what it is doing and what it is
// running. Full width and below the modules, because the versions push a row
// past what half a terminal holds.
function services(
  status: StatusSnapshot,
  version: string,
): (width: number) => string[] {
  return box('3 SERVICES', [
    serviceRow(
      'flight-tracker',
      marker(status.connections.api),
      status.connections.api,
      status.serviceVersions.api,
    ),
    serviceRow(
      'adsb',
      marker(status.connections.adsb),
      status.connections.adsb,
      status.serviceVersions.adsb,
    ),
    // Not a connection, so not a ConnectionState: if this row is on the screen
    // then this app is running, and the only thing worth saying is which build.
    serviceRow('transponder', green('●'), 'running', version),
  ]);
}

// Padded rather than right-aligned, so the row can be built without knowing how
// wide the box will be. The state column fits the longest state there is.
const SERVICE_LABEL_WIDTH = 15;
const SERVICE_STATE_WIDTH = 19;

function serviceRow(
  label: string,
  glyph: string,
  state: string,
  version: string | null,
): string {
  return (
    `${label.padEnd(SERVICE_LABEL_WIDTH)}${glyph} ` +
    `${state.padEnd(SERVICE_STATE_WIDTH)}` +
    `${dim(version === null ? '—' : `v${version}`)}`
  );
}

function discordRows(status: StatusSnapshot): string[] {
  const { connections, presenceState, presenceDetails } = status;

  return [
    `client   ${marker(connections.discord)} ${connections.discord}`,
    `presence ${presenceDetails === null ? '—' : presenceDetails}`,
    presenceState ?? '',
    '',
  ];
}

function box(title: string, rows: string[]): (width: number) => string[] {
  return (width) => {
    const inner = width - 2;

    // Composed segment by segment rather than wrapping the whole border in
    // one style: a nested reset closes the outer style early and leaks the
    // rest of the line.
    const head = `${dim('─')} ${bold(title)} `;

    return [
      `${dim('┌')}${headingRule(head, inner)}${dim('┐')}`,
      ...rows.map(
        (row) => `${dim('│')}${toVisibleWidth(` ${row}`, inner)}${dim('│')}`,
      ),
      dim(`└${'─'.repeat(Math.max(inner, 0))}┘`),
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
    indent(dim('─'.repeat(width - 4)), width),
    ...[...recent, ...padding].map((line) =>
      indent(toVisibleWidth(line, width - 4), width),
    ),
  ];
}

// Every recovery the pilot has is a single letter, so every letter is on the
// screen: an app that reports `api ! unauthorised` and keeps the way back in
// to itself is the same as having no way back in. Quitting is not among them —
// ctrl-c still works, it is just not something the frame needs to teach.
function hint(showLogs: boolean, standby: boolean): string {
  return dim(
    `s sign in · c callsign · t ${standby ? 'transmit' : 'standby'} · ` +
      `l ${showLogs ? 'hide' : 'show'} logs`,
  );
}

function indent(text: string, width: number): string {
  return toVisibleWidth(`  ${text}`, width);
}

function headingRule(head: string, inner: number): string {
  const width = visibleWidth(head);

  return width > inner
    ? toVisibleWidth(head, inner)
    : `${head}${dim('─'.repeat(inner - width))}`;
}
