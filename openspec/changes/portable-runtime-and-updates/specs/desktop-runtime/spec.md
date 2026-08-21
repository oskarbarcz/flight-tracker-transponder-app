## Purpose

Run the two feeds as one long-lived process on the pilot's PC: credentials, lifecycle, the
tray, and enough diagnostics that a pilot can tell which of four connections is unhappy.

## MODIFIED Requirements

### Requirement: Everything the app writes lives in one folder it was put in

The system SHALL resolve every file it writes — the encrypted session and the log — against
the directory holding the executable, independent of the working directory it was started
from. It SHALL NOT write to `%APPDATA%`, `%LOCALAPPDATA%`, the registry, or any other location
outside that folder, and SHALL NOT register a service, a shortcut or an autostart entry.
Deleting the folder SHALL remove every trace of the app but the downloads the pilot asked for.

A pilot who wants the state elsewhere SHALL be able to name that folder in configuration,
Windows-style variables included, and the folder SHALL be created if it does not exist.

Where there is no executable to sit beside — the app run from source under a runtime — the
working directory SHALL be used instead.

#### Scenario: Started from somewhere else

- **WHEN** the app is launched by a shortcut, a terminal or a scheduled task whose working
  directory is not the app's folder
- **THEN** the session and the log are written beside the executable, not into that directory

#### Scenario: Carried on a stick

- **WHEN** the folder is copied to another machine and the app is started
- **THEN** it runs, and asks for the password again, because the credential store bound the
  session to the Windows account that signed in

#### Scenario: The pilot wants the state somewhere else

- **WHEN** `DATA_DIR` names a folder, absolute or relative to the app, with or without
  `%WINDOWS_STYLE%` variables
- **THEN** the session and the log go there, and the folder is created if needed

### Requirement: A folder that cannot be written to is a reported state, not a failure

The system SHALL detect that it cannot write to its own folder before it needs to, SHALL keep
running with the session held in memory only and no log file, and SHALL put the folder and the
way out in front of the pilot on the dashboard rather than only in a log line it cannot write.
It SHALL NOT fall back to any other location on the machine.

#### Scenario: Dropped into Program Files

- **WHEN** the app runs from a folder that refuses writes
- **THEN** the dashboard names that folder, says the session and the log are off, and both
  feeds run as normal

#### Scenario: The pilot signs in anyway

- **WHEN** the pilot signs in while the folder takes no writes
- **THEN** the session works for as long as the app runs, and is gone at the next start

### Requirement: Secrets are held in the operating system credential store

The system SHALL store the refresh token in the Windows credential store, scoped to the
signed-in Windows user, with the encrypted blob beside the executable, and SHALL NOT write it
to a configuration file or a log. Where the credential store cannot be used, the fallback
SHALL be a `0600` file in the same folder. Where the folder cannot be written to, the token
SHALL be held in memory for the life of the process and nowhere else.

#### Scenario: Tokens at rest

- **WHEN** the pilot has signed in and the app is stopped
- **THEN** the folder holds the encrypted session and nothing readable, and no secret exists
  anywhere else on the machine
