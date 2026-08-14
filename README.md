# flight-tracker-transponder-app

Desktop companion for Flight Tracker. A headless Node service with a Windows tray icon that
runs on the pilot's PC alongside Microsoft Flight Simulator 2024 and does two things no
server can do for it:

- **Feeds positions.** Reads the simulated aircraft over SimConnect and publishes position
  reports to the ADS-B service, which `flight-tracker-api` polls by callsign. This replaces
  the C# transponder.
- **Publishes Discord rich presence.** Mirrors `GET /api/v1/user/me/discord-presence` from
  `flight-tracker-api` into the Discord client running on the same machine.

## State

The domain, both feeds and sign-in are implemented and unit-tested, and CI builds the Windows
executable; the tray, autostart and a real flight are not. See
`openspec/changes/bootstrap-desktop-companion/tasks.md` for exactly what is checked off.

```bash
npm install        # needs Node 26
npm test           # 190 unit and integration tests
npm run lint       # biome check
npm run lint:fix   # biome check --write
npm start          # needs the environment in .env.example
npm run build:exe  # single Windows executable (needs bun)
npm run build:icon # regenerate assets/icon.ico from the svg (macOS only)
```

`integrity` runs Biome, the typecheck and the tests on every pull request, and compiles the
Windows executable on a Windows runner and smoke-tests it. On merge to main, `release` tags
the version from `package.json`, creates a GitHub release and attaches the executable — so a
release needs no Windows workstation.

## Installing and running it

The executable is attached to every GitHub release, built by CI on a Windows runner. There is no
installer, nothing to compile and nothing to configure: the service URLs and the Discord
application id are compiled in, and the release build bakes in the ADS-B client token from a
repository secret. Download `flight-tracker-transponder.exe`, put it in a folder of its own,
start the simulator and Discord, then run it from a terminal:

```powershell
cd C:\FlightTracker
.\flight-tracker-transponder.exe
```

A sign-in is the only thing asked of a pilot. `--version` reports the build and exits, which is
what CI smoke-tests. `--print-frame` draws one dashboard frame and exits — if the box drawing
comes out as garbled letters rather than lines, the console is on an OEM code page and `chcp
65001` before running fixes it.

Every key in `.env.example` still works as an override — read from the real environment first,
then `.env` in the working directory, then `.env` beside the executable, with nothing already set
ever overwritten. That is for development: pointing a build at a staging API, or setting
`SIMCONNECT_HOST` to reach a simulator across the network. Unset means the local pipe, which is
what pilots get.

The executable is unsigned, so SmartScreen offers to block it the first time: **More info** →
**Run anyway**. Double-clicking works as well — Explorer opens a console window and sets the
working directory to the executable's folder, so the sign-in prompt and the stored session both
resolve from there — but a terminal you opened yourself keeps the output on screen if the app ever
exits. Ctrl-C shuts down cleanly and clears the Discord activity on the way out.

Every line goes to the console and to `LOG_FILE_PATH`, which defaults to
`flight-tracker-transponder.log` in the working directory.

### Signing in

No password lives in the configuration. On the first start, with no session stored, the app
asks for one:

```
Flight Tracker email: pilot@example.com
Password: *******
```

The password is masked as it is typed, is never logged and never reaches the disk. What is kept
is the refresh token, stored through DPAPI on Windows and the login keychain on macOS, so this
is asked once and not again until that session is revoked or expires. Three rejected attempts
leave the app running with `api=unauthorised`, and so does Ctrl-C at the prompt — **press `s` on
the dashboard to be asked again**, without restarting. The same key is the way back in when a
session is revoked or expires hours into a flight, which is the case a restart used to be the
only answer to.

### The two tokens

They are different things and they fail differently. **The ADS-B client token** identifies this
app to the ADS-B service and is checked once at startup — a bad one shows up as
`adsb=unauthorised` and no position report is ever accepted. It is the same for every pilot, so
CI bakes it into the release build from the `ADSB_CLIENT_TOKEN` repository secret; it never lives
in this public repository, though it is recoverable from any distributed binary. **The session** is
yours, obtained by signing in, and is renewed automatically ahead of the 15-minute access-token
expiry — losing it shows up as `api=unauthorised`, which stops the callsign lookup and so
suspends publishing.

### What the status line means

Once a minute the app reports where it stands:

```
simulator=connected discord=connected adsb=connected api=connected callsign=SP123 aircraft=A320 published=42 dropped=0
```

