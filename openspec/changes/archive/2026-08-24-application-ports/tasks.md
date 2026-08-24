## 1. The ports

- [x] 1.1 `application/ports/positions.ts`: `PositionPublisher`, and the three outcomes the feed branches on — unauthorised, rejected for good, failed for now.
- [x] 1.2 `application/ports/presence.ts`: `Presence`, `PresenceSource`, `PresenceWriter`.
- [x] 1.3 `application/ports/session.ts`: `NotSignedInError` and `SessionExpiredError`, which the feeds and `main` catch.
- [x] 1.4 `application/ports/prompt.ts`: the `Prompt` interface and `PromptCancelledError`.
- [x] 1.5 `application/ports/downloads.ts`: `Downloader`, `DownloadRequest`, and `DownloadArea` for the folder the updater writes into.
- [x] 1.6 `application/ports/logger.ts`: the five methods the use cases actually call.

## 2. The adapters turn around

- [x] 2.1 `AdsbClient implements PositionPublisher` and throws the port's errors; its own three error classes are gone.
- [x] 2.2 `FlightTrackerClient implements PresenceSource`, and the session errors it raises come from the port.
- [x] 2.3 `IpcPresenceWriter implements PresenceWriter`, taking a `Presence` and mapping it to a Discord activity at the wire.
- [x] 2.4 `Downloader` takes the port's `DownloadRequest`, and no longer declares its own.

## 3. What was never infrastructure

- [x] 3.1 `isUpdateAvailable` and `versionedName` moved to `domain/release.ts` with the `Release` and `ReleaseAsset` types, and their tests moved with them.
- [x] 3.2 The dashboard and the frame read `isUpdateAvailable` from the domain rather than from GitHub's client.
- [x] 3.3 `ConsolePrompt` moved to `presentation/tui/`, taking `PromptInput` and `PromptOutput` with it, so the screen and the dashboard stop reaching into infrastructure for their stream types.

## 4. The wiring

- [x] 4.1 `Updater` takes a `DownloadArea` in place of three functions defaulting to Windows registry lookups.
- [x] 4.2 `main` builds that area from the platform helpers, at both call sites.

## 5. The guard

- [x] 5.1 `architecture.spec.ts` fails on any import running the wrong way, and on any adapter reaching past `application/ports` into the use cases.
- [x] 5.2 Checked by breaking it: an import from `domain` into `infrastructure` fails the suite naming that edge.

## 6. Nothing user-visible moved

- [x] 6.1 Error messages, log lines and the dashboard are unchanged; the renamed error classes kept their wording, because ADS-B is what the pilot reads.
- [x] 6.2 407 tests pass, `tsc` and Biome clean, `--print-frame` renders the same frame, `npm run build` compiles.
