# Running the GSX capture

> **Round two is done.** The protocol is understood and the app is built. What remains is the
> confirmation run in "Confirming the finished integration" at the bottom — not another
> capture.

One run on the simulator PC produces the recording every later task is tested against. It is
worth doing carefully, because the point is not to need a second one.

## Getting the build

Run the **test-build** workflow on this branch (Actions → test-build → Run workflow →
`feature/gsx-integration`). It compiles the Windows executable and attaches it as an artifact
named `mypreflight-transponder-<branch>-<sha>`. Download it, unzip it, and put
`mypreflight-transponder.exe` in a folder of its own — the capture is written next to the
executable, so do not run it from `Downloads`.

## What to run

```
mypreflight-transponder.exe --gsx-capture
```

It connects to GSX at `127.0.0.1:8744`, probes the interface once, prints a summary, and then
records until you press Ctrl+C — which prints the summary again, covering everything recorded.

If GSX is on another machine, set `GSX_HOST` (and `GSX_PORT` if it is not 8744) before
running.

## What it does, and what it does not

It records. The probes it sends are inert by construction: every probe either reads something,
or names a service id GSX cannot have (`__probe_no_such_service__`), so a verb that turns out
to exist answers `not_found` rather than actually starting a service. No menu entry is ever
picked, at any index.

Even so, run it **parked at a gate in a throwaway session** rather than during a flight you
care about.

## The runs to make

**Run 1 — a turnaround.** Start GSX, then start the capture, then work a normal turnaround.
Ideally an arrival with deboarding, then a departure: catering, refuel, boarding, GPU, stairs
or jetway, and pushback at the end. The more services that actually run, the more of the
protocol is pinned down. Ctrl+C when the pushback finishes.

**Run 2 — a late start.** A short one. Start the capture *before* GSX, wait for it to say it
cannot reach GSX, then start GSX and confirm it connects on its own. Ctrl+C after a minute.

Keep the two `gsx-capture.jsonl` files separate — the second will overwrite the first if both
run in the same folder, so rename the first before the second run.

## What to send back

- Both `gsx-capture.jsonl` files, zipped.
- The console summary block, copied and pasted (it is small, and it is the part that settles
  the probe answers).

## What the summary is telling us

```
hello       the capabilities this GSX advertises
pushed      how many frames GSX sent unasked — the first run got ZERO,
            which is the question this round exists to answer
types       every frame type that arrived
keys        which top-level parts of GSX's state actually arrived
services    the service ids this GSX publishes
states      every state value seen across the session
probes      KNOWN / absent per message type, with GSX's own error wording
warning     if this line appears, the control type was not refused the way
            it should be and every verdict is inconclusive
```

A request is `{"v":1,"type":"<verb>","id":"<id>", ...arguments}` — GSX dispatches on `type`,
and refuses anything else with `"unknown message type"`. So a probe answered with any *other*
complaint proves that type is real and only its arguments were wrong. That is what `KNOWN`
means.

## The one thing to watch for

The first run recorded no state whatsoever — GSX sent a `hello` and then nothing, for ten
minutes, with a flight loaded. This round probes `subscribe`, `state.get`, `get` and a client
`hello` to find whatever opens the feed.

So after the probes finish, **leave it running for a minute and watch**. If `pushed` climbs
above zero in the Ctrl+C summary, something in the probe list woke GSX up, and the JSONL says
which message came immediately before the first snapshot.

## If it will not connect

`--gsx-capture` fails immediately when GSX is not there, rather than retrying — that is
deliberate for this mode. Check GSX is running, and that its remote server is enabled:
GSX Settings → Network → Remote control server (on by default since 4.0.7). The Network tab
also shows the address and port GSX is actually listening on.


## Confirming the finished integration (task 7.3)

Run the **test-build** workflow again and take the new executable. This time run it normally,
with no flags:

```
mypreflight-transponder.exe
```

Sign in, start a flight, and work a turnaround with GSX. A sixth dashboard section titled
**6 GROUND** should appear once a service is actually running, showing the stand and a line
per service.

What to check, and report back:

- The section appears when boarding starts, and is absent before anything runs.
- Passenger and cargo figures move and match what GSX itself shows.
- **A refuel**, which no capture has yet covered — `detail.fuel` is the one shape still taken
  on trust. If the refuel line reads oddly or shows nothing, say so and send the JSONL.
- A completed service stays reading `[DONE]` rather than reverting once GSX offers it again.
- Quitting GSX mid-turnaround makes the section disappear without anything reporting a fault,
  and restarting GSX brings it back on its own within about twenty seconds.
