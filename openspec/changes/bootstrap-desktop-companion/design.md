## Context

Four endpoints and two local sockets define the whole surface of this app.

**ADS-B service** (`adsb.barcz.me`, bearer JWT on every route):

| Route | Use |
| --- | --- |
| `POST /api/v1/position` | one position report: `date, latitude, longitude, altitude, groundSpeed, track, verticalRate, squawk, isOnGround, alert, emergency, spi, callsign` |
| `GET /api/v1/position/{callsign}` | the track, as `flight-tracker-api` reads it |
| `DELETE /api/v1/position/{callsign}` | clears a callsign's track |
| `POST /api/v1/auth-check/client` | validates a client token without publishing |

**flight-tracker-api**:

| Route | Use |
| --- | --- |
| `POST /api/v1/auth/sign-in` | access token (15m) + refresh token (7d) |
| `POST /api/v1/auth/refresh` | rotate before expiry; the refresh token is the bearer, there is no body, and the guard rejects an access token here |
| `GET /api/v1/user/me` | `currentFlightId` — set at check-in, cleared when the flight closes |
| `GET /api/v1/flight/:id` | `callsign`, plus route and timesheet if ever needed locally |
| `GET /api/v1/user/me/discord-presence` | the activity payload, or `204` |
| `GET /api-json` | `info.version`, for the status view — a quarter of a megabyte, read only because there is no status route. **Wanted: `GET /` returning `{ status, version }`** as the ADS-B service has; this app already prefers it and falls back. |

**Local sockets**: the SimConnect named pipe (`\\?\pipe\Microsoft Flight Simulator\SimConnect`,
discovered from `SimConnect.cfg` or the registry by `node-simconnect`, or reached over IPv4 —
see the macOS development decision), and the Discord IPC pipe (`\\?\pipe\discord-ipc-{0..9}`
on Windows, `$TMPDIR/discord-ipc-{0..9}` on macOS).

The consumer that matters most is invisible from here: `PositionService` in
`flight-tracker-api` fetches `GET /api/v1/position/{callsign}` using
`trimCallsign(flight.callsign)` — `replace(/\s+/g, '').toUpperCase()`. A track published
under any other spelling is stored by the ADS-B service and never seen by flight-tracker.

## What the existing feeder does

`kodowiec/FlightTrackerFeeder` (`FTF.Windows`, WinForms, RestSharp, SimConnectSharp) is the
application being replaced. Read from source, it establishes the contract this app has to
match, and four behaviours worth carrying over verbatim:

| Field | Existing SimVar | Kept |
| --- | --- | --- |
| `latitude` / `longitude` | `PLANE LATITUDE` / `PLANE LONGITUDE` | yes |
| `altitude` | `INDICATED ALTITUDE` | yes |
| `groundSpeed` | `GPS GROUND SPEED` | yes |
| `track` | `MAGNETIC COMPASS` | yes, see below |
| `verticalRate` | `VERTICAL SPEED` | yes — **the existing app never sends it** |
| `isOnGround` | `CONTACT POINT IS ON GROUND` | yes |
| `squawk` | `TRANSPONDER CODE:1`, formatted `D4` | yes |
| `emergency` | derived: squawk in 7500/7600/7700 | yes |
| `alert`, `spi` | always false | yes |
| `date` | `DateTime.UtcNow.ToString("O")` | yes |
| `callsign` | **typed into a text box by the pilot** | no — from the API |

- **The callsign is hand-typed today.** That is the mismatch this change designs out; the
  decision below is not hypothetical, it removes an existing failure mode.
- **`verticalRate` is mapped but never submitted** in the default path — the property exists
  on the payload class and is absent from the object the app builds. This app sends it.
- **`emergency` is derived from the squawk**, not read from the sim. Ported as-is, with tests.
- **`track` comes from `MAGNETIC COMPASS`**, which is magnetic heading, not ground track. Kept
  for behavioural parity so tracks stay comparable across the cutover. Switching to a true
  ground-track variable is a separate, testable change once parity is proven.
- **SimConnectSharp already decodes the transponder** to a decimal integer, so the existing app
  only formats it. `node-simconnect` hands over the raw BCD, so the decode lives here.
- **The token sits in `App.config` in plaintext** and the pilot pastes it into the UI. This app
  uses the credential store instead.

## Goals / Non-Goals

**Goals**

- Replace the C# transponder with something the team can maintain, in the language the API
  is written in.