Each connection is `connected`, `disconnected`, `unauthorised`, `waiting-for-flight` or, for
`adsb` alone, `standby`. `simulator` is the SimConnect pipe, so it stays disconnected until the
sim is running and in a flight. `discord` is the local IPC socket. `adsb` reads
`waiting-for-flight` whenever there is no callsign to publish under, `unauthorised` when the
client token was rejected, and `standby` when the transponder has been switched off. `api` is
`flight-tracker-api` itself. The dashboard shows the same states, split across its sections.

The one that surprises people: **nothing publishes without a current flight in Flight Tracker.**
The callsign comes from the API's current flight and never from the simulator's ATC ID, so with
no flight started you will see `no current flight, publishing suspended` and an empty
`callsign=-` no matter how healthy SimConnect looks. Start the flight in the web app first.

### The five sections

```
┌─ 1 CREW ──────────────────┐┌─ 2 CRNT SERVICE ──────────────────────────────┐
│ Oskar Barcz               ││ DLH5540 * [BER] Berlin -> [WAW] Warsaw Chopin │
│ oskar@barcz.me            ││ airframe: [B77W] * tail: [SP-LVD]             │
└───────────────────────────┘└───────────────────────────────────────────────┘
┌─ 3 XPNDR ─────────────────┐┌─ 4 COMMS ─────────────────────────────────────┐
│ tail:   [SP-LVD]          ││ discord:  ● connected                         │
│ squawk: [2000]            ││ presence: [ON]                                │
│ mode:   [MODE C]          ││ BER -> WAW                                    │
│ spd:    451kt             ││ Cruise, landing at 15:50z                     │
│ call:   11:30:30z         ││                                               │
└───────────────────────────┘└───────────────────────────────────────────────┘
┌─ 5 STATUS ───────────────────────────────────────────────────────────────────┐
│ adsb: [OK, v0.5.0] · tracker: [OK, v3.24.0] · xpndr: [OK, v0.7.0]            │
└──────────────────────────────────────────────────────────────────────────────┘
```

**1 CREW** and **2 CRNT SERVICE** both come off one `GET /user/me`, so knowing who is signed in
costs no extra request. When the airport names do not fit — half of an eighty-column terminal
does not hold them — the route falls back to the codes alone, because a name cut off mid-word
identifies an airport less well than `[WAW]` does.

**3 XPNDR** is the aircraft, not the network. `tail` here is the simulator's own `ATC ID` while
section 2 shows the tail Flight Tracker assigned, so a mismatch between the two is visible
rather than mysterious. `squawk` and `spd` are read off every sample even while nothing is being
published, because they are the aircraft's state either way. `mode` is `MODE C` when the
transponder is transmitting and `STBY` when it is not. `call` is when the last report was
accepted, in zulu and to the second: it is what distinguishes a feed that stopped from one that
is a second old.

**4 COMMS** is the local Discord socket and whether an activity is currently published.

**5 STATUS** is one line, because three services and their versions is a sentence rather than a
table, and reading it left to right is how anyone reports a fault. `adsb` and `tracker` report
each service's own version, read **without a token** — the ADS-B service states one on `GET /`,
and the API, which publishes no status route at all, states one in the `info` block of its
OpenAPI document. That matters: the line still says what is deployed at the far end when the
session or the client token is the very thing that is broken. A version that could not be read is
simply left out and stops nothing. Neither is polled often, because neither changes except on a
deploy and the API's document costs a quarter of a megabyte to read — `VERSION_POLL_INTERVAL_MS`
sets the interval, fifteen minutes by default.

`xpndr` reads `[OK, v0.7.0]` unless GitHub has a newer release, in which case it reads
`[UPDATE to v0.8.0 possible]`. That check is unauthenticated and best-effort: GitHub being
unreachable leaves the row saying OK rather than complaining, and a build from source, whose
version is the string `dev`, never claims an update is available.

### The keys

There is no tray icon yet, so the console window is the whole interface, and closing it — or
Ctrl-C — stops the app. Everything it can be *asked* to do is one letter, listed along the
bottom of the frame, each in brackets so the key can be told from its label:

| Key | What it does |
| --- | --- |
| `[s]` | Sign in, or sign out once there is a session to end. Asks for the email, then the password, masked. The outcome opens the debug pane rather than being written somewhere nobody is looking. Signing out is greyed out, and does nothing, while the transponder is transmitting — ending a session mid-flight would strand a track halfway through. Press `t` first. |
| `[t]` | Toggle the transponder between `MODE C` and `STBY`. On standby nothing is published and nothing is queued for later, so switching back on does not backfill the gap you asked for. It starts transmitting, so a flight that never touches it behaves as it always did. |
| `[c]` | Publish under a callsign you type, rather than the current flight's. Empty follows the flight again. A callsign the service would refuse is turned away here with a reason rather than as a 400 on every report. |
| `[d]` | Show or hide the debug messages. |

