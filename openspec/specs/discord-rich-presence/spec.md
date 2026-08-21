# discord-rich-presence Specification

## Purpose
Mirror the activity that `flight-tracker-api` publishes for the signed-in pilot into the
Discord client running on the same machine, since no server-side API can write a user's
activity.
## Requirements
### Requirement: The activity is written over the local Discord connection

The system SHALL write the activity to the Discord client through its local inter-process
connection, handshaking with the project's Discord application id, and SHALL treat a Discord
that is not running as a normal state — retrying with backoff, never exiting, and leaving the
position feed unaffected.

#### Scenario: Discord is closed

- **WHEN** the app starts with no Discord client running
- **THEN** it reports Discord as disconnected, retries in the background, and continues to
  publish position reports

#### Scenario: Discord starts later

- **WHEN** the pilot opens Discord after the app started
- **THEN** the next retry connects and the current activity is written without restarting the
  app

#### Scenario: Discord restarts mid-flight

- **WHEN** the Discord client quits and reopens during a flight
- **THEN** the activity is written again from the latest payload rather than being lost until
  the next status change

### Requirement: The activity mirrors the API payload without composing text

The system SHALL pass the API's `state`, `details` and both asset keys through unchanged, and
SHALL convert the timestamps to the form the local Discord connection expects. The system
SHALL NOT compose or reword activity text, so wording changes on the API need no new release
of the app.

#### Scenario: A payload is published

- **WHEN** the API returns state `Cruise, landing at 15:50 UTC` and details
  `Boston (BOS) -> Philadelphia (PHL)`
- **THEN** the activity shows exactly those two strings, with the elapsed and remaining time
  driven by the payload's timestamps

#### Scenario: The payload has no timestamps

- **WHEN** the API returns null start and end timestamps
- **THEN** the activity is written with its text and images and no timer, rather than being
  skipped

### Requirement: An empty answer clears the activity

The system SHALL clear the activity whenever the API reports that there is nothing to publish,
so a pilot never keeps a stale flight on their profile. This SHALL apply equally when the
setting is turned off, when the flight closes, and when the pilot signs out.

#### Scenario: Rich presence is turned off mid-flight

- **WHEN** the pilot turns the setting off while flying
- **THEN** the next poll clears the activity

#### Scenario: The flight closes

- **WHEN** the current flight is closed
- **THEN** the activity is cleared

#### Scenario: The pilot signs out of the app

- **WHEN** the pilot signs out
- **THEN** the activity is cleared before the session is discarded

#### Scenario: The app is quit

- **WHEN** the pilot quits the app from the tray
- **THEN** the activity is cleared as part of shutting down

### Requirement: Presence is read on an interval and does not depend on the simulator

The system SHALL poll the API for the activity on a fixed interval and SHALL publish whatever
it returns whether or not the simulator is connected, because the API derives the activity
from the flight, not from the aircraft.

#### Scenario: Presence before the sim is started

- **WHEN** the pilot has checked in but has not launched the simulator
- **THEN** the activity shows the checked-in state with its takeoff time

#### Scenario: The API is unreachable

- **WHEN** polling fails
- **THEN** the last published activity is left in place, the failure is reported in
  diagnostics, and polling continues

