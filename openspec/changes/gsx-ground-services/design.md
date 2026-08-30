## Context

See proposal.md — Why. Requirements are in `specs/`.

What shapes this design more than anything else is the development loop. The maintainer works
on macOS; GSX runs only on a separate Windows machine with MSFS. Every trip to that machine
costs a build, a copy and a manual run. So the design's first obligation is that almost
nothing needs that machine: the protocol is recorded once, and everything after is exercised
against the recording.

The protocol itself is understood from FSDT's own release notes plus one open-source
integration's live captures — real wire data, but from one session, one airport, one aircraft.
The vendor's authoritative *Couatl Remote API v2 — Developer Guide* ships inside
`GSX_manual_MSFS.pdf` in the GSX installation. Treat every shape below as provisional until
the capture in task 1 confirms it.

Facts that are load-bearing:

- GSX serves a WebSocket at `127.0.0.1:8744`; no authentication on the local machine.
- Frames are `hello` (capabilities), `snapshot` (whole state), `patch` (one top-level key,
  replaced entirely), `result` (reply to a request).
- The service feed updates at roughly 1 Hz for the whole run of a service — one frame per
  passenger boarded.
- `handlerData` is around 1.7 MB and arrives on every connection.
- GSX restarts its own engine routinely; the socket drops when it does.

**Confirmed against the real GSX (2026-08-30, first capture run):**

- The handshake is exactly as assumed. `{"v":1,"type":"hello","protocol":1,"engine":"couatl",
  "sim":"MSFS","gsxRunning":true,"authRequired":false,"capabilities":[...]}` with all nine
  capabilities present, including `services`, `handlerSet` and `gate`.
- **A request carries the verb as its `type`.** There is no envelope around a verb: a message
  with `type: "request"` and a `verb` field is refused with
  `{"code":"bad_args","message":"unknown message type"}`. GSX dispatches on `type`, so a
  request is `{"v":1,"type":"<verb>","id":"<id>", ...arguments}`.
- `"unknown message type"` is therefore the sentinel for an unsupported verb, and any *other*
  complaint is evidence that the verb is real and only its arguments were wrong.
- **A snapshot does NOT follow the hello. The client must `subscribe` first.** Across three
  connections the only unsolicited frame was the `hello`; sending
  `{"v":1,"type":"subscribe","id":"..."}` is accepted and GSX then pushes its whole state and
  keeps it current. This contradicts the reference implementation's notes, and it is the one
  step without which nothing else works.
- **Frame types seen on the wire:** `hello`, `snapshot`, `patch`, `result`, and `event`.
- **All twelve services are published, under exactly the expected ids** — `Boarding`,
  `Catering`, `Cleaning`, `DeIce`, `Deboarding`, `Departure`, `GPU`, `Lavatory`,
  `OperateJetways`, `OperateStairs`, `Refueling`, `Water`. States observed live:
  `available`, `performing`, `completed`.
- **Top-level state keys, as published:** `aircraft`, `airline`, `airport`, `billing`,
  `commandIcons`, `commandIconsSvg`, `gateProperties`, `handlerData`, `menu`, `menuShown`,
  `message`, `parking`, `search`, `services`, `settings`, `simbrief`, `startup`, `state`,
  `stateText`, `statusHtml`. Note `commandIcons`/`commandIconsSvg`/`statusHtml` are not in the
  reference notes and are icon and markup payloads this change discards; `operators`,
  `prompt` and `receipt` did not appear in this session.
- **`service.trigger` and `service.bypass` drew no reply at all** — neither accepted nor
  refused as an unknown type. Still unresolved, and nothing here depends on it.
- **A patch addresses one top-level key with a leading slash**, and GSX resends the whole
  value under it. Over one boarding: `/services` 352 times, `/statusHtml` 352, `/billing` 347,
  `/message` 29, `/menu` 14, `/settings` 14, `/menuShown` 7, and one patch each for `/state`,
  `/stateText`, `/airport`, `/parking`, `/gateProperties`, `/aircraft`, `/airline`,
  `/commandIcons`, `/commandIconsSvg`, `/simbrief`, `/search`, `/startup`. So the ~1 Hz
  service cadence is real, and the identity keys are written once at subscribe and then stay
  put.
- **An `event` frame carries a `topic` and a `model`**, not loose fields:
  `{"v":1,"type":"event","ts":...,"topic":"startup","model":{"active":false,"bars":[],"sid":...}}`.
- **GSX emits keys differing only in case within one object** — `PushBack` and `pushback` were
  seen together. `JSON.parse` is case-sensitive so this costs the app nothing, but it does
  mean GSX's payloads cannot be round-tripped through a case-insensitive parser (Windows
  PowerShell's `ConvertFrom-Json` refuses them outright), which matters for any tooling built
  around a capture.

