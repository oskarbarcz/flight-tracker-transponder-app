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

The domain and both feeds are implemented and unit-tested; the tray, the credential store and
packaging are not. See `openspec/changes/bootstrap-desktop-companion/tasks.md` for exactly
what is checked off.

```bash
npm install
npm test           # 101 unit and integration tests
npm run lint       # biome check
npm run lint:fix   # biome check --write
npm start          # needs the environment in .env.example
npm run build:exe  # single Windows executable (needs bun)
```

`integrity` runs Biome, the typecheck and the tests on every pull request, and compiles the
Windows executable on a Windows runner and smoke-tests it. On merge to main, `release` tags
the version from `package.json`, creates a GitHub release and attaches the executable — so a
release needs no Windows workstation.

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
