## Why

The app already ships as one executable with no installer, and the README promises exactly
that. The implementation does not quite keep the promise, and there is no way out of an old
build.

**State follows the working directory, not the executable.** The DPAPI secret file and the
log file are resolved against `process.cwd()`. Double-clicked from its own folder that is the
same thing, so the bug is invisible — until the pilot starts the app from a shortcut with a
different working directory, from a terminal, or from a scheduled task, at which point
`session.secret` and `mypreflight-transponder.log` are written wherever that happened to
point. A portable app cannot scatter its state across the machine and still be deleted by
deleting its folder.

**The update notice is a dead end.** `ReleaseClient` already asks GitHub for the newest tag
every fifteen minutes and the status line already says `UPDATE to v0.12.0 possible`, but
nothing acts on it. The pilot is told there is something newer and left to find the releases
page, work out which asset is the Windows build, and download it by hand. Being told about an
update one cannot take is worse than not being told.

## What Changes

- **One folder holds everything.** Every file the app writes — the encrypted session, the log
  — is resolved against the directory the executable sits in, whatever the working directory
  is. `DATA_DIR` overrides that for the pilot who wants the state elsewhere.
- **A folder that takes no writes is a state, not a crash.** `C:\Program Files`, a read-only
  stick and a locked share are all real. The app names the problem on the dashboard and runs
  without a log and without remembering the session, rather than writing somewhere the pilot
  did not ask for or failing to start.
- **The update becomes something the pilot can take.** The notice names the version and the
  key that fetches it. Pressing it downloads the release executable into the pilot's Downloads
  folder under a version-stamped name, alongside anything already there rather than over it,
  verified against the checksum GitHub publishes, with progress on the dashboard.
- **Applying the update stays the pilot's move.** The app does not replace itself, does not
  restart itself, and does not run an installer. It downloads, says where the file is, and
  says to swap the executable. A running Windows executable cannot be overwritten anyway, and
  a portable app has no business rewriting the folder it was dropped into.
- **`--download-update` for machines with nobody in front of them.** Same download, no
  dashboard, an exit code and a path.

## Capabilities

### New Capabilities

- `release-updates` — notice a newer release, fetch it to the pilot's Downloads folder, and
  hand over the file.

### Modified Capabilities

- `desktop-runtime` — where the app's own state lives, and what happens when it cannot be
  written.

## Impact

- **No migration for existing pilots.** A pilot who has always double-clicked the executable
  in its own folder sees no change: the same file names in the same place. A pilot who started
  it from elsewhere signs in once more, because the old session file was left behind in the
  old working directory.
- **The session still does not travel.** DPAPI binds it to the Windows account, so carrying
  the folder to another machine means signing in again. That is a property of the credential
  store, kept deliberately rather than traded for a portable secret.
- **Registry autostart is off the table.** The bootstrap change proposed a `Run` key. Writing
  one contradicts "delete the folder and it is gone", so autostart, if it ever ships, is a
  shortcut the pilot places in their own Startup folder.
- **A new outbound host.** Release downloads come from GitHub's asset host rather than only
  `api.github.com`; both are already reachable for the version check to work at all.
