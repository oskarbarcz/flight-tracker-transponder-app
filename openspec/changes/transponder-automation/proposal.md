## Why

The transponder is the one part of a flight the pilot has to remember to work by hand. The
platform already knows where the flight is — it is the pilot who moved it to boarding, and it
is the pilot who closed it on block — and the app already reads that flight every thirty
seconds. It just does not look at the phase.

**Transmission is on from the moment the app starts.** Whatever the pilot is doing in the
simulator — a circuit, a test flight, sitting cold and dark at the gate an hour before their
slot — the position goes out under the callsign of a flight that has not begun. The pilot's
only defence is to notice and press `t`, which is a thing to remember at exactly the moment
there are already enough of them.

**Nothing switches it off at the end, either.** The flight reaches the stand, the pilot
offboards on the platform, and the transponder is still publishing the aircraft's position as
it is repositioned, reloaded or left running while the pilot makes coffee. The track the
platform stores is longer than the flight it belongs to.

**The pilot cannot ask for the flight again.** The dashboard offers a key for the callsign, the
session, the log and the update, but the one thing that changes minute to minute — the flight
itself — can only be waited for. A pilot who starts boarding on the platform and then looks at
the transponder has nothing to press.

**Every report costs the same at every altitude.** Ten seconds is the right interval on a base
leg. In the cruise it describes a straight line three times over.

## What Changes

- **The flight arms the transponder.** Boarding started switches it to `MODE C`; on block
  switches it to `STBY`. The pilot works the platform, and the transponder follows.
- **It starts in standby.** Nothing is published until a flight asks for it, so an app left
  running publishes nothing for a flight that has not begun.
- **Starting mid-flight arms it at once.** A crash, a restart or a late start finds the flight
  already under way and picks it up on the first reading, rather than waiting for a boarding
  that has already happened.
- **The pilot still overrules it.** The two edges are the only moments the app touches the
  switch. A `t` pressed between them stands until the flight reaches the next one.
- **`r` reads the flight again.** A phase changed in the platform is picked up on a keypress
  instead of at the next poll.
- **The flight is read the moment the app starts.** The ADS-B token check no longer stands in
  front of it, so the dashboard opens on the pilot's flight rather than on an empty box.
- **Half the reports above ten thousand feet.** Thirty seconds in the cruise, ten below,
  takeoff and touchdown still on the second they happen.

## Capabilities

### Modified Capabilities

- `sim-position-feed` — what switches transmission on and off, and how often reports go out.
- `desktop-runtime` — when the flight is first read, and the keys the dashboard offers.

## Impact

- **The pilot who never used `t` gains a transponder that works itself.** The pilot who used it
  to stay quiet now gets that for free before boarding and after the stand.
- **A flight the pilot never boards on the platform is never tracked.** That is the point, and
  it is also the one way this can surprise someone: a pilot who flies without touching the
  platform used to be published anyway, and now is not. `t` and `c` are still there for a
  flight that lives outside the platform.
- **Tracks stop at the stand.** Anything the platform recorded after on-block on earlier
  flights was the aircraft being repositioned, not the flight.
- **Fewer reports per flight, and the same track.** A thirty-second interval at cruise speed is
  roughly four miles between points on a leg that is a straight line.
- **The key labels shortened.** `[r]` does not fit an eighty-column line beside
  `toggle xpndr mode` and `custom callsign`, so both lost a word. No key changed meaning.
