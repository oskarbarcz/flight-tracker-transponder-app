# desktop-runtime Specification

## Purpose
Run the two feeds as one long-lived process on the pilot's PC: credentials, lifecycle, the
tray, and enough diagnostics that a pilot can tell which of four connections is unhappy.
## Requirements
### Requirement: The pilot signs in once and the session is renewed unattended

The system SHALL authenticate against `flight-tracker-api` with the pilot's credentials, keep
only the resulting tokens, and renew the short-lived access token from the refresh token
before it expires. The password SHALL NOT be stored. A refresh that fails because the session
is gone SHALL leave the app running and prompt the pilot to sign in again.

Signing in SHALL be reachable for as long as the app is running, and not only in the moments
before the dashboard takes the console. The outcome of an attempt SHALL be shown to the pilot
rather than only written to the log file, and the password SHALL NOT be echoed.

#### Scenario: First run

- **WHEN** the app starts with no stored session
- **THEN** it prompts for sign-in and does not publish anything until it succeeds

#### Scenario: The first attempt was declined or abandoned

- **WHEN** sign-in is cancelled, or fails every attempt, and the dashboard takes the console
- **THEN** the app names the key that asks again, and pressing it prompts for the credentials
  without the pilot restarting anything

#### Scenario: Signing in while the app is already running

- **WHEN** the pilot signs in from the dashboard
- **THEN** the current flight is looked up immediately rather than at the next poll, and the
  result of the attempt is put in front of the pilot

#### Scenario: Access token expires during a flight

- **WHEN** the access token reaches its expiry mid-flight
- **THEN** it is renewed from the refresh token with no interruption to either feed

#### Scenario: The session was revoked

- **WHEN** the refresh token is rejected
- **THEN** the app clears the stored session, prompts for sign-in, clears the Discord
  activity, and stops publishing positions

### Requirement: Secrets are held in the operating system credential store

The system SHALL store the refresh token and the ADS-B client token in the Windows credential
store, scoped to the signed-in Windows user, and SHALL NOT write either to a configuration
file or a log. Where the credential store cannot be used, the fallback SHALL be an encrypted
file bound to the Windows user account — never plaintext.

#### Scenario: Tokens at rest

- **WHEN** the app has signed in and is running
- **THEN** neither token appears in any file the app writes, including diagnostics

### Requirement: The ADS-B client token is validated at startup

The system SHALL verify the ADS-B client token against the service's client auth check before
publishing, and SHALL report an invalid or revoked token as an error the pilot can see rather
than publishing reports that are silently rejected.

#### Scenario: The token was revoked

- **WHEN** the stored ADS-B token is no longer valid
- **THEN** the app reports the ADS-B service as unauthorised, stops publishing, and keeps
  rich presence working

### Requirement: The tray reports the state of every connection

The system SHALL show, at any moment, whether each of the simulator, the Discord client, the
ADS-B service and the API is connected, together with the callsign it is publishing under and
the aircraft identifier the simulator reports.

The system SHALL also show its state in the notification area, since that is the only part of it
visible while the simulator is fullscreen. That indicator SHALL distinguish a fault from standby
from waiting for a flight from transmitting, and SHALL name on hover what it is doing and any
fault. It SHALL offer no commands — those live on the status view — and SHALL cost neither a
second process nor a second file. Where the notification area cannot be reached, the system SHALL
carry on without it and SHALL say which call was refused.

#### Scenario: A pilot's track is missing

- **WHEN** the pilot opens the status view while the simulator identifier disagrees with the
  flight callsign
- **THEN** both values are visible, making the mismatch diagnosable without logs

#### Scenario: The simulator is fullscreen

- **WHEN** the pilot is flying and the console is behind the simulator
- **THEN** the notification area shows whether the transponder is transmitting, and hovering it
  names the callsign and how much has been sent

#### Scenario: The notification area refuses the icon

- **WHEN** any of the calls that place the icon fails
- **THEN** both feeds carry on and the log names the call that failed

#### Scenario: Everything is healthy in flight

- **WHEN** all four connections are up and the aircraft is airborne
- **THEN** the tray shows the callsign being published and the time of the last accepted
  report

### Requirement: The status view is read as five sections

The system SHALL group what it shows into the crew signed in, the current service, the
transponder, the Discord connection, and the state of the services it depends on. The
transponder section SHALL report the aircraft's own state — the identifier the simulator gives,
the squawk, the ground speed, and the mode the pilot has selected — separately from the flight
the API assigned, so that a disagreement between the two is visible rather than mysterious. It
SHALL report when the last report was accepted, precisely enough to tell a feed that stopped
from one that is a second old.

Every key the system offers SHALL be visually distinguishable from the words describing it. The
system SHALL NOT advertise quitting as one of them.

#### Scenario: The simulator is flying a different aircraft than the flight assigns

- **WHEN** the simulator's identifier and the flight's tail differ
- **THEN** both are on the screen, in their own sections

