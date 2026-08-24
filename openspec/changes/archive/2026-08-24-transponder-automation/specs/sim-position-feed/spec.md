## ADDED Requirements

### Requirement: The transponder follows the flight through its own phases

The system SHALL read the phase of the pilot's current flight alongside its callsign, and SHALL
switch transmission on when the flight reports that boarding has started and off when it
reports on block, so that a pilot who works the platform never has to work the transponder as
well.

The system SHALL act on the flight reaching each of those two phases rather than on the phase
it is sitting in, so that a switch the pilot throws between them stands until the flight
reaches the next one. No other phase SHALL move the switch.

Where the app first reads a flight that is already under way — anywhere from boarding started
to taxiing in — it SHALL arm itself on that first reading rather than wait for a boarding that
has already happened. Where that first reading finds a flight that has not begun, or one on
block or past it, it SHALL stay in standby. A flight that ends and a flight that follows it
SHALL be read as two flights, each getting its own first reading.

A phase the system cannot recognise SHALL move nothing, and SHALL NOT stop the callsign being
published under.

#### Scenario: Boarding starts

- **WHEN** the current flight moves to boarding started
- **THEN** the transponder switches itself to MODE C, and says so where the pilot can read it

#### Scenario: The flight reaches the stand

- **WHEN** the current flight moves to on block
- **THEN** the transponder switches itself to standby, and nothing further is published for
  that flight

#### Scenario: The pilot overrules it mid-flight

- **WHEN** the pilot switches to standby in the cruise
- **THEN** it stays in standby through taxiing in, rather than being switched back on by the
  next phase the flight reports

#### Scenario: The app is started in the cruise

- **WHEN** the app starts, or signs in, while the current flight is in cruise
- **THEN** it arms itself on the first reading of that flight, without waiting for a phase to
  change

#### Scenario: The app is started before boarding

- **WHEN** the app starts while the current flight is checked in
- **THEN** it stays in standby until that flight reports boarding started

#### Scenario: One flight follows another

- **WHEN** the pilot closes a flight on block and checks in for the next one, which then begins
  boarding
- **THEN** the transponder arms itself for the new flight, as it did for the first

#### Scenario: A phase the app does not know

- **WHEN** the flight reports a phase this build has never heard of
- **THEN** the switch is left where it is and the callsign is still published under

## MODIFIED Requirements

### Requirement: The pilot can stop transmitting without stopping the app

The system SHALL let the pilot switch position transmission off and on while it runs, and
SHALL report which of the two it is doing. Transmission SHALL start off, so that a transponder
which has just been switched on publishes nothing until a flight asks for it. While it is off,
nothing SHALL be published and nothing SHALL be queued for later.

#### Scenario: Switched off mid-flight

- **WHEN** the pilot switches transmission off
- **THEN** publishing stops, the state reads as standby, and the switch survives a change of
  current flight

#### Scenario: Switched back on

- **WHEN** the pilot switches transmission on again
- **THEN** publishing resumes from the next sample, and the positions from before the switch
  are not backfilled into the gap the pilot asked for

#### Scenario: The app has only just started

- **WHEN** the app starts and has not yet read a flight
- **THEN** it reads as standby and publishes nothing, whatever the simulator is doing

### Requirement: One report every ten seconds, and both edges exactly

The system SHALL publish one position report every ten seconds below ten thousand feet and one
every thirty seconds above it, since a track at cruise is a straight line that a third of the
reports describes just as well. The threshold SHALL be read from the altitude carried by the
report itself, and an altitude the simulator could not supply SHALL be treated as the lower of
the two.

The system SHALL publish immediately on a transition between airborne and on-ground so the
takeoff and touchdown edges are recorded at full precision, at either cadence. The simulator
SHALL continue to be sampled once a second, so that a transition is noticed within a second of
happening rather than at the next report.

#### Scenario: Steady flight

- **WHEN** the aircraft has been airborne for a minute below ten thousand feet
- **THEN** six reports have been published, ten seconds apart

#### Scenario: In the cruise

- **WHEN** the aircraft has been at thirty-five thousand feet for three minutes
- **THEN** six reports have been published, thirty seconds apart

#### Scenario: Descending through the threshold

- **WHEN** the aircraft descends out of the cruise below ten thousand feet
- **THEN** the ten-second cadence resumes from the first report below it, rather than at the
  end of the thirty-second interval it was in

#### Scenario: Lift-off

- **WHEN** on-ground state changes from true to false
- **THEN** a report is published on that tick rather than at the next interval

#### Scenario: Parked at the gate

- **WHEN** the aircraft has been stationary on the ground for a minute
- **THEN** six reports have been published, not sixty