- Publish rich presence for pilots who enabled it, with no server-side change.
- Survive a sim that is not running, a Discord that is closed, and a network that drops,
  without pilot intervention.
- Ship as one file a pilot can run, with no runtime to install.

**Non-Goals**

- No UI beyond tray, sign-in and a status window. The web frontend stays the product surface.
- No new ingest path in `flight-tracker-api`. Positions continue to reach it through the
  ADS-B service, exactly as today.
- No macOS or Linux *release*. MSFS runs on Windows and Discord IPC must be on the same
  machine as the Discord client, so that is what ships — but the app must run on macOS well
  enough to be developed there, which is a goal, not a shipped platform.
- No VATSIM/IVAO/other-network integration.
- No silent auto-update in the first release.
- No local flight-phase detection. The API already derives status from position reports; the
  app reports, it does not decide.

## Decisions

### Headless service plus tray, not Electron or Tauri

The app has no screens worth a renderer: a sign-in prompt, a status list, a quit item.
Electron would put a Chromium instance next to a simulator that wants every gigabyte, for a
window a pilot opens twice a month. Tauri would cut the footprint but split the codebase into
Rust for SimConnect and Discord RPC, which is the maintenance problem this change exists to
end.

So: a Node process, `node-simconnect` and Discord's IPC in-process, and a tray icon for state.
Sign-in happens on the dashboard, which turned out to be a better answer than a local window or a
browser page: it is one keystroke and it needs nothing to render it.

**Spike resolved: neither. The tray is Win32 called directly through `bun:ffi`.**

`systray2` was the leading candidate and would have cost a resident Go process and an
eleven-megabyte payload extracted to a temp directory at startup — roughly a third of the memory
saved by dropping the Discord library, and the end of the single-file promise. A native
`trayicon` addon would have meant shipping a `.node` binary into a `bun --compile` bundle.

`bun:ffi` needs neither: `dlopen` on `shell32.dll` and `user32.dll`, and the icon costs nothing
beyond the app already running. What makes it small enough to be worth doing is the scope — an
icon and a tooltip, no menu. A menu would need a WNDPROC as a `JSCallback` and a message pump to
drive it; without one the owner window can be an ordinary window that is never shown, sitting
behind `DefWindowProcW`, and omitting `NIF_MESSAGE` means the shell sends no mouse notifications
that nobody is there to read. The keys stay on the dashboard, where they already are.

Two consequences worth writing down. The icon is **drawn** rather than shipped — a disc in the
state's colour, generated as an .ico image in memory and handed to `CreateIconFromResourceEx` —
because bun stamps exactly one icon resource into the executable and that one is the app's own,
and because at sixteen pixels a brand glyph is mush while a coloured disc is not. And none of it
can be exercised off Windows, so every call is checked, any failure degrades to no tray at all
with a log line naming the call that refused, and the executable answers `--tray-check`, which
CI runs on a Windows runner. That last part is the only real test the tray gets.

### The callsign comes from the API, never from the sim

`trimCallsign` is the contract. The app resolves `currentFlightId` from `GET /user/me`,
reads `callsign` from `GET /flight/:id`, applies the same normalisation, and publishes under
that. Consequences, all deliberate:

- **No current flight, no feed.** A pilot flying without checking in publishes nothing.
  There is no flight for the data to belong to and no callsign to file it under; inventing one
  from `ATC ID` would write a track nothing reads.
- **A callsign change mid-session is picked up** on the next poll of `/user/me`, and the app
  starts publishing under the new spelling.
- **The sim's `ATC ID` is read only for diagnostics**, shown in the status window so a pilot
  can see when it disagrees with the flight — the likeliest cause of "my track is missing"
  under the C# app.

### One report every ten seconds, whatever the phase of flight

`POST /api/v1/position` takes a single report, so publish rate equals request rate. The API
polls at one and five minute intervals and deduplicates by timestamp, so sub-second fidelity
buys nothing; a stationary aircraft at the gate buys less. Sample SimConnect at 1 Hz
(`SimConnectPeriod.SECOND`) but publish one report in ten, and always publish a transition
across `CONTACT POINT IS ON GROUND` immediately so the takeoff and landing edges stay exact.
Sampling stays at 1 Hz precisely so those two edges are still caught within a second: it is
the cadence that is thinned, not the precision of the moments that carry information.

