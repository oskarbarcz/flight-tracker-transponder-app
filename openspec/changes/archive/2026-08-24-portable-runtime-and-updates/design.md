## Context

Two features that sound unrelated share one question: where is the app allowed to write?
Portability answers "the folder it lives in, and nowhere else". Updating answers "the folder
the pilot expects downloads in, and nothing else" — because the one place a portable app must
not write is over itself.

The constraints that shaped both:

- Windows will not let a running executable be overwritten. Self-replacement means a helper
  process, a rename dance, or a restart. All three turn a single file into a procedure.
- DPAPI ties the encrypted session to the Windows account. State that lives beside the
  executable can travel; that particular file cannot be decrypted after it does.
- The dashboard hides its log pane by default, so anything the pilot must act on has to be on
  the frame itself, not in a log line.

## Decisions

### The executable's own folder is the data directory, not the working directory

`appDirectory()` reads `process.execPath`: for the compiled single-file build that is the
executable, so its folder is the answer regardless of how the app was launched. When the
basename is a known runtime — `node`, `bun`, `ts-node` and friends — there is no executable to
sit beside and the working directory is used instead, which is what development wants.

`resolveStorage()` then turns that into a directory plus one fact: whether it can be written
to. Writability is settled by writing a probe file and removing it, not by `accessSync`, which
on Windows reports the read-only attribute and knows nothing about the ACLs that actually
refuse the write in `C:\Program Files`.

### A read-only folder degrades, and says so

Given the choice between silently writing to `%LOCALAPPDATA%` and running with no state at
all, this takes the second. The promise is that deleting the folder uninstalls the app; a
fallback the pilot never asked for and cannot see breaks it, and the app would be leaving a
session token in a place nobody thinks to look. So: the token store becomes the in-memory one,
the logger is given no path, and `storageFault` puts one line on the dashboard naming the
folder and the way out. `DATA_DIR` is the escape hatch for the pilot who wants
`%LOCALAPPDATA%` anyway, and it expands `%WINDOWS_STYLE%` variables so that is one line in a
`.env` file rather than a hard-coded absolute path.

### The notice is the affordance, not a key in the hint row

The hint row holds four keys and, at eighty columns, has no room for a fifth without
truncating. Rather than shorten labels the pilot already knows, the update speaks for itself
on its own line — `^ update — v0.12.0 is out — press [u] to save it to your Downloads folder`
— and the same line then carries progress, the saved path, or the reason it failed. One line,
four states, always where the eye already goes for faults. The status box keeps a short
`xpndr: [UPDATE v0.12.0]` badge, shortened from the old wording so the line still fits inside
the box once both services report versions.

### The Downloads folder is asked for, not assumed

`%USERPROFILE%\Downloads` is a guess: the folder can be moved to another drive, and Windows
records where it went under the known-folder GUID in `Shell Folders`. So the registry is
queried first through the same `CommandRunner` the credential store already uses, both shell
folder keys are tried, `REG_EXPAND_SZ` values are expanded, and the profile path is the
fallback. Off Windows nothing is shelled out at all, which keeps the path testable on macOS.

### Downloads land beside what is already there

The file is named `mypreflight-transponder-<version>.exe`, so the pilot can tell two builds
apart on disk, and a name that is taken becomes `… (1).exe` the way a browser would do it. It
is streamed to `<target>.part`, hashed while it streams, and moved into place only after the
byte count matches the asset size and the SHA-256 matches the digest GitHub publishes for the
asset. A download that breaks halfway leaves nothing behind. A download that does not match
its checksum is deleted rather than handed over: a truncated executable that runs is worse
than one that never arrived.

### The pilot applies the update

The app downloads and stops. No self-replacement, no scheduled swap, no relaunch. This is a
deliberate limit rather than a missing feature: the swap is two seconds of the pilot's time,
against a helper process that has to outlive the app it is replacing, on a machine where the
app's whole claim is that it is one file the pilot controls.

### Version comparison already existed, and is left alone

`isUpdateAvailable` compares up to three numeric parts and refuses to guess about anything
else, so a `dev` build never claims an update is available. `ReleaseClient` grew the asset,
the page URL and the digest; the comparison it feeds did not change.

## Risks / Trade-offs

- **The pilot must remember to swap the file.** The dashboard says so on the line that
  reported the download, and the notice returns on the next start because the running version
  is still the old one. Accepted.
- **A moved Downloads folder depends on a registry read.** If `reg.exe` is unavailable or the
  value is missing, the download goes to `%USERPROFILE%\Downloads`, which is created if it is
  not there. Worst case the file is somewhere slightly unexpected, and the path is on the
  dashboard and in the log.
- **GitHub's `digest` field is not on older assets.** Where it is absent the size check still
  applies and the transport is still HTTPS. Publishing checksums alongside the executable
  would close this; it is not in this change.
- **Sixty megabytes on a metered connection, on a keypress.** Nothing downloads without the
  pilot pressing the key, or asking for it with `--download-update`.
- **A read-only folder means signing in on every start.** The dashboard says why, and
  `DATA_DIR` fixes it. Accepted as the honest failure for a portable app.