#### Scenario: Nothing has been published for a while

- **WHEN** the feed stopped some minutes ago
- **THEN** the time of the last accepted report is shown, and is what reveals it

### Requirement: A broken connection says why, on the screen

The system SHALL show, on the status view itself, the reason a connection is unhappy and not
only the fact of it. The reason SHALL be readable in full rather than truncated, and SHALL be
bounded so that a long one cannot displace the rest of the view. Where the pilot can act on the
fault, the message SHALL say what to do. A reason SHALL be cleared when the connection recovers.

#### Scenario: The simulator is not running

- **WHEN** the SimConnect connection cannot be established
- **THEN** the view names the simulator, says its pipe is absent, and says to start the
  simulator — without the pilot opening any log

#### Scenario: The simulator is across the network

- **WHEN** the connection to a configured `SIMCONNECT_HOST` is refused
- **THEN** the message names the host and points at the simulator's own configuration and the
  port, which is what is usually wrong

#### Scenario: More than one thing is wrong

- **WHEN** several connections are unhappy at once
- **THEN** one fault is shown, the one the pilot is most able to act on

#### Scenario: The connection recovers

- **WHEN** the simulator connects
- **THEN** the fault disappears from the view

### Requirement: Ending a session cannot strand a flight

The system SHALL let the pilot end the session from the status view, and SHALL refuse to do so
while the transponder is transmitting, showing that the action is unavailable rather than
failing when it is used.

#### Scenario: Signing out mid-flight

- **WHEN** the pilot asks to sign out while position reports are being published
- **THEN** nothing happens, and the action is shown as unavailable until transmission is
  switched off

### Requirement: The status view names the version at both ends and its own

The system SHALL show, alongside the state of each remote service, the version that service
reports and the version of the app itself. A version SHALL be obtained without a session and
without the ADS-B client token, so that it is still readable when either of those is what has
failed. A version that could not be read SHALL be shown as absent and SHALL NOT stop anything
else. Versions SHALL be re-read rarely, since neither changes except on a deployment.

#### Scenario: Reporting a fault against a deployment

- **WHEN** the pilot opens the status view
- **THEN** the version of the API, the version of the ADS-B service and the version of the app
  are all readable off one screen

#### Scenario: The session has expired

- **WHEN** the API rejects the stored session
- **THEN** the API's version is still shown, because reading it never needed the session

#### Scenario: A service cannot be reached at all

- **WHEN** a version cannot be read
- **THEN** the row shows the state without a version, and both feeds carry on unaffected

#### Scenario: A newer build has been released

- **WHEN** the newest published release is newer than the running build
- **THEN** the view says an update is possible and names the version

#### Scenario: Running a build from source

- **WHEN** the running build has no release version
- **THEN** no update is offered, whatever has been published

### Requirement: The app survives the sim it accompanies, and registers itself nowhere

The system SHALL keep running when the simulator, Discord, or the network go away, and a crash
in one feed SHALL NOT stop the other: each runs as an independently supervised loop that is
restarted with a bounded, backing-off delay. The system SHALL NOT install itself to start with
Windows, write a registry entry, or place a shortcut, because nothing outside the folder the
pilot dropped it in is the app's to write. A pilot who wants it to start with Windows SHALL be
able to do that with a shortcut of their own placing.

#### Scenario: One feed fails

- **WHEN** the position feed throws an unexpected error
- **THEN** it is restarted by its supervisor and rich presence is unaffected

#### Scenario: A dependency is absent for a long time

- **WHEN** the simulator or the network is away for hours
- **THEN** the retry interval grows to a ceiling rather than either giving up or hammering, and
  the app is still there when the dependency returns

#### Scenario: Uninstalling

- **WHEN** the pilot deletes the folder
- **THEN** nothing of the app remains on the machine, because nothing was registered

### Requirement: Diagnostics are local, bounded and readable from the dashboard

The system SHALL write a rolling local log of connection state, published report counts and
failures, bounded in size and rotated rather than grown without limit, with credentials redacted
from every line it writes. The recent log SHALL be readable from the dashboard itself, on a key,
and SHALL be hidden until asked for so a healthy flight is not narrated at the pilot. A message
the pilot needs to act on SHALL NOT depend on that pane being open.

#### Scenario: A pilot reports a problem

- **WHEN** the pilot opens the log pane after a failed flight
- **THEN** it shows when each connection came and went and how many reports were published and
  dropped, and the log file carries the same history for attaching to a report

#### Scenario: A credential passes through a message

- **WHEN** a token, a password or an authorization header would appear in a log line
- **THEN** it is redacted before the line is written or shown

#### Scenario: The log outgrows its bound

- **WHEN** the log file reaches its size limit
- **THEN** it is rotated and the app keeps logging, rather than filling the pilot's disk

#### Scenario: Something needs the pilot's attention

- **WHEN** a sign-in fails, or an update is waiting
- **THEN** it is put on the frame itself, not only into the log pane

