## Purpose

Read the state of the ground services being performed on the aircraft from GSX Pro running on
the pilot's own machine — who is boarding, how many passengers are aboard, how much fuel has
gone in — and make it available to the app without the pilot configuring anything and without
GSX being required at all.

## ADDED Requirements

### Requirement: GSX is discovered, never required

The system SHALL treat GSX as an optional companion. It SHALL attempt to reach GSX's remote
interface on start and SHALL retry indefinitely at a fixed interval of about twenty seconds
while it is unreachable, so a GSX started after the app — the normal case, since pilots start
GSX once the simulator has loaded — is picked up without the pilot restarting anything. A GSX
that is absent SHALL be reported as absent and SHALL NOT be reported as a fault, SHALL NOT be
retried with escalating urgency, and SHALL NOT prevent or degrade position reporting, rich
presence, updates or sign-in.

#### Scenario: GSX is not installed

- **WHEN** the app runs on a machine that has never had GSX
- **THEN** ground services are reported as unavailable, nothing is presented as broken, and
  every other function behaves exactly as it does today

#### Scenario: GSX starts after the app

- **WHEN** the pilot starts GSX some minutes into a session
- **THEN** the next retry connects and ground-service state begins to appear on its own

#### Scenario: GSX quits mid-turnaround

- **WHEN** GSX exits while services are running
- **THEN** the app reports ground services as unavailable, retains no stale progress, and
  reconnects on its own if GSX returns

### Requirement: A GSX restart is recovered from without a gap

GSX restarts its own engine as part of normal operation — a pilot resetting a parking
position, an in-place update — and the connection drops when it does. The system SHALL treat a
dropped connection as expected rather than exceptional, and SHALL reconnect quickly enough
that a restart does not read as GSX having gone away, before settling back to the ordinary
retry interval if GSX really has stopped.

#### Scenario: GSX restarts its engine

- **WHEN** GSX restarts and the connection drops
- **THEN** the app reconnects promptly, adopts the state GSX reports on reconnection, and does
  not report GSX as absent in passing

### Requirement: The system reads only the surfaces it is entitled to assume

The system SHALL establish what the connected GSX supports from what GSX itself advertises on
connection, and SHALL NOT decide from a version number. Where a surface the system reads is
not advertised, the system SHALL report ground services as unavailable rather than acting on
absent data.

#### Scenario: An older GSX without the service feed

- **WHEN** a connected GSX does not advertise the ground-service surface
- **THEN** the app connects, reports that this GSX cannot supply ground services, and does not
  present partial or invented state

### Requirement: Ground-service state is normalised, not passed through

The system SHALL present each ground service GSX reports as a service with a stable identity
of the app's own choosing, a state drawn from a fixed set — requestable, requested, in
progress, completed, bypassed — and, where GSX supplies one, the progress of that service.
The system SHALL NOT surface GSX's own vocabulary, numeric state codes or display strings as
its interface, so that GSX renaming or re-numbering something changes one boundary rather than
the whole app.

#### Scenario: A service GSX reports is unrecognised

- **WHEN** GSX reports a service the app does not know
- **THEN** the unknown service is ignored, and every recognised service is still reported

#### Scenario: A state GSX reports is unrecognised

- **WHEN** GSX reports a state the app does not know for a recognised service
- **THEN** the service is reported without claiming a state, rather than being dropped or
  guessed at

### Requirement: Boarding and deboarding report passengers actually aboard

The system SHALL report boarding and deboarding progress as the number of passengers handled
against the total expected, taken from GSX's own passenger detail. Where GSX also publishes a
progress figure that counts against a running rather than a final total, the system SHALL NOT
use it: a passenger count that reaches its total while passengers are still being handled
would state that the service had finished when it had not. Baggage progress SHALL be reported
as the percentage GSX gives.

#### Scenario: Boarding is under way

- **WHEN** GSX reports thirty of one hundred and twenty-two passengers boarded
- **THEN** the app reports boarding in progress with thirty of one hundred and twenty-two

#### Scenario: GSX's progress figure disagrees with its passenger detail

- **WHEN** GSX reports a progress figure of 181 of 181 alongside a passenger detail of 181 of
  186
- **THEN** the app reports 181 of 186

### Requirement: Refuelling reports the fuel loaded

The system SHALL report refuelling progress as the quantity loaded so far and the aircraft's
resulting total, in the unit GSX states, and SHALL NOT present GSX's target figure as a fixed
goal — GSX moves that target as a progressive fill proceeds, and presenting it as fixed would
show a target that appears to recede.

#### Scenario: A progressive refuel is under way

- **WHEN** GSX reports fuel loaded so far and an aircraft total
- **THEN** the app reports both, with the unit GSX gave

### Requirement: A completed service stays completed for the turnaround

GSX returns a finished service to a requestable state so that it can be asked for again. The
system SHALL NOT present that return as the service having reverted to not-yet-started: once a
service has been observed to complete, the system SHALL continue to report it as completed
until the aircraft leaves the ground or the pilot's flight changes.

#### Scenario: Boarding finishes

- **WHEN** boarding completes and GSX returns it to requestable a moment later
- **THEN** the app continues to report boarding as completed

#### Scenario: A new turnaround begins

- **WHEN** the aircraft has flown, or the pilot's current flight has changed
- **THEN** previously completed services are no longer reported as completed

### Requirement: Ground-service state is a mirror of GSX, never a merge

The system SHALL replace wholesale each part of the state GSX republishes, and SHALL NOT merge
an update into what it already held. GSX republishes a whole collection rather than the part
of it that changed, so merging would retain services and figures that GSX has withdrawn.

#### Scenario: GSX stops offering a service

- **WHEN** GSX republishes its services without one it previously reported
- **THEN** that service is no longer reported by the app

### Requirement: GSX's traffic is not logged and not retained beyond what is used

GSX's feed carries data the app has no use for and should not hold: the airport's full stand
database, invoice and charge detail, printer configuration, and the pilot's linked flight
planning account. The system SHALL discard what it does not present, SHALL NOT write GSX's
raw traffic to the ordinary application log, and SHALL keep the volume of that traffic from
affecting the responsiveness of the rest of the app.

#### Scenario: A large frame arrives

- **WHEN** GSX publishes its stand database on connection
- **THEN** the app discards it, logs no part of it, and continues to report position without a
  pause

### Requirement: The protocol can be recorded and replayed off the simulator

The system SHALL provide a mode that connects to GSX, records the traffic it receives to a
file beside the executable, and reports on the console a summary small enough to be copied by
hand — what the connected GSX advertises, and the outcome of each interface probe it was asked
to make. The mode SHALL exercise nothing that alters the state of the aircraft or the
simulation.

#### Scenario: A recording is made on the simulator machine

- **WHEN** the pilot runs the app in capture mode through a turnaround
- **THEN** the traffic is recorded to a file, a copyable summary is shown, and neither the
  aircraft nor GSX's services are acted upon
