## 1. One folder holds the state

- [x] 1.1 `appDirectory()` resolves the folder the executable sits in from `process.execPath`, falling back to the working directory when a runtime — `node`, `bun`, `ts-node` — is what is running. Unit-tested for both shapes.
- [x] 1.2 `resolveStorage()` returns that folder plus whether it can be written to, honours `DATA_DIR` (absolute or relative, `%WINDOWS_STYLE%` variables expanded), and creates the folder when the pilot named one.
- [x] 1.3 Writability is settled by writing and removing a probe file, not by `accessSync`, which on Windows does not see the ACL that refuses the write. The probe leaves nothing behind.
- [x] 1.4 `loadConfig()` resolves `logFilePath` against that folder, so a relative `LOG_FILE_PATH` follows the app and an absolute one is left alone.
- [x] 1.5 The DPAPI secret file and the `0600` fallback file are addressed in that folder rather than in `process.cwd()`.

## 2. A folder that takes no writes

- [x] 2.1 `Logger` accepts no path at all and keeps writing to the screen when it has nowhere to write.
- [x] 2.2 The token store becomes the in-memory one when the folder refuses writes, so a session lasts the run and is never written somewhere the pilot did not ask for.
- [x] 2.3 `StatusRegistry.setStorageFault()` and a dashboard line that names the folder, says the session and the log are off, and points at `DATA_DIR`.

## 3. The release, described

- [x] 3.1 `ReleaseClient.latest()` returns the version, the release page and the Windows asset — name, download URL, size and GitHub's digest — rather than only the tag.
- [x] 3.2 Asset selection prefers `mypreflight-transponder.exe`, settles for any `.exe`, and reports nothing rather than guessing when the release carries neither.
- [x] 3.3 `isUpdateAvailable` is left as it stands, and still refuses to compare a `dev` build.

## 4. The download

- [x] 4.1 `downloadsDirectory()` asks Windows where Downloads actually is — the known-folder GUID under both shell folder keys, `REG_EXPAND_SZ` expanded — through the existing `CommandRunner`, with `%USERPROFILE%\Downloads` as the fallback and no shelling out off Windows.
- [x] 4.2 `versionedName()` and `uniquePath()`: `mypreflight-transponder-<version>.exe`, and `… (1).exe` when that name is taken, up to a bounded number of tries.
- [x] 4.3 `Downloader` streams to `<target>.part`, hashes as it goes, verifies the byte count against the asset size and the SHA-256 against GitHub's digest, moves the file into place only once both hold, and removes the partial file on any failure.
- [x] 4.4 `Updater` ties it together: one download at a time, progress into the status registry, the saved path and the swap instruction into the log, and every failure named rather than swallowed.
- [x] 4.5 Verified against a stub GitHub over real HTTP and the real filesystem: three megabytes streamed, digest checked, a second download landing beside the first, nothing partial left behind.

## 5. The dashboard

- [x] 5.1 `u` on the dashboard asks for the download, and is ignored when there is nothing newer or a download is already running.
- [x] 5.2 One notice line carries all four states: the offer, the progress, the saved path with the swap instruction, and the failure with another attempt.
- [x] 5.3 The status box badge shortened to `xpndr: [UPDATE v0.12.0]` so the line still fits inside the box once both services report their versions.
- [x] 5.4 The preview frame — what CI renders to catch mangled output — exercises the notice.

## 6. Unattended

- [x] 6.1 `--download-update` performs the same download with no dashboard, printing the path or the reason and exiting zero or non-zero.

## 7. Documentation

- [x] 7.1 README: what the folder holds, what is never written elsewhere, what a read-only folder does, and how an update is taken and applied.
- [x] 7.2 `DATA_DIR` in `.env.example`; `session.json` and `*.secret` in `.gitignore` so a development sign-in cannot be committed.