## Goals / Non-Goals

**Goals:**

- All decoding, normalisation and rendering logic verifiable from a recorded session, with no
  simulator and no Windows.
- GSX's absence, arrival, departure and restart are all ordinary states of one small machine.
- A publisher-shaped seam, so sending this to the tracker API later is a new adapter rather
  than a rework.
- No new runtime dependency.

**Non-Goals:**

- Any write to GSX. No verb is sent outside capture mode's probes.
- Any use of GSX's airport, billing, receipt or settings data.
- A GSX menu surface in the TUI.

## Decisions

### Node's global `WebSocket`, not a library

Node 26 ships a stable global `WebSocket`. The app's two-runtime-dependency footprint is
something the README advertises, and a third dependency for a transport already in the runtime
is not worth it.

It also removes the single worst hazard in this protocol. `handlerData` is ~1.7 MB and always
arrives fragmented; a client that decodes each fragment independently corrupts any multi-byte
character split across a boundary into `U+FFFD` — producing JSON that still parses, with no
error to notice. Node's `WebSocket` delivers reassembled messages, so the failure cannot occur.

*Alternative considered:* `ws`. Faster, more configurable, and neither matters here.

### State is replaced per key, never merged

`GsxRemoteState` holds a flat map keyed by the top-level names GSX patches (`services`,
`airport`, `parking`, …). A `patch` assigns; a null or absent value deletes. This mirrors
GSX's own web client.

This is not a style preference. GSX's patches are coarse — a patch resends the *whole*
collection under that key, never a delta within it. A deep merge would retain a service GSX
has withdrawn, permanently.

### Normalise at the boundary, into a domain type

`src/domain/ground-services.ts` owns the app's own vocabulary: `boarding`, `deboarding`,
`refueling`, `pushback`, `jetway`, `stairs`, `gpu`, `deicing`, `catering`, `lavatory`,
`water`, `cleaning`, and states `requestable | requested | performing | completed | bypassed`.
GSX's `Departure` becomes `pushback`; `OperateJetways` becomes `jetway`.

Unknown service ids and unknown states are dropped and left unstated respectively, rather than
passed through. The infrastructure layer never hands GSX's own strings upward.

*Alternative considered:* carrying GSX's shape through to the dashboard. Rejected — it puts a
third-party product's vocabulary in the app's core and in whatever payload the tracker API
eventually takes.

### The service row, as GSX actually publishes it

Confirmed from a live boarding (`fixtures/services-boarding.json`). Three corrections to what
the reference notes said:

- **The phase field is `detail.phase`, not `detail.busPhase`.** It is free text describing
  whatever equipment is in play — `"front loader loading, front train approaching"`, `"docked"`
  — not a bus-specific enumeration.
- **`detail.cargo` is an array of holds, and the reference does not mention it at all.** Each
  entry is `{hold, unit, done, total, trip?, trips?, train?}`, e.g. front hold 16/20 ULDs on
  train 5 of 5. It sits alongside `bagsPercent`, which stays a single percentage.
- **`operator` is absent on every row in the captured session.** The reference showed it
  populated, so it is optional and the model must not require it.

Everything else held: `id`, `displayName`, `state` with `stateRaw` (1 available, 5 performing,
6 completed), `stateText`, `icon`, `canTrigger`, `canBypass`, `statusText` with embedded
newlines, and `progressText`. Fuel detail was not observed — refuelling never ran — so
`detail.fuel` remains the one shape taken on trust.

### `detail.pax`, never `progress`

On a captured deboarding GSX published `progress: {current: 181, total: 181}` alongside
`detail.pax: {done: 181, total: 186}`. GSX's progress bar is current-out-of-current, so the
obvious field states that the service has finished while five passengers are still aboard.
`detail.pax` is the only trustworthy source, and `progress` is read for no service.

### Completion is sticky, and the turnaround is what resets it

GSX returns a completed service to requestable so it can be asked for again, so the live feed
alone cannot distinguish "finished" from "never started". A `Turnaround` in the domain layer
retains the highest state each service reached and clears when the aircraft leaves the ground
or the current flight changes — both facts the app already holds, in `SimSample.isOnGround`
and the flight the position feed follows.

*Alternative considered:* rendering GSX's live state verbatim. Rejected — the dashboard would
show boarding complete and then revert it to not-started a second later.

### One connection machine, two retry speeds

```
   ┌────────────┐   connect refused (instant on localhost)
   │  SEARCHING │◀──────────────────────────────┐
   └─────┬──────┘   every 20 s                  │
         │ socket open                          │
         ▼                                      │
   ┌────────────┐   hello → capabilities        │
   │ HANDSHAKE  │   (no service surface → UNSUPPORTED)
   └─────┬──────┘                               │
         │ snapshot                             │
         ▼                                      │
   ┌────────────┐                               │
   │ CONNECTED  │───── socket drops ────────────┘
   └────────────┘      first retry ~1 s, then 20 s
```

