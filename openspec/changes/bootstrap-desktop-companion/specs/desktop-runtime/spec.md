## Purpose

Run the two feeds as one long-lived process on the pilot's PC: credentials, lifecycle, the
tray, and enough diagnostics that a pilot can tell which of four connections is unhappy.

## ADDED Requirements

### Requirement: The pilot signs in once and the session is renewed unattended

The system SHALL authenticate against `flight-tracker-api` with the pilot's credentials, keep
only the resulting tokens, and renew the short-lived access token from the refresh token
before it expires. The password SHALL NOT be stored. A refresh that fails because the session
is gone SHALL leave the app running and prompt the pilot to sign in again.

#### Scenario: First run

- **WHEN** the app starts with no stored session
- **THEN** it prompts for sign-in and does not publish anything until it succeeds

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
the aircraft identifier the simulator reports. The tray SHALL offer sign-in, sign-out and
quit.

#### Scenario: A pilot's track is missing

- **WHEN** the pilot opens the status view while the simulator identifier disagrees with the
  flight callsign
- **THEN** both values are visible, making the mismatch diagnosable without logs

#### Scenario: Everything is healthy in flight

- **WHEN** all four connections are up and the aircraft is airborne
- **THEN** the tray shows the callsign being published and the time of the last accepted
  report

### Requirement: The app starts with Windows and survives the sim it accompanies

The system SHALL be installable to start with the signed-in Windows user without
administrator rights, SHALL run with no window of its own, and SHALL keep running when the
simulator, Discord, or the network go away. A crash in one feed SHALL NOT stop the other.

#### Scenario: Autostart

- **WHEN** the pilot enables start with Windows
- **THEN** the app is running after the next sign-in to Windows, with no console window

#### Scenario: One feed fails

- **WHEN** the position feed throws an unexpected error
- **THEN** it is restarted by its supervisor and rich presence is unaffected

### Requirement: Diagnostics are local, bounded and shareable

The system SHALL write a rolling local log of connection state, published report counts and
failures, bounded in size, containing no credentials, and reachable from the tray so a pilot
can attach it to a report.

#### Scenario: A pilot reports a problem

- **WHEN** the pilot opens the log from the tray after a failed flight
- **THEN** the log shows when each connection came and went and how many reports were
  published, accepted and dropped
