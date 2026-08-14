import type {
  ConnectionName,
  ConnectionState,
  CurrentService,
  ServiceAirport,
  StatusSnapshot,
} from '../core/status';
import { isUpdateAvailable } from '../api/release.client';
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
    ...pair(crew(status), currentService(status), width),
    ...pair(transponder(status), comms(status), width),
    ...serviceStatus(status, input.version)(width),
    '',
    ...faultLines(status, width),
  ];

  if (input.showLogs) {
    lines.push(...logPane(input.logs, width), '');
  }

  lines.push(
    indent(
      input.prompt === null ? hint(input) : promptLine(input.prompt),
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
  if (!status.transmitting) {
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

// Two half-width boxes, or stacked when half a terminal is too narrow to read.
function pair(
  left: (width: number) => string[],
  right: (width: number) => string[],
  width: number,
): string[] {
  if (width < SIDE_BY_SIDE_COLUMNS) {
    return [...left(width), ...right(width)];
  }

  const half = Math.floor(width / 2);

  return join(left(half), right(width - half));
}

function crew(status: StatusSnapshot): (width: number) => string[] {
  const { crew: member } = status;

  return box('1 CREW', [
    member === null ? dim('not signed in') : bold(member.name),
    member === null ? dim('press s to sign in') : member.email,
  ]);
}

function currentService(status: StatusSnapshot): (width: number) => string[] {
  const { service } = status;

  if (service === null) {
    return box('2 CRNT SERVICE', [dim('no current flight'), '']);
  }

  return box('2 CRNT SERVICE', (inner) => {
    // The airport names are the first thing to go. Half of an eighty-column
    // terminal does not hold `DLH5540 * [BER] Berlin -> [WAW] Warsaw Chopin`,
    // and a name cut off mid-word tells a pilot less than no name at all — the
    // codes are what identifies the airport.
    const full = `${bold(service.callsign)} ${dim('*')} ${route(service, true)}`;
    const head =
      visibleWidth(full) <= inner
        ? full
        : `${bold(service.callsign)} ${dim('*')} ${route(service, false)}`;

    return [
      head,
      `airframe: ${field(service.airframe)} ${dim('*')} tail: ${field(service.registration)}`,
    ];
  });
}

function route(service: CurrentService, withNames: boolean): string {
  return (
    `${airport(service.departure, withNames)} ${dim('->')} ` +
    `${airport(service.arrival, withNames)}`
  );
}

function airport(place: ServiceAirport | null, withName: boolean): string {
  if (place === null) {
    return dim('[—]');
  }

  const code = field(place.iata ?? place.icao);

  return withName && place.name !== null ? `${code} ${place.name}` : code;
}

function transponder(status: StatusSnapshot): (width: number) => string[] {
  return box('3 XPNDR', [
    // The link that feeds every other row here. Dropping it from the frame
    // altogether left a pilot whose simulator would not connect with nothing on
    // screen to say so.
    `sim:    ${marker(status.connections.simulator)} ${status.connections.simulator}`,
    `tail:   ${field(status.aircraftIdentifier)}`,
    `squawk: ${field(status.squawk)}`,
    // A transponder reports its mode, not its network: MODE C is what it is
    // doing when it is switched on, STBY when the pilot has switched it off.
    `mode:   ${mode(status)}`,
    `spd:    ${status.groundSpeedKt === null ? dim('—') : `${Math.round(status.groundSpeedKt)}kt`}`,
    `call:   ${lastCall(status.lastAcceptedReportAt)}`,
  ]);
}

function mode(status: StatusSnapshot): string {
  return status.transmitting ? `[${green('MODE C')}]` : `[${dim('STBY')}]`;
}

// The zulu clock the rest of aviation uses, and seconds because the whole point
// of the row is telling a feed that stopped from one that is a second old.
function lastCall(at: Date | null): string {
  if (at === null) {
    return dim('—');
  }

  const pad = (value: number): string => String(value).padStart(2, '0');

  return `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}z`;
}

function comms(status: StatusSnapshot): (width: number) => string[] {
  const { connections, presenceState, presenceDetails } = status;
  const publishing = presenceState !== null || presenceDetails !== null;

  return box('4 COMMS', [
    `discord:  ${marker(connections.discord)} ${connections.discord}`,
    `presence: ${publishing ? `[${green('ON')}]` : `[${dim('OFF')}]`}`,
    presenceDetails === null ? '' : dim(presenceDetails),
    presenceState === null ? '' : dim(presenceState),
    '',
    '',
  ]);
}

// One line, because three services and their versions is a sentence rather than
// a table, and reading it left to right is how anyone reports a fault.
function serviceStatus(
  status: StatusSnapshot,
  version: string,
): (width: number) => string[] {
  const update = isUpdateAvailable(version, status.latestRelease);

  return box('5 STATUS', [
    [
      `adsb: ${health(status.connections.adsb, status.serviceVersions.adsb)}`,
      `tracker: ${health(status.connections.api, status.serviceVersions.api)}`,
      update
        ? `xpndr: [${amber(`UPDATE to v${status.latestRelease} possible`)}]`
        : `xpndr: [${green('OK')}, v${version}]`,
    ].join(dim(' · ')),
  ]);
}

// `standby` and `waiting-for-flight` are this app's states, not the service's:
// from here the service answered, so it is up.
function health(state: ConnectionState, version: string | null): string {
  const suffix = version === null ? '' : `, v${version}`;

  if (state === 'unauthorised') {
    return `[${amber('UNAUTHORISED')}${suffix}]`;
  }

  if (state === 'disconnected') {
    return `[${red('OFFLINE')}${suffix}]`;
  }

  return `[${green('OK')}${suffix}]`;
}

function field(value: string | null): string {
  return value === null ? dim('[—]') : `[${bold(value)}]`;
}

// Rows may be a plain list or a function of the room available, which is what
// lets a box that has more to say than fits choose what to drop.
function box(
  title: string,
  rows: string[] | ((inner: number) => string[]),
): (width: number) => string[] {
  return (width) => {
    const inner = width - 2;
    const content = typeof rows === 'function' ? rows(inner - 1) : rows;

    // Composed segment by segment rather than wrapping the whole border in
    // one style: a nested reset closes the outer style early and leaks the
    // rest of the line.
    const head = `${dim('─')} ${bold(title)} `;

    return [
      `${dim('┌')}${headingRule(head, inner)}${dim('┐')}`,
      ...content.map(
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

// The key was the same colour as the words around it, which made the whole line
// read as prose rather than as a list of things to press. Brackets and a bright
// key; the label stays dim so the eye lands on the letter.
function key(letter: string, label: string, enabled = true): string {
  return enabled
    ? `[${bold(letter)}] ${dim(label)}`
    : dim(`[${letter}] ${label}`);
}

function hint(input: FrameInput): string {
  const { status } = input;
  const signedIn = status.crew !== null;

  return [
    signedIn
      ? // Signing out mid-transmission would strand a flight halfway through
        // its track, so it waits for the transponder to be switched off.
        key('s', 'sign out', !status.transmitting)
      : key('s', 'sign in'),
    key('t', 'toggle xpndr mode'),
    key('c', 'custom callsign'),
    key('d', input.showLogs ? 'hide debug' : 'debug'),
  ].join(dim(' · '));
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

// Whichever connection is unhappy, said in words, on its own full-width line.
// A state tells a pilot that the simulator is not connected; only the reason
// tells them the sim is not running, or that the host in SIMCONNECT_HOST is
// refusing the port. That reason used to live in the debug pane, which is the
// one place nobody looks while wondering why nothing works.
//
// Ordered by what the pilot can do about it, most actionable first.
const FAULT_ORDER: ConnectionName[] = ['simulator', 'api', 'adsb', 'discord'];

function faultLines(status: StatusSnapshot, width: number): string[] {
  const name = FAULT_ORDER.find((each) => status.faults[each] !== null);

  if (name === undefined) {
    return [];
  }

  const label = `${red('!')} ${bold(name)} ${dim('—')} `;
  const gutter = visibleWidth(label);
  const room = Math.max(width - 4 - gutter, MIN_FAULT_ROOM);
  const wrapped = wrap(status.faults[name] ?? '', room);

  return [
    ...wrapped.map((line, row) =>
      indent(
        row === 0 ? `${label}${line}` : `${' '.repeat(gutter)}${line}`,
        width,
      ),
    ),
    '',
  ];
}

// Wrapped rather than truncated: the half of the message that gets cut is the
// half that says what to do about it. Bounded, because a validation error from
// the ADS-B service can be four hundred characters of JSON and the frame is not
// the place to read all of it — the debug pane has the whole thing.
const MAX_FAULT_ROWS = 3;
const MIN_FAULT_ROOM = 16;

function wrap(text: string, room: number): string[] {
  const lines: string[] = [];
  let line = '';

  for (const word of text.split(/\s+/).filter((part) => part !== '')) {
    for (const piece of split(word, room)) {
      if (line === '') {
        line = piece;
      } else if (line.length + 1 + piece.length <= room) {
        line = `${line} ${piece}`;
      } else {
        lines.push(line);
        line = piece;
      }
    }
  }

  if (line !== '') {
    lines.push(line);
  }

  if (lines.length <= MAX_FAULT_ROWS) {
    return lines.length === 0 ? [''] : lines;
  }

  const kept = lines.slice(0, MAX_FAULT_ROWS);
  kept[MAX_FAULT_ROWS - 1] =
    `${(kept[MAX_FAULT_ROWS - 1] ?? '').slice(0, Math.max(room - 2, 1))}…`;

  return kept;
}

// A word with no spaces in it — a URL, a token, a stringified body — still has
// to fit, so it is cut into pieces that do.
function split(word: string, room: number): string[] {
  if (word.length <= room) {
    return [word];
  }

  const pieces: string[] = [];

  for (let at = 0; at < word.length; at += room) {
    pieces.push(word.slice(at, at + room));
  }

  return pieces;
}