Twenty seconds is what the pilot asked for and what an absent GSX deserves. But a GSX engine
restart also drops the socket, and waiting a flat twenty seconds after each one leaves a
visible hole in a feed that is otherwise live. A fast first retry decaying to the steady
interval covers both, and reuses the shape `PositionFeed` already has in
`INITIAL_RETRY_DELAY_MS` → `MAX_RETRY_DELAY_MS`.

### Capabilities, not versions

The connected GSX advertises what it supports in its `hello`. The vendor's guidance is to
feature-detect on that and never compare version numbers. A non-empty capability set lacking
the service surface is positive evidence that this GSX cannot supply ground services — a
distinct state from not having connected at all, and the dashboard should not conflate them.

### Discard `handlerData` on receipt

The stand database is ~1.7 MB per connection and this change uses none of it. It is dropped as
soon as its key is recognised, before anything retains it. It also carries operator names and
the pilot's SimBrief account, which is a second reason never to log a raw frame — none of
GSX's payloads go to the application log, only verb names and error codes.

### Layering

```
  domain/ground-services.ts        vocabulary, state machine, Turnaround, sticky completion
  application/ports/ground-services.ts    GroundServicesSource
  application/ground-services.feed.ts     sibling of position.feed.ts, under Supervisor
  infrastructure/gsx/remote.client.ts     WebSocket, frames, flat state, reconnection
  application/status.ts + presentation/tui/frame.ts    the dashboard section
```

This is the arrangement `src/architecture.spec.ts` already enforces, and the position feed
already demonstrates. The feed depends on a port; the dashboard reads `StatusRegistry`. When
the tracker API grows an endpoint, a `GroundServicesPublisher` port and an adapter beside
`AdsbClient` are the whole of the addition.

### Capture mode as task one

A `--gsx-capture` mode connects, appends every received frame as `{receivedAt, raw}` to
`gsx-capture.jsonl` beside the executable, and prints a copyable console summary: the `hello`
frame verbatim, the top-level keys observed, and the result of each probe.

The probes settle one real gap. Every service publishes `canTrigger` and `canBypass`, which
implies verbs that act on them, but no such verb is attested anywhere. Sending a candidate
verb is safe — an unrecognised verb returns `{"ok":false,"error":{"code":"unknown_verb"}}` and
does nothing — so the probe list (`service.trigger`, `service.bypass`, `state.get`,
`handler.get`, `gate.list`) costs one run and settles whether a future change can drive GSX
directly or must walk its menu.

**`menu.pick` is never sent, at any index.** There is no "cancel" index: `-1` selects the
*last* entry, because GSX is Python, and on the standard menu that entry is *Reposition
Aircraft* — it would teleport the aircraft, with nothing reported as failed.

The recording becomes the fixture set. Every subsequent task is tested by replaying it.

## Risks / Trade-offs

- **The protocol shapes here come from one captured session at one airport.** → Task 1 is the
  capture, and every shape-dependent task depends on it. Decoding is written to tolerate
  missing fields rather than assert them, so an unexpected shape degrades to less detail
  rather than to a crash.
- **A verb probe might do something rather than be refused.** → Probes are run parked, in a
  throwaway session, and the one verb that can move the aircraft is never sent.
- **The service feed is ~1 Hz for the whole run of a service.** → Nothing downstream is
  driven per frame; the dashboard already repaints on its own 250 ms timer by difference, so
  the frames only mutate state. This becomes a real concern when a publisher is added, and the
  bucketing that will need is deliberately left for that change.
- **GSX has no authentication on localhost.** → The app only reads, and this change sends no
  verb outside capture mode.
- **`isOnGround` as the turnaround reset is a proxy, not a fact GSX states.** → It is the best
  signal the app holds, and being wrong costs a stale completed marker on the dashboard, not
  bad data anywhere durable.

## Open Questions

- Whether GSX exposes a verb to trigger or bypass a service. The second probe round answers
  it; no requirement in this change depends on the answer.
- Whether `subscribe` accepts a `capabilities` list that actually narrows what GSX pushes. A
  bare `subscribe` and one carrying `capabilities` were both accepted, and the full state
  arrived either way; the capture cannot tell which of the two produced it. Narrowing would
  only save bandwidth on a loopback socket, so the client subscribes bare.
- Which of `airport`, `parking`, `gateProperties` and `operators` are worth a dashboard line
  alongside the services. The capture shows what a real session carries, and the frame is
  narrow; this is a rendering choice made in task 6, not an architectural one.
