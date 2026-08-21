# App configuration

## Purpose

Decide what the app needs to be told before it can work, and answer: nothing. Every setting has
a built-in value that reaches the production services, and everything a developer needs to bend
— endpoints, cadences, log level, a simulator across the network — is an environment variable
away, without a build.

## Requirements

### Requirement: The app runs with nothing configured

The system SHALL carry a built-in value for every setting it reads, including the API base URL,
the ADS-B base URL and the Discord application id, so a pilot who downloads the executable and
runs it needs no configuration file, no arguments and no environment. A value that is present
but unusable — blank, whitespace, not a number, not a level the logger knows — SHALL fall back
to the built-in value rather than stopping the app or being used as given.

#### Scenario: A pilot runs the executable on its own

- **WHEN** the app starts with no configuration of any kind
- **THEN** it reaches the production API, the production ADS-B service and the project's Discord
  application, and the only thing it asks the pilot for is a sign-in

#### Scenario: A setting is present but empty

- **WHEN** a base URL or the Discord application id is set to an empty or whitespace value
- **THEN** the built-in value is used

#### Scenario: A cadence is not a number

- **WHEN** an interval is set to a word, a negative number or zero
- **THEN** the built-in cadence is used and the app starts normally

#### Scenario: A base URL carries a trailing slash

- **WHEN** a base URL is given with one or more trailing slashes
- **THEN** requests are still addressed correctly, without a doubled separator

### Requirement: Configuration comes from the environment, then from a file beside the app

The system SHALL read an `.env` file from the working directory and one from the directory
holding the executable, and SHALL treat the same path found twice as one file. A variable
already present in the environment SHALL NOT be overwritten by either file, and where both
files carry a variable the first SHALL win. Comments and blank lines SHALL be ignored, and a
file that is not there SHALL be no error.

#### Scenario: Settings travel with the app

- **WHEN** an `.env` file sits beside the executable
- **THEN** its values are used, whichever directory the app was started from

#### Scenario: The environment overrides the file

- **WHEN** a variable is set in the environment and also in an `.env` file
- **THEN** the environment value is used

#### Scenario: No file at all

- **WHEN** neither `.env` exists
- **THEN** the app starts on its built-in values without complaint

### Requirement: Cadences are tunable so a fault can be watched, not so pilots can tune them

The system SHALL allow the presence poll, the current-flight poll, the version poll, the
simulator sample interval, the queued-report capacity and the log level to be overridden from
the environment. The shipped values SHALL be the ones a pilot gets, and an override SHALL be
what a developer reaches for to make a slow loop observable or a busy one quiet.

#### Scenario: Watching a loop that misbehaves

- **WHEN** a poll interval is shortened and the log level set to debug
- **THEN** that loop runs at the requested cadence and its decisions are visible in the log

#### Scenario: A pilot changes nothing

- **WHEN** no cadence is set
- **THEN** presence is read every fifteen seconds, the current flight every thirty, versions
  every fifteen minutes, and the simulator sampled once a second

### Requirement: The simulator can be reached across the network for development

The system SHALL connect to the simulator over the local transport by default, and SHALL
connect over IPv4 to a named host and port when one is configured, so the app can run on a
development machine while the simulator runs on another. The shipped default SHALL be the local
transport, and a failure to reach a configured host SHALL name that host rather than reporting a
missing local simulator.

#### Scenario: The shipped path

- **WHEN** no simulator host is configured
- **THEN** the app connects over the local transport on the pilot's own machine

#### Scenario: The simulator is on another machine

- **WHEN** a simulator host is configured, with or without a port
- **THEN** the app connects to that host, defaulting the port when none is given

### Requirement: The ADS-B client token ships inside the build, not in the pilot's configuration

The system SHALL take its ADS-B client token from the build rather than from the pilot, so a
pilot never holds a service credential and cannot be asked to paste one. A build made without a
token SHALL still start, and SHALL report that the ADS-B service will refuse it rather than
appearing to work.

#### Scenario: A released build

- **WHEN** a pilot runs an executable published by the project
- **THEN** position reports are accepted without the pilot configuring any token

#### Scenario: A build made from source with no token

- **WHEN** the app runs with no ADS-B client token
- **THEN** it starts, reports the ADS-B service as unauthorised with the reason, and keeps rich
  presence and the dashboard working
