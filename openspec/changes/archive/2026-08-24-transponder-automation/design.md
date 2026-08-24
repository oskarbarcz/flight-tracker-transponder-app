## Context

The platform already holds the state this change needs. `GET /api/v1/flight/{id}` carries a
`status` field with twelve values — `created`, `ready`, `checked_in`, `boarding_started`,
`boarding_finished`, `taxiing_out`, `in_cruise`, `taxiing_in`, `on_block`,
`offboarding_started`, `offboarding_finished`, `closed` — and the app has been reading that
response every thirty seconds all along for the callsign, throwing the phase away.

So the question is not how to know where the flight is. It is what to do with a phase that
arrives thirty seconds late, on a switch the pilot can also reach.

The constraints that shaped the answer:

- The poll is a poll. A phase can be several seconds old, and two phases can arrive in the same
  reading if the pilot moves fast on the platform.
- The pilot's `t` and the app's decisions write to the same switch, and the pilot's is the one
  that must win — a transponder that argues with the pilot is worse than one that does nothing.
- The app is restarted mid-flight more often than anyone would like: a crashed simulator, a
  reboot, a pilot who starts the transponder after pushback.
- Nothing here can be allowed to stop the callsign being published under. The phase is a
  convenience; the callsign is the product.

## Decisions

### Two edges, not a band

The obvious reading is a band: transmit while the phase is one of the five between boarding and
the stand. It is one line, and it is wrong. A band re-asserts itself on every reading, so a
pilot who goes to standby in the cruise is switched back on thirty seconds later, or at the
next phase change, by an app that thinks it knows better.

So the app acts on the flight *reaching* `boarding_started` and *reaching* `on_block`, and on
nothing else. Between them the switch belongs to whoever touched it last, which is almost always
the pilot. The state that makes this possible is one field — the phase last seen — and the
comparison is against that, not against the switch.

### The first reading of a flight is a special case

An edge-triggered rule has nothing to say when the app starts up in the middle of a flight: the
boarding it would have acted on happened before the process existed. Left alone it would sit in
standby through an entire sector.

So the first reading of any flight — the app starting, a sign-in, a new flight after the last
one ended — is answered from the band after all: `boarding_started` through `taxiing_in` arms
it, anything else leaves it in standby. It is the one moment where "where is this flight now"
is the right question, because there is no history to contradict.

This is also why the memory is cleared when the flight goes away rather than kept: the next
flight has to get its own first reading, or a pilot who flies two sectors gets the automation on
the first and nothing on the second.

### A transient API failure is not a flight ending

Clearing the memory on any failure would let a dropped request re-arm a transponder the pilot
had deliberately silenced. So the two cases are separated: the API positively answering "no
current flight", and the session being gone, both clear it — those are real. A network failure
leaves the memory exactly as it was and changes nothing.

### Standby is the state the app starts in

The old default was transmitting, which was right when the switch existed only for a pilot who
wanted quiet. With a flight driving the switch, transmitting-by-default means every app started
before boarding publishes a position for a flight that has not begun. Starting in standby costs
the automated case nothing — the first reading arms it — and costs the un-automated case one
keypress the pilot was going to make anyway.

The status registry and the feed both hold this default, and they have to agree, or the
dashboard says `MODE C` over a feed that is publishing nothing.

### The token check moves out of the way

`verifyToken()` was awaited during start-up, in front of everything: the dashboard, the first
flight read, all of it. On a slow or unreachable ADS-B service that is seven seconds of blank
console before the pilot's own flight appears — and the check gates nothing, because nothing can
be published before a callsign arrives anyway.

It now runs alongside start-up rather than in front of it. Its success branch no longer stamps
`connected` over the connection state either: it asks the feed to report what it is actually
doing, which is a question with a right answer whenever the check happens to land.

### The altitude on the report, not a second reading of the simulator

The cadence threshold is read from the altitude the report already carries — indicated altitude,
in feet, the same number that is published. No new simulator variable, no second source to
disagree with the first, and the rule reads the same way in the code as it does in the spec.

Ten thousand feet is exclusive: at exactly ten thousand the interval is still ten seconds. Both
on-ground edges are published on the tick they happen at either cadence, so the change cannot
cost precision where precision is the whole point. Coming down through the threshold, the
counter is already past ten, so the first report below it goes out at once rather than at the
end of the thirty-second interval the aircraft was in.

## Risks / Trade-offs

- **A pilot who flies without the platform is now silent by default.** This is the intended
  behaviour and the sharpest edge of the change. `t` arms it and `c` gives it a callsign, both
  documented, and the dashboard says `STBY` in the box the pilot is already reading.
- **A phase can be up to thirty seconds late.** Boarding starts on the platform and the
  transponder arms itself at the next poll. `r` closes that gap for a pilot who cares, and
  nothing is lost by the delay: the aircraft is at the gate.
- **Two phases in one reading.** A pilot who moves from `checked_in` past `boarding_started` to
  `boarding_finished` between two polls never presents the edge, so the app leaves the switch
  alone — right by the rule, surprising in the moment. `r` and `t` both cover it, and the next
  flight's first reading is unaffected.
- **A phase name that changes on the platform.** An unknown phase is read as none at all: the
  switch is left alone and the callsign still publishes. The failure is that the automation goes
  quiet, not that the flight stops being tracked.
- **Thirty seconds is a coarser track in the cruise.** Roughly four miles between points at
  cruise speed, on a leg that is a straight line. A turn at altitude is described by its
  endpoints rather than its arc; that is the trade being made deliberately.
- **The key labels lost a word each.** `toggle xpndr mode` and `custom callsign` became
  `xpndr mode` and `callsign` to make room for `[r]` on an eighty-column line. A test now pins
  that line to eighty columns in its longest state, so the next key added fails the suite
  rather than the pilot's terminal.
