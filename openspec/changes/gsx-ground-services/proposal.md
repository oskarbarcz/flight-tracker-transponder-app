## Why

GSX Pro is where the turnaround actually happens, and it knows things nothing else on the
pilot's PC knows: how many passengers are aboard right now, how much fuel has gone in, which
stand the aircraft is on, and who is handling it. Since GSX 4.0.1 it publishes all of that
over a first-party WebSocket API on the pilot's own machine, so the transponder — already the
one MyPreflight component running next to the simulator — can read it without the pilot
installing or configuring anything.

This change reads that feed and shows it on the dashboard. Publishing ground services to the
tracker API is the eventual goal, but no endpoint exists yet, so this change deliberately
stops at the local display and leaves a publisher-shaped seam behind it.

## What Changes

- Connect to GSX's Couatl Remote API over WebSocket at `127.0.0.1:8744`, retrying every 20
  seconds so a GSX started after the app — or restarted mid-flight — is picked up on its own.
- Treat GSX as entirely optional: absent GSX is a normal state, never a fault, and every
  existing function continues unaffected.
- Normalise GSX's twelve services into a domain model covering state, passenger counts,
  baggage and cargo percentages, fuel figures, and the handling operator.
- Show the running services on the TUI dashboard — boarding at `30/122`, refuelling at
  `2221 kg`, and so on — alongside the stand and airport GSX reports.
- Add a one-shot capture and probe mode that records GSX's raw frames to a file, so the
  protocol can be exercised against real recordings on a machine without a simulator.
- Add `GSX_HOST` and `GSX_PORT` configuration, matching the existing remote-SimConnect
  options, and a switch to disable the integration outright.

Not in scope: publishing ground services anywhere, writing to GSX (`gate.select`,
`settings.set`, `menu.pick`), and GSX's airport, billing, receipt and settings data.

## Capabilities

### New Capabilities

- `gsx-ground-services`: discovering the GSX Remote API on the pilot's machine, reading
  ground-service state and progress from it, and surviving GSX starting, stopping and
  restarting underneath the app.

### Modified Capabilities

- `terminal-presentation`: the dashboard gains a ground-services section, shown only while
  GSX is connected and reporting.
- `app-configuration`: new settings for the GSX endpoint and for disabling the integration.

## Impact

- New `src/domain/ground-services.ts` (normalised model, state machine, progress buckets) and
  `src/infrastructure/gsx/` (WebSocket client, frame decoding, reconnection).
- New `src/application/ports/ground-services.ts` and a feed in `src/application/`, wired
  through `Supervisor` in `src/main.ts` the way the position and presence feeds already are.
- `src/application/status.ts` gains ground-service state; `src/presentation/tui/frame.ts`
  renders it.
- No new runtime dependencies — Node 26's global `WebSocket` covers the transport, keeping
  the app's two-dependency footprint intact.
- Development risk: the maintainer develops on macOS and can only exercise GSX on a separate
  Windows machine, so this change is built to be verified from recorded frames rather than
  from a live simulator.
