# Terminal presentation

## Purpose

The dashboard is the whole interface, and a console is a hostile canvas: it has a width that
changes, an encoding that may not be UTF-8, a scrollback the app must not shred, and a reader who
may have colour turned off or be unable to tell green from red. This is how the frame is drawn,
as distinct from what it reports.

## Requirements

### Requirement: The dashboard takes the console only when there is one

The system SHALL draw the dashboard only when its output is a terminal, and SHALL fall back to
plain log lines on standard output when it is not — piped to a file, run by a scheduler, run in
CI. The pilot SHALL be prompted for a sign-in only when there is a console to type into; where
there is not, the system SHALL say that it cannot ask and carry on with whatever session it has.

#### Scenario: Started by double-click

- **WHEN** the app runs with a terminal attached
- **THEN** it takes the alternate screen, hides the cursor, and paints the dashboard

#### Scenario: Output is redirected

- **WHEN** output is piped to a file or a log collector
- **THEN** no frame, no cursor control and no screen switching is written, only log lines

#### Scenario: No console to ask in

- **WHEN** the app starts with no stored session and no terminal on its input
- **THEN** it says so and keeps running, rather than blocking on a prompt nobody can answer

#### Scenario: The app exits

- **WHEN** the app shuts down after having taken the console
- **THEN** the cursor, the original screen and the original window title are all restored

### Requirement: The frame is repainted by difference

The system SHALL rewrite only the lines that changed since the last paint, SHALL erase lines that
the frame no longer has, and SHALL repaint everything after a resize. A frame that has not
changed SHALL cause no writing at all.

#### Scenario: One value changes

- **WHEN** the ground speed updates and nothing else does
- **THEN** only that line is rewritten

#### Scenario: The terminal is resized

- **WHEN** the window changes width
- **THEN** the whole frame is redrawn at the new width

### Requirement: Every line is exactly as wide as the terminal

The system SHALL pad or truncate every line to the terminal's width so a mangled line shows as a
ragged edge rather than as a shifted frame, SHALL measure width by visible characters rather than
bytes so colour codes do not count against it, and SHALL close any colour it opened when a line
is cut short.

#### Scenario: A value is too long for its box

- **WHEN** a fault message or a long name exceeds the space it has
- **THEN** it is truncated to the box and the colour does not leak into the rest of the frame

#### Scenario: The frame is checked for damage

- **WHEN** every line of a rendered frame is measured
- **THEN** they are all the same width

### Requirement: The frame is legible narrow, and without colour

The system SHALL place its sections side by side when the terminal is wide enough and stack them
when it is not, and SHALL remain readable down to a floor below which it does not attempt to
compress further. Colour SHALL carry meaning consistently — connected, disconnected,
unauthorised, waiting, standby — and SHALL be dropped entirely when the environment asks for no
colour. Every state that colour distinguishes SHALL also be distinguishable by shape, so the
frame survives both a monochrome terminal and a reader who cannot separate the hues.

#### Scenario: A narrow terminal

- **WHEN** the terminal is narrower than the width two panels need
- **THEN** the sections stack in one column rather than being cut in half

#### Scenario: Colour is turned off

- **WHEN** the environment asks for no colour
- **THEN** the frame is drawn without a single escape sequence, and still says everything it said
  before

#### Scenario: Two states share a colour family

- **WHEN** the reader cannot tell the markers apart by hue
- **THEN** the markers still differ as shapes

### Requirement: The window title carries the state the frame cannot

The system SHALL keep the terminal's title current with what matters most at that moment — the
first broken connection, standby, no flight, or the callsign and how much has been sent — so the
state is legible from a taskbar while the simulator is in front. The title SHALL be restored when
the app exits, and SHALL never contain control characters.

#### Scenario: The window is minimised

- **WHEN** the pilot is in the simulator and the app's window is behind it
- **THEN** the taskbar entry names the callsign and the number of reports sent

#### Scenario: Something is broken

- **WHEN** a connection the flight depends on is down
- **THEN** the title names that connection instead of the callsign

### Requirement: Box drawing survives the Windows console

The system SHALL switch the Windows console to UTF-8 before it draws, and SHALL warn and keep
drawing if the switch is refused, because a frame of replacement characters is a rendering fault
and not a reason to stop tracking a flight.

#### Scenario: The console accepts the switch

- **WHEN** the app starts on Windows
- **THEN** the frame's box drawing and markers render as themselves

#### Scenario: The console refuses the switch

- **WHEN** the code page cannot be changed
- **THEN** the app says the frame may be mojibake and carries on

### Requirement: The frame can be drawn without a simulator, a session or a network

The system SHALL be able to render a representative frame on demand, exercising every connection
marker and a fault, so that rendering can be judged on any machine and by a build — and so that
the answer to "does it draw" never depends on having a flight underway.

#### Scenario: Checking the rendering anywhere

- **WHEN** the frame is asked for outside a flight
- **THEN** a full frame is drawn with every marker state present, and a legend naming them
