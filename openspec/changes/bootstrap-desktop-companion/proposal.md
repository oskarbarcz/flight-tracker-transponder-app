## Why

Two unrelated needs land on the same machine — the pilot's Windows PC running MSFS 2024.

**The transponder must be replaced.** A C# application currently reads the simulator over
SimConnect and publishes position reports to the ADS-B service at `adsb.barcz.me`
(`POST /api/v1/position`), which `flight-tracker-api` then polls by callsign
(`GET /api/v1/position/{callsign}`, every minute for flights awaiting first position and
off-block, every five minutes for trackable flights). That application is no longer
maintainable and cannot be upgraded in place.

**Discord rich presence cannot be served from the API.** `flight-tracker-api` already
exposes `GET /api/v1/user/me/discord-presence` — state, details, start/end timestamps and
the two asset keys — gated on the user's `richPresenceEnabled` setting, answering `204`
when there is nothing to publish. Nothing consumes it, and nothing server-side can: Discord's
`activities.write` scope is documented as *"not currently available for apps"*, and the RPC
`SET_ACTIVITY` command is reachable only over the local IPC pipe on the machine running the
Discord client (the WebSocket transport that a browser could have used is deprecated and
restricted to legacy beta participants). A PWA cannot open either a named pipe or a Unix
socket, so a browser-only client is not an option at any effort level.

Both needs are the same shape: a long-lived local process that talks to sockets on the
pilot's PC and to two HTTP services. One process serves both, and replacing the transponder
stops being a rewrite for its own sake — it becomes the vehicle that also delivers presence.

## What Changes

A new repository, `flight-tracker-transponder-app`: a headless Node service with a Windows tray
icon, shipped as a single executable, that runs alongside the simulator.

- **Position feed.** Connect to MSFS 2024 through `node-simconnect` — a TypeScript
  implementation of the SimConnect protocol that speaks the same named pipe as the C#
  managed wrapper, with no SDK or native DLL — sample the user aircraft, and publish each
  report to the ADS-B service. This retires the C# application.
- **Callsign resolution.** Publish under the callsign `flight-tracker-api` will look for:
  the current flight's `callsign`, normalised the way the API normalises it, resolved from
  `GET /api/v1/user/me` → `currentFlightId` → `GET /api/v1/flight/:id`. Not the simulator's
  `ATC ID`, which the pilot is free to leave as the aircraft registration.
- **Rich presence.** Poll `GET /api/v1/user/me/discord-presence` and mirror it into the
  Discord client over IPC: `SET_ACTIVITY` on `200`, clear the activity on `204`.
- **Runtime.** Sign in once against `flight-tracker-api`, hold the ADS-B client token, keep
  both in the Windows credential store, refresh the 15-minute access token against the
  7-day refresh token, start with Windows, and report state through the tray.
- **Degraded operation is normal, not exceptional.** Each of the four connections — sim,
  Discord, ADS-B service, API — can be absent while the others work, and the app keeps
  running rather than exiting.

## Capabilities

### New Capabilities

- `sim-position-feed` — read the simulated aircraft and publish position reports under the
  flight's callsign.
- `discord-rich-presence` — mirror the API's presence payload into the local Discord client.
- `desktop-runtime` — process lifecycle, credentials, tray, autostart, diagnostics.

## Impact

- **New repository.** No change to `flight-tracker-api`; its presence endpoint and the ADS-B
  service contract are both consumed as they stand today.
- **Retires the C# transponder.** Cutover is per pilot, and the two must not run at once for
  the same callsign — see the migration decision in `design.md`.
- **Two credentials per install.** A pilot's flight-tracker password and an ADS-B client
  token now live on a workstation the project does not control. `design.md` treats this as a
  first-class risk rather than a configuration detail.
- **Discord application setup.** The two asset keys the API serves must exist as Rich
  Presence art assets on the application whose id the app handshakes with. The current
  large-image key contains a space, which asset names do not allow, so the API constant needs
  one edit before the first release.
