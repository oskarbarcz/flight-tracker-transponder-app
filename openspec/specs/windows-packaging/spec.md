# Windows packaging

## Purpose

Turn the source into the one thing a pilot is asked to handle: a single Windows executable that
carries its own runtime, its own icon and its own version, and that has proved on a Windows
machine that it starts, draws and reaches the notification area before anyone can download it.

## Requirements

### Requirement: The app ships as one self-contained Windows executable

The system SHALL be published as a single x64 Windows executable with no runtime, framework or
installer to obtain first, and SHALL be buildable from a development machine that is not
Windows. No part of the app SHALL depend on a native binding or a helper binary extracted at
startup, because either would end both the single-file promise and the cross-compilation that
keeps development off Windows.

#### Scenario: A pilot with nothing installed

- **WHEN** the pilot runs the downloaded executable on a Windows machine with no Node, no
  runtime and no administrator rights
- **THEN** the app starts

#### Scenario: Built from a machine that is not Windows

- **WHEN** the build runs on macOS
- **THEN** it produces the Windows executable, and says which Windows-only touches it had to
  leave out

#### Scenario: Anything platform-specific is needed

- **WHEN** a platform capability can only be reached natively — the credential store, the code
  page, the notification area
- **THEN** it is reached through a child process or through the platform's own libraries at
  runtime, never through a compiled addon shipped in the bundle

### Requirement: The executable carries its own identity

The system SHALL stamp the executable with an icon and with file properties naming the product,
the publisher, the version, the description and the licence, so Windows itself can tell the
pilot what the file is. The version in those properties, the version the app reports when asked,
and the version in the project manifest SHALL be the same one. The icon SHALL be generated from
the project's own artwork at every size Windows asks for, rather than a single bitmap scaled by
the shell.

#### Scenario: The pilot inspects the file

- **WHEN** the pilot opens the file's properties in Explorer
- **THEN** the product name, publisher, version, description and licence are all readable there

#### Scenario: Asking the build what it is

- **WHEN** the executable is run with `--version`
- **THEN** it prints the version the manifest was built from, and exits

#### Scenario: The icon at tray and desktop sizes

- **WHEN** Windows draws the file at any size from sixteen to two hundred and fifty-six pixels
- **THEN** an image drawn for that size is used

### Requirement: The executable can be interrogated, so the artifact itself is what gets verified

The system SHALL answer a small set of flags that prove the packaged artifact works, rather than
proving only that the source does: its version, its rendered dashboard frame, and whether it can
place an icon in the notification area. Each SHALL exit with a status that a build can act on.

#### Scenario: The build is verified on Windows

- **WHEN** a release or a pull request is built
- **THEN** the executable is run on a Windows machine and asked for its version, its frame and
  its tray icon, and the build fails if any of the three does not answer

#### Scenario: The console mangles the frame

- **WHEN** the rendered frame comes back without its box drawing, or carrying replacement
  characters
- **THEN** the build fails, because that is what a pilot would have seen

#### Scenario: The notification area refuses the icon

- **WHEN** the tray check cannot add, change and remove an icon
- **THEN** the build fails and names the call that refused

### Requirement: A release is cut from the manifest version, and a version is never reused

The system SHALL take the release tag, the published release and the version inside the
executable from the version in the project manifest, and SHALL attach the executable to that
release so the download is one file from one page. A change that does not raise the version
SHALL be refused before it can be merged.

#### Scenario: A change reaches the main branch

- **WHEN** work is merged
- **THEN** the version in the manifest is tagged, a release is published with generated notes,
  and the freshly built executable is attached to it

#### Scenario: A change forgets to raise the version

- **WHEN** a pull request carries a version that has been released before
- **THEN** it is refused

### Requirement: Every change is checked before a human reads it

The system SHALL check, on every pull request, that the code passes the project's linter and
formatter, that it type-checks, that its tests pass, that no file arrived with Windows line
endings, and that no file's permissions were changed. These checks SHALL run on the same
commit that the Windows build of the executable is verified against.

#### Scenario: A pull request is opened

- **WHEN** a change is proposed
- **THEN** lint, types and tests run on a Linux runner, the executable is built and checked on a
  Windows runner, and the repository hygiene checks run against the whole diff

#### Scenario: A documentation-only change

- **WHEN** a change touches only Markdown
- **THEN** the code checks do not run
