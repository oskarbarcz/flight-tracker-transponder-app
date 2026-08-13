## Purpose

Read the simulated aircraft from MSFS 2024 and publish its position to the ADS-B service
under the callsign of the pilot's current flight, so `flight-tracker-api` can track the
flight.

## ADDED Requirements

### Requirement: The simulator connection is established locally and retried

The system SHALL connect to the simulator over the local SimConnect transport, discovering
the endpoint from the simulator's own configuration rather than asking the pilot for it, and
SHALL pin the protocol version it requests. A refused connection SHALL be treated as the
normal state of a simulator that is not running: the system SHALL retry with backoff
indefinitely and SHALL NOT exit, and every other function SHALL continue to work while the
simulator is absent.

#### Scenario: The simulator is not running

- **WHEN** the app starts with no simulator session
- **THEN** it reports the simulator as disconnected, retries in the background, and rich
  presence continues to be published

#### Scenario: The simulator starts after the app

- **WHEN** a session is loaded some time after the app started
- **THEN** the next retry connects and position reports begin without the pilot restarting
  anything

#### Scenario: The simulator closes mid-flight

- **WHEN** the simulator quits while reports are being published
- **THEN** publishing stops, the app reports the simulator as disconnected, and it resumes
  when a session returns

### Requirement: Position reports are published under the flight's callsign

The system SHALL publish each report under the callsign of the pilot's current flight, read
from the API and normalised exactly as the API normalises it — whitespace removed, upper
case. The system SHALL NOT derive the callsign from the simulator, and SHALL publish nothing
while the pilot has no current flight.

#### Scenario: The pilot has checked in

- **WHEN** the pilot's current flight has callsign `AAL4908`
- **THEN** every report is published as `AAL4908`, whatever the aircraft's `ATC ID` says

#### Scenario: The pilot is flying without checking in

- **WHEN** the pilot has no current flight
- **THEN** no report is published, and the app reports that it is waiting for a flight

#### Scenario: The current flight changes

- **WHEN** the pilot closes one flight and checks in for another while the app runs
- **THEN** subsequent reports are published under the new flight's callsign

#### Scenario: The simulator identifier disagrees with the flight

- **WHEN** the aircraft's `ATC ID` differs from the flight's callsign
- **THEN** the flight's callsign is used and both values are shown in diagnostics

### Requirement: Reports carry the full state the ADS-B contract accepts

The system SHALL send position, altitude, ground speed, track, vertical rate, on-ground
state and squawk with each report, and SHALL decode the simulator's binary-coded-decimal
transponder value into the four squawk digits. A value the simulator does not supply SHALL be
omitted rather than sent as zero.

#### Scenario: Squawk is decoded from BCD

- **WHEN** the simulator reports transponder code `0x1200`
- **THEN** the published squawk is `1200`

#### Scenario: The aircraft is on the ground

- **WHEN** the simulator reports the aircraft on the ground
- **THEN** the report states on-ground rather than inferring it from altitude or speed

### Requirement: Publication rate follows the phase of flight

The system SHALL publish one report per second while the aircraft is airborne and one per
five seconds while it is on the ground, and SHALL publish immediately on a transition between
the two so the takeoff and touchdown edges are recorded at full precision.

#### Scenario: Lift-off

- **WHEN** on-ground state changes from true to false
- **THEN** a report is published on that tick rather than at the next interval

#### Scenario: Parked at the gate

- **WHEN** the aircraft has been stationary on the ground for a minute
- **THEN** roughly twelve reports have been published, not sixty

### Requirement: Reports survive a failed publish

The system SHALL queue reports that could not be published, retry them with backoff, and
bound the queue so a long outage cannot exhaust memory, discarding the oldest reports first.
Reports SHALL be published with the timestamp at which they were sampled, never the time at
which the retry succeeded.

#### Scenario: The ADS-B service is briefly unreachable

- **WHEN** publishing fails for two minutes and then succeeds
- **THEN** the queued reports are published with their original timestamps and the track has
  no gap

#### Scenario: The outage outlasts the queue

- **WHEN** the outage exceeds the queue bound
- **THEN** the oldest reports are discarded, the newest are kept, and the app reports that
  reports were dropped
