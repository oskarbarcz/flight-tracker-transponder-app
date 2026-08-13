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
npm install
npm test           # 127 unit and integration tests
npm run lint       # biome check
npm run lint:fix   # biome check --write
npm start          # needs the environment in .env.example
npm run build:exe  # single Windows executable (needs bun)
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
what CI smoke-tests.

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
leave the app running with `api=unauthorised`; Ctrl-C at the prompt skips sign-in with the same
result. Either way, restarting is what asks again.

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

Each connection is `connected`, `disconnected`, `unauthorised` or `waiting-for-flight`.
`simulator` is the SimConnect pipe, so it stays disconnected until the sim is running and in a
flight. `discord` is the local IPC socket. `adsb` reads `waiting-for-flight` whenever there is
no callsign to publish under, and `unauthorised` when the client token was rejected. `api` is
`flight-tracker-api` itself.

The one that surprises people: **nothing publishes without a current flight in Flight Tracker.**
The callsign comes from the API's current flight and never from the simulator's ATC ID, so with
no flight started you will see `no current flight, publishing suspended` and an empty
`callsign=-` no matter how healthy SimConnect looks. Start the flight in the web app first.

There is no tray icon yet, so the console window is the whole interface and closing it stops the
app.

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