Transmission being a switch matters most with `c`: setting a callsign by hand used to start
broadcasting your position on the spot with no way to stop it short of quitting.

## Developing on macOS

Both local sockets are reachable from a Mac, so no Windows development environment is needed.

**The simulator, over the network.** Add a `SimConnect.Comm` block to
`%APPDATA%\Microsoft Flight Simulator 2024\SimConnect.xml` on the Windows PC:

```xml
<?xml version="1.0" encoding="Windows-1252"?>
<SimBase.Document Type="SimConnect" version="1,0">
  <Descr>SimConnect</Descr>
  <Filename>SimConnect.xml</Filename>
  <SimConnect.Comm>
    <Disabled>False</Disabled>
    <Protocol>IPv4</Protocol>
    <Scope>global</Scope>
    <Address>0.0.0.0</Address>
    <MaxClients>64</MaxClients>
    <Port>500</Port>
  </SimConnect.Comm>
</SimBase.Document>
```

Restart the sim, allow the port through the firewall, then set `SIMCONNECT_HOST` to the PC's
address. Unset means the local pipe, which is what ships to pilots.

**Discord, locally.** The IPC client resolves macOS socket paths, so the activity is written to
the Mac's own Discord client and can be looked at there.

**Looking at what was published.** `index.html` draws a callsign's track on a map, straight from
the ADS-B service. Serve it rather than opening the file:

```bash
ADSB_CLIENT_TOKEN=… npm run preview   # or put the token in .env
```

Then open `http://127.0.0.1:4173`. Opening `index.html` from the filesystem does not work, and
no amount of editing the page will make it: the service answers
`access-control-allow-origin: https://flights.barcz.me` and nothing else, so the browser refuses
to hand the response back to a page on any other origin — the request itself succeeds, which is
what makes it confusing to debug. `bin/preview.mjs` sidesteps the whole question instead of
fighting it. It serves the page and forwards `/api` to the service, so page and data share an
origin and the same-origin policy never applies. Nothing has to be disabled in the browser.

It also means the token stays in that process. It reads it from the environment or `.env` and
attaches it on the way out, so it never has to be typed into a page that lives in this public
repository. The proxy binds to loopback only, for the same reason: every request it forwards
carries that token.

**What still needs a Windows pass:** pipe-based SimConnect discovery, the tray, registry
autostart, DPAPI credential storage, the packaged executable, and flying a real flight. These
are grouped as section 0.6 of the tasks, and the executable itself can be cross-compiled from
macOS or built by CI on a Windows runner.

## Proposal

```
openspec/changes/bootstrap-desktop-companion/
  proposal.md   why this exists, what it changes, what it affects
  design.md     the four connections, what the old feeder does, decisions, risks
  tasks.md      spikes first, then skeleton, feeds, packaging, cutover
  specs/        sim-position-feed, discord-rich-presence, desktop-runtime
```

`old-app/` holds the binaries that were handed over; `Simvars.exe` there is the MSFS SDK
sample, not the feeder. The feeder being replaced is `kodowiec/FlightTrackerFeeder`.

Read it with the OpenSpec CLI:

```bash
openspec show bootstrap-desktop-companion
openspec validate bootstrap-desktop-companion --strict
openspec status --change bootstrap-desktop-companion
```

## Why a local app at all

Discord exposes no server-side way to set a user's activity. The `activities.write` OAuth
scope is documented as *"not currently available for apps"*, and RPC `SET_ACTIVITY` is
reachable only over the local IPC pipe on the machine running the Discord client — the
WebSocket transport a browser could have used is deprecated and limited to legacy beta
participants. A PWA cannot open a named pipe or a Unix socket, so no amount of web
engineering substitutes for a local process. SimConnect has the same shape: a named pipe on
the machine running the simulator.

## Related repositories

- `flight-tracker-api` — owns flights, the presence payload, and the ADS-B polling that
  consumes what this app publishes.
- ADS-B service (`adsb.barcz.me`) — receives position reports, serves tracks by callsign.

## Windows only

The simulator runs on Windows, and Discord IPC must be on the same machine as the Discord
client. A cross-platform build would have nothing to talk to.
