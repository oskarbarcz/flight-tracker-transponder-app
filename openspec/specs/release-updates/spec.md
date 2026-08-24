# release-updates Specification

## Purpose
Tell the pilot when a newer build exists, and put it in their Downloads folder on one
keypress — without the app installing anything, replacing itself, or restarting.
## Requirements
### Requirement: A newer release is offered where the pilot is already looking

The system SHALL ask GitHub for the newest release on the version poll it already runs, SHALL
compare it against the running build, and SHALL put an offer on the dashboard frame naming the
version and the key that fetches it. The offer SHALL NOT depend on the log pane, which is
hidden by default. A build that cannot be compared — a development build, an unparseable tag —
SHALL produce no offer.

#### Scenario: A newer release exists

- **WHEN** the release check returns a version above the running one
- **THEN** the frame says which version is out and which key saves it to the Downloads folder,
  and the status box carries a short update badge

#### Scenario: Already the newest

- **WHEN** the newest release matches the running build
- **THEN** the status box reports the running version and nothing offers a download

#### Scenario: Running a build from source

- **WHEN** the running version is not a release version
- **THEN** no update is offered, whatever GitHub answers

#### Scenario: GitHub cannot be reached

- **WHEN** the release check fails
- **THEN** the failure goes to the log at debug level and the frame says nothing about updates

### Requirement: The release is downloaded to the pilot's Downloads folder, intact

On the pilot's request the system SHALL download the release's Windows executable into the
pilot's Downloads folder, as the folder Windows itself reports rather than a guessed path,
under a name carrying the version. It SHALL NOT overwrite a file already there. It SHALL
verify the download against the size and, where GitHub publishes one, the SHA-256 digest of
the asset, and SHALL discard anything that does not match rather than leave it for the pilot to
run. A download that is interrupted SHALL leave no partial file behind.

#### Scenario: The pilot takes the update

- **WHEN** the pilot presses the update key
- **THEN** the executable is fetched to the Downloads folder as
  `mypreflight-transponder-<version>.exe`, and the frame follows the progress

#### Scenario: That version was downloaded before

- **WHEN** the target name is already taken
- **THEN** the new download is saved beside it under a numbered name, and the existing file is
  untouched

#### Scenario: The download does not match its checksum

- **WHEN** the bytes that arrived hash to something other than the digest GitHub published
- **THEN** the file is deleted, the frame says the download failed and offers another attempt

#### Scenario: The connection drops mid-download

- **WHEN** the stream ends early or breaks
- **THEN** nothing is left in the Downloads folder and the frame reports the failure

#### Scenario: The release has no executable to download

- **WHEN** the newest release carries no Windows executable
- **THEN** the frame says so and names the release page instead

#### Scenario: The pilot presses the key twice

- **WHEN** a download is already running
- **THEN** the second press is ignored rather than starting a competing download

### Requirement: Applying the update is the pilot's move

The system SHALL NOT replace its own executable, restart itself, or run an installer. Once the
file is saved it SHALL name the full path and say that the executable is to be swapped, and
SHALL keep both feeds running throughout.

#### Scenario: The download finished

- **WHEN** the file has been verified and moved into place
- **THEN** the frame names the path and says to quit and swap the executable, and the flight
  keeps being tracked until the pilot does

### Requirement: A machine with nobody in front of it can fetch the update too

The system SHALL accept a command-line flag that performs the same download without a
dashboard, reporting the outcome on standard output and in the exit code.

#### Scenario: Unattended fetch

- **WHEN** the executable is run with `--download-update`
- **THEN** it downloads the newest release if there is one, prints the path or says the build
  is already newest, and exits zero — or prints the reason and exits non-zero