This started at one report a second airborne and one in five on the ground. Both were far
finer than anything downstream reads, and a ten-second cadence is a tenth of the traffic for a
track nobody can tell apart. The two-rate split went with it: with the transition rule doing
the work that mattered, a separate ground rate was only buying a saving on a parked aircraft
that a flat ten seconds already makes small.

Reports that fail to publish go to a bounded FIFO queue (cap 360 — one hour at one report
every ten seconds),
retried with backoff, oldest dropped first. The API sorts and deduplicates by timestamp, so
late arrivals are harmless; a gap is not.

### Discord's IPC is spoken directly, not through a library

`@xhayper/discord-rpc` was the first implementation and cost more resident memory than the whole
bun runtime — measured at +34MB against a 23MB baseline, repeated and settled — because it brings
`discord-api-types` (6.4MB), `@discordjs/rest` and `ws` along for a WebSocket transport this app
never uses. The app called four methods on it.

What those four methods do is an eight-byte header, a handshake and one frame per activity over a
local socket. Written against `node:net` that is about 120 lines and measures ~9MB doing the same
work, verified against the real Discord client. The wire shape is copied field for field from what
the library sent, down to `type: 0` and `created_at`, so the swap is not also a change to what
Discord displays — a test asserts that payload exactly.

Two things came free. A failed connect now tears its socket down rather than abandoning it, which
the library did not do; and the framing copes with a frame split across reads, which a test drives
one byte at a time. Three dependencies left the tree.

### Squawk is BCD, but not always

`TRANSPONDER CODE:1` returns binary-coded decimal: squawk 1200 arrives as `0x1200`. The
ADS-B payload wants the four digits as a string. Format the integer as hex, take the low four
digits. Getting this wrong yields plausible-looking wrong squawks (4608 for 1200), which is
why it is called out here and covered by a unit test rather than left to the implementer.

Not every aircraft honours it, though, and the first real flight found one that did not: the
BCD reading of what it returned was not four octal digits, the squawk was therefore left out,
and the consequence was the whole feed stopping — see below. So read BCD first, since that is
what MSFS documents, then the plain decimal, and publish `2000` if it is neither — the ICAO
code for an aircraft that has not been assigned one, which is exactly what is true here.

### Every field is required, so nothing is omitted

`CreatePositionRequest` lists all thirteen fields under `required`. Omitting a value the
simulator did not supply — the tidier-looking choice, and the one this design originally made
— is answered `400`, and because the refused report sits at the head of the retry queue, one
missing field stops every report behind it. A value that is absent travels as a zero.

The queue is for an outage, not for a refusal. A `4xx` other than `401`, `403`, `408` and
`429` will not read differently on the tenth attempt, so that report is discarded and counted
as dropped and the next one is tried at once. And the body of the refusal is read: a `400`
logged as a bare status code is the same bug report with the evidence torn off.

### Transmission is a switch the pilot holds

Position reporting is on by default, which is the unattended behaviour a pilot checked in for
a flight wants. But the hand-typed callsign override exists precisely for the cases that are
not that — a test, a look at the dashboard, someone else's callsign typed by mistake — and it
used to start broadcasting the pilot's position the instant it was accepted, with quitting as
the only way to stop. One key toggles it; off is `standby`, the transponder's own word, and it
queues nothing so switching back on does not backfill a gap that was asked for.

### Development happens on macOS; Windows is a target, not a workstation

Both local sockets turn out to be reachable from a Mac, so the daily loop needs no Windows
development environment:

- **The simulator over TCP.** `node-simconnect` accepts `open(name, protocol, { host, port })`
  and speaks the protocol over IPv4, so the app runs on the Mac and connects to MSFS on the
  Windows PC across the LAN. It needs a `SimConnect.Comm` block with `Protocol` `IPv4`,
  `Scope` `global` and a port in
  `%APPDATA%\Microsoft Flight Simulator 2024\SimConnect.xml` on the Windows side. Real sim
  data, real aircraft, no Windows toolchain. `SIMCONNECT_HOST` switches it on; unset means the
  local pipe, which is what ships.
- **Discord over its macOS socket.** The IPC client resolves `darwin` paths natively, so the
  activity can be written to — and looked at on — the Mac's own Discord client.

The consequence for packaging is the important part: **no native modules.** A `.node` binary
would have to be cross-compiled or fetched per platform, which is the one thing that turns a
Mac-only workflow back into a Windows one. So anything platform-specific is reached through a
child process instead of a native binding, and the Windows executable is cross-compiled
(`bun build --compile --target=bun-windows-x64`) or, better, built and smoke-tested by CI on a
`windows-latest` runner, which removes the last reason to develop on Windows.

