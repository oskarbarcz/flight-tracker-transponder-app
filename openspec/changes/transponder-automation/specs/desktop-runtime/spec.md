## MODIFIED Requirements

### Requirement: The pilot signs in once and the session is renewed unattended

The system SHALL authenticate against `flight-tracker-api` with the pilot's credentials, keep
only the resulting tokens, and renew the short-lived access token from the refresh token
before it expires. The password SHALL NOT be stored. A refresh that fails because the session
is gone SHALL leave the app running and prompt the pilot to sign in again.

Signing in SHALL be reachable for as long as the app is running, and not only in the moments
before the dashboard takes the console. The outcome of an attempt SHALL be shown to the pilot
rather than only written to the log file, and the password SHALL NOT be echoed.

Where a session is already stored, the current flight SHALL be read as the app starts, and no
slower start-up work SHALL be allowed to hold that reading up. The pilot SHALL also be able to
ask for the flight to be read again at any time, so that something changed in the platform can
be picked up at once rather than at the next poll.

#### Scenario: First run

- **WHEN** the app starts with no stored session
- **THEN** it prompts for sign-in and does not publish anything until it succeeds

#### Scenario: The first attempt was declined or abandoned

- **WHEN** sign-in is cancelled, or fails every attempt, and the dashboard takes the console
- **THEN** the app names the key that asks again, and pressing it prompts for the credentials
  without the pilot restarting anything

#### Scenario: The password was mistyped

- **WHEN** the credentials are refused at the console prompt
- **THEN** the pilot is asked again a small, bounded number of times before the app gives up and
  hands over to the dashboard, rather than looping on the prompt forever

#### Scenario: Signing in while the app is already running

- **WHEN** the pilot signs in from the dashboard
- **THEN** the current flight is looked up immediately rather than at the next poll, and the
  result of the attempt is put in front of the pilot

#### Scenario: A session was already stored

- **WHEN** the app starts with a session it can renew
- **THEN** the current flight is read at once, and nothing slower — the ADS-B token check among
  them — holds that reading up

#### Scenario: The pilot asks for the flight again

- **WHEN** the pilot presses the key that re-reads the flight
- **THEN** the flight is read at once, and holding the key down does not stack up requests

#### Scenario: Access token expires during a flight

- **WHEN** the access token reaches its expiry mid-flight
- **THEN** it is renewed from the refresh token with no interruption to either feed

#### Scenario: The session was revoked

- **WHEN** the refresh token is rejected
- **THEN** the app clears the stored session, prompts for sign-in, clears the Discord
  activity, and stops publishing positions

### Requirement: The status view is read as five sections

The system SHALL group what it shows into the crew signed in, the current service, the
transponder, the Discord connection, and the state of the services it depends on. The
transponder section SHALL report the aircraft's own state — the identifier the simulator gives,
the squawk, the ground speed, and the mode the pilot has selected — separately from the flight
the API assigned, so that a disagreement between the two is visible rather than mysterious. It
SHALL report when the last report was accepted, precisely enough to tell a feed that stopped
from one that is a second old.

Every key the system offers SHALL be visually distinguishable from the words describing it. The
system SHALL NOT advertise quitting as one of them. Every key SHALL be named on one line at the
width the view is drawn for, in every state that line can be in, so that learning the keys never
costs the pilot a wider terminal.

#### Scenario: The simulator is flying a different aircraft than the flight assigns

- **WHEN** the simulator's identifier and the flight's tail differ
- **THEN** both are on the screen, in their own sections

#### Scenario: Nothing has been published for a while

- **WHEN** the feed stopped some minutes ago
- **THEN** the time of the last accepted report is shown, and is what reveals it

#### Scenario: All the keys at once

- **WHEN** the view is drawn at eighty columns in the state whose hint line is longest — a
  session to end, and the log pane open
- **THEN** every key it offers is named on that line, none of it cut off
