## 1. Capture the protocol on the Windows machine

- [x] 1.1 Add a minimal GSX connection in `src/infrastructure/gsx/` — Node's global
  `WebSocket`, connect, receive, no decoding beyond `JSON.parse`
- [x] 1.2 Add a `--gsx-capture` entry path that appends every received frame as
  `{receivedAt, raw}` to `gsx-capture.jsonl` beside the executable
- [x] 1.3 Print a copyable console summary: the `hello` frame verbatim, the top-level keys
  seen, and one line per probe result
- [x] 1.4 Send the safe probes and record their replies — `service.trigger`, `service.bypass`,
  `state.get`, `handler.get`, `gate.list`. Never send `menu.pick` at any index
- [x] 1.5 Produce a Windows test build and hand it over with instructions: run parked at a
  gate in a throwaway session, through an arrival deboard and a departure turnaround, and a
  second short run started *before* GSX to record the discovery path
- [x] 1.6 Commit the returned recording, redacted, as fixtures under
  `src/infrastructure/gsx/fixtures/`; confirm or correct every shape assumed in design.md and
  amend it where the capture disagrees

## 2. Domain model

- [x] 2.1 `src/domain/ground-services.ts` — service ids, states, and the per-service progress
  shapes (passengers, baggage percentage, fuel, phase)
- [x] 2.2 Map GSX's ids and states to the app's own, dropping unknown services and leaving
  unknown states unstated
- [x] 2.3 Read passenger progress from GSX's passenger detail and never from its progress
  figure; cover the 181/181-against-181/186 case explicitly
- [x] 2.4 `Turnaround` — retain the highest state each service reached, reset on leaving the
  ground or on a change of current flight
- [x] 2.5 Colocated specs for 2.1–2.4, driven from the task 1 fixtures

## 3. GSX client

- [x] 3.1 Frame decoding: `hello`, `snapshot`, `patch`, `result`, with malformed frames
  discarded rather than thrown
- [x] 3.2 Flat state — a patch replaces one top-level key outright; a null or absent value
  deletes it. Assert that a withdrawn service disappears
- [x] 3.3 Discard `handlerData` on receipt, before anything retains it; log no frame payload
- [x] 3.4 Capability negotiation from `hello`: distinguish *not connected* from *connected but
  cannot supply ground services*
- [x] 3.5 Connection machine — searching / handshake / connected / unsupported, with the fast
  first retry decaying to the 20 s steady interval
- [x] 3.6 Reconnection: adopt the snapshot GSX sends on reconnect, and do not report GSX as
  absent while an engine restart is in flight
- [x] 3.7 Colocated specs replaying the task 1 recording end to end, including the
  start-before-GSX recording

## 4. Configuration

- [x] 4.1 `GSX_HOST` and `GSX_PORT` in `src/infrastructure/config/config.ts`, defaulting to
  the local machine and GSX's port, falling back on unusable values
- [x] 4.2 A setting that disables the integration outright — no connection, no retry
- [x] 4.3 Add both to `.env.example` (the README has no configuration table and points
  at that file instead; the README prose belongs to 7.2)
- [x] 4.4 Extend the config specs

## 5. Application wiring

- [x] 5.1 `src/application/ports/ground-services.ts` — the `GroundServicesSource` port
- [x] 5.2 `src/application/ground-services.feed.ts`, modelled on `position.feed.ts`
- [x] 5.3 Feed the turnaround reset from the sim sample's on-ground state and from the current
  flight
- [x] 5.4 Register the feed with `Supervisor` in `src/main.ts`, and confirm
  `src/architecture.spec.ts` still passes
- [x] 5.5 Extend `src/integration/stub-services.ts` and the end-to-end spec with a GSX stub

## 6. Dashboard

- [x] 6.1 Carry ground-service state on `StatusRegistry` / `StatusSnapshot`
- [x] 6.2 Render the section in `src/presentation/tui/frame.ts` — one line per service, name,
  state, and progress where there is one; omitted entirely when there is nothing to show
- [x] 6.3 Decide from the task 1 capture whether the stand and handling operator earn a line
  — stand yes (real data, useful); operator no (never populated in the capture), though it stays
  in the domain model
- [x] 6.4 Hold to the frame's existing rules: exact width, minimum width, no colour, Windows
  console box drawing, state distinguishable without colour
- [x] 6.5 Extend the frame and preview specs, and check `npm run preview`

## 7. Close out

- [x] 7.1 `npm run lint:ci`, `npm run typecheck`, `npm test`
- [x] 7.2 README: what the GSX integration does, that it is optional, and the minimum GSX
  version implied by the capability the app needs
- [ ] 7.3 Second Windows test build for a live confirmation run — a real turnaround with the
  dashboard open
- [ ] 7.4 Fold any correction from that run back into the fixtures and the specs