What genuinely cannot be exercised from a Mac, and is therefore grouped into one Windows pass:
pipe-based SimConnect discovery from the registry, the tray, registry autostart, DPAPI, the
packaged executable, and the real-flight verification.

### Credentials in the Windows credential store

Two secrets: the pilot's flight-tracker refresh token and the ADS-B client token. Neither
goes in a config file, and never the password itself, which is exchanged for tokens at sign-in
and discarded.

Reached through a child process rather than a keyring binding, so the bundle stays pure
JavaScript and cross-compiles: PowerShell DPAPI (`ConvertFrom-SecureString` /
`ConvertTo-SecureString`, user-scoped) writing an encrypted blob on Windows, and the `security`
CLI against the login keychain on macOS for development. Both sit behind the `TokenStore`
interface that the file implementation already satisfies, so swapping them changes no caller.

The ADS-B client token is validated at startup with `POST /api/v1/auth-check/client`, so a
revoked token surfaces as a tray error instead of an hour of silently rejected reports.

### Presence polls at 15 seconds and mirrors, nothing more

The payload is already formatted for Discord — `state`, `details`, ISO timestamps, both asset
keys. The app converts the timestamps to what the RPC call wants and passes the rest through.
It does not compose text, so a wording change in the API needs no client release.

`204` means clear the activity. So does a `richPresenceEnabled` that just went false, a closed
flight, and a sign-out: all of them produce `204` or an unauthenticated client, and both paths
clear. The app never leaves a stale activity behind after the flight is over.

Enrichment from SimConnect — `Cruise FL360, landing at 15:50 UTC` — is deliberately deferred.
It splits presence text between two codebases, and the value is cosmetic until the plain
version is in pilots' hands.

### Cutover is per pilot, and never parallel for one callsign

Both applications publishing the same callsign would interleave two independent streams
with different cadences and clock offsets. Deduplication is by exact timestamp, so nothing collides — but
the track gains an apparent jitter that the API's own takeoff and off-block detection reads as
movement. A pilot runs one or the other. Validation flies a real flight with the new app while
the C# app is closed, and compares the resulting track against the previous flight's.

### Packaging: single executable, user-level autostart

Bundle to one `.exe`. `node-simconnect` is pure TypeScript and bundles cleanly; the keyring
and any tray helper are native or auxiliary binaries and decide the tooling — `bun build
--compile` or Node SEA if assets can ride along, otherwise `pkg`. Autostart via the user's
`Run` registry key, which needs no administrator. Updates in the first release are a version
check against a published manifest and a tray notification; no self-replacement.

## Risks / Trade-offs

- **`node-simconnect` is a community reimplementation of a Microsoft protocol.** If Asobo
  changes the wire format, the fix depends on an upstream project. Mitigation: the protocol
  versions are forward-compatible, every MSFS-2024 issue in that repository is a closed
  feature request rather than a connection failure, and the app pins its protocol version
  explicitly. Accepted knowingly: the alternative is staying in C#.
- **Tray support in Node is the weakest dependency in the stack**, which is why it is a spike
  with a named fallback rather than an assumption. It is also the one component that cannot be
  judged from a Mac: a cross-platform helper can be driven from macOS during development, but
  how it looks and behaves on Windows is only knowable there.
- **The pilot's PC is not a trusted environment.** A refresh token there is a 7-day
  credential; a stolen one is usable until sign-out. The credential store and short access
  tokens reduce the window, they do not close it. Worth revisiting whether the API should
  issue device-scoped tokens that a pilot can revoke individually.
- **Rich presence needs the Discord application configured** — art assets uploaded under the
  keys the API serves, and the application id shipped in the build. Presence silently renders
  without images if the assets are missing, which is the failure mode most likely to reach a
  pilot; the status window states whether the handshake succeeded, not whether Discord liked
  the assets.
- **One process, four failure domains.** Consolidating the transponder and presence means a
  crash takes both down. Mitigation: presence and feed run as independent supervised loops
  with their own retry, and neither can throw into the other.
- **`DELETE /api/v1/position/{callsign}` semantics are unverified** from this side. It is not
  used, and the app never deletes a track; noted so nobody assumes it is a cleanup hook.
