## 1. The flight's phase reaches the app

- [x] 1.1 `FlightStatus` covers the twelve phases the API documents, with a reader that answers none-at-all for anything else, so a phase added on the platform cannot throw.
- [x] 1.2 `CurrentFlight.status` carried through `getFlight()` alongside the callsign, and the stub-service integration tests read a real phase off the wire.

## 2. Two edges, and a first reading

- [x] 2.1 `TransponderSchedule` answers on, off, or nothing at all, from the phase last seen against the phase now: boarding started arms it, on block silences it, everything between says nothing.
- [x] 2.2 The first reading of a flight is answered from the phase itself, so an app started mid-flight arms itself rather than sitting out the sector.
- [x] 2.3 The memory is cleared when the flight goes away or the session does, so the next flight gets its own first reading — and left alone on a network failure, which is not a flight ending.
- [x] 2.4 `main` applies the decision on every poll, on sign-out, and does nothing when the switch is already where the decision wants it, so nothing is logged twice.

## 3. Standby is where it starts

- [x] 3.1 `PositionFeed` and `StatusRegistry` both start in standby, and agree, so the dashboard cannot say MODE C over a feed publishing nothing.
- [x] 3.2 `reportState()` opened up so the ADS-B token check can ask the feed what it is doing rather than stamping `connected` over it.

## 4. The flight is read as the app starts

- [x] 4.1 The ADS-B token check runs alongside start-up rather than in front of it, so the dashboard opens on the pilot's flight rather than after a seven-second timeout.
- [x] 4.2 `r` on the dashboard re-reads the flight, guarded so a held key cannot stack up requests.
- [x] 4.3 The hint line carries `[r]`, and `toggle xpndr mode` and `custom callsign` shortened to make room for it.
- [x] 4.4 A test pins the hint line to eighty columns in its longest state — a session to end, log pane open — so the next key added fails the suite rather than the pilot's terminal.

## 5. The cadence follows the altitude

- [x] 5.1 `RatePolicy` takes the report's altitude and picks thirty ticks above ten thousand feet, ten at or below, with an unusable altitude read as the lower.
- [x] 5.2 Both on-ground edges still publish on the tick they happen, at either cadence; coming down through the threshold publishes at once rather than at the end of the interval.

## 6. Documentation

- [x] 6.1 README: the phase-to-mode table, what starting mid-flight does, where the switch is the pilot's, the two cadences, and a table of every key.
