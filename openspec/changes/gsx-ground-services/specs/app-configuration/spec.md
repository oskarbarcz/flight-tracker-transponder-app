## ADDED Requirements

### Requirement: GSX is reached at a built-in endpoint that can be pointed elsewhere

The system SHALL carry a built-in address and port for GSX's remote interface, so a pilot
running GSX on the same machine configures nothing. Both SHALL be overridable from the
environment for the case the app and the simulator run on different machines — the same case
the simulator's own network settings already exist for — and a value that is present but
unusable SHALL fall back to the built-in value rather than stopping the app.

#### Scenario: GSX runs beside the app

- **WHEN** the app starts with nothing configured
- **THEN** it looks for GSX on the local machine at its built-in port

#### Scenario: The simulator is on another machine

- **WHEN** the GSX host is set to the machine running the simulator
- **THEN** the app looks for GSX there instead

#### Scenario: The port is set to something that is not a port

- **WHEN** the configured GSX port is blank or not a number
- **THEN** the built-in port is used and the app starts normally

### Requirement: The GSX integration can be switched off

The system SHALL provide a setting that stops it from looking for GSX at all. With the
integration off, the system SHALL make no attempt to reach GSX, SHALL report ground services
as unavailable, and SHALL behave in every other respect as it does with GSX simply absent.

#### Scenario: A pilot turns the integration off

- **WHEN** the GSX integration is disabled
- **THEN** no connection is attempted, no retry runs, and the dashboard shows no
  ground-services section
