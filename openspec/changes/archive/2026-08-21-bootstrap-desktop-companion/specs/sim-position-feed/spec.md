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

### Requirement: Reports carry every field the ADS-B contract requires

The system SHALL send position, altitude, ground speed, track, vertical rate, on-ground
state and squawk with each report. `CreatePositionRequest` lists all thirteen fields as
required, so a value the simulator does not supply SHALL travel as a zero rather than be
omitted: a report missing one field is answered `400` and stored nowhere.

The system SHALL decode the simulator's transponder value into four squawk digits, reading it
as binary-coded decimal first because that is what MSFS documents, and as a plain decimal
second because not every aircraft honours that. A value that is neither SHALL be published as
`2000` — the ICAO code for an aircraft with no assignment — rather than left out.

#### Scenario: Squawk is decoded from BCD

- **WHEN** the simulator reports transponder code `0x1200`
- **THEN** the published squawk is `1200`

#### Scenario: The aircraft hands back a decimal transponder code

- **WHEN** the simulator reports `7000` rather than `0x7000`
- **THEN** the published squawk is `7000`, and the report is not left without one

#### Scenario: The transponder value is not a squawk under either reading

- **WHEN** the simulator reports a value that is four octal digits in neither spelling
- **THEN** the published squawk is `2000`, and the report is published rather than refused

#### Scenario: The aircraft is on the ground

- **WHEN** the simulator reports the aircraft on the ground
- **THEN** the report states on-ground rather than inferring it from altitude or speed

### Requirement: A report the service refuses does not block the ones behind it

The system SHALL distinguish a service that cannot take a report now from one that will never
take this report. A response that will not change on a retry SHALL cause that report to be
discarded and counted as dropped, and the next report SHALL be attempted immediately. The
reason the service gave SHALL be reported, not just the status code.

#### Scenario: One malformed report

- **WHEN** the service answers `400` to a report
- **THEN** that report is dropped, the reason the service gave is shown, and the reports
  behind it are published

#### Scenario: The service asks us to come back later

- **WHEN** the service answers `429` or `503`
- **THEN** the report is kept and retried with backoff, as an outage rather than a refusal

### Requirement: The pilot can stop transmitting without stopping the app

The system SHALL let the pilot switch position transmission off and on while it runs, and
SHALL report which of the two it is doing. Transmission SHALL be on unless the pilot switches
it off, so a flight that never asks behaves as it always did. While it is off, nothing SHALL
be published and nothing SHALL be queued for later.

#### Scenario: Switched off mid-flight

- **WHEN** the pilot switches transmission off
- **THEN** publishing stops, the state reads as standby, and the switch survives a change of
  current flight

#### Scenario: Switched back on

- **WHEN** the pilot switches transmission on again
- **THEN** publishing resumes from the next sample, and the positions from before the switch
  are not backfilled into the gap the pilot asked for

### Requirement: A hand-typed callsign is checked before it is published under

The system SHALL check a callsign the pilot types by hand and refuse one the ADS-B service
would not accept, telling the pilot why. A callsign the API supplies SHALL be taken as
authoritative and published unchanged.

#### Scenario: A typo in the override

- **WHEN** the pilot types a callsign that is too short, too long, or not letters, digits and
  hyphens
- **THEN** the override is refused with a reason, and nothing is published under it

### Requirement: One report every ten seconds, and both edges exactly

The system SHALL publish one position report every ten seconds, and SHALL publish immediately
on a transition between airborne and on-ground so the takeoff and touchdown edges are recorded
at full precision. The simulator SHALL continue to be sampled once a second, so that a
transition is noticed within a second of happening rather than at the next report.

#### Scenario: Steady flight

- **WHEN** the aircraft has been airborne for a minute
- **THEN** six reports have been published, ten seconds apart

#### Scenario: Lift-off

- **WHEN** on-ground state changes from true to false
- **THEN** a report is published on that tick rather than at the next interval

#### Scenario: Parked at the gate

- **WHEN** the aircraft has been stationary on the ground for a minute
- **THEN** six reports have been published, not sixty

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
