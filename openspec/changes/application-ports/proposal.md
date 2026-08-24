## Why

`layered-source-tree` gave the code four layers and an honest accounting of what was still
wrong: eleven imports ran from `application` into `infrastructure`. A layer that reaches
outward is not a layer, it is a directory. The tree said "these are the use cases" while the
use cases held a reference to the HTTP client that happened to serve them.

The concrete cost was in the error classes. `PositionFeed` decided whether to drop a report or
retry it by asking `error instanceof AdsbReportRejectedError` — a decision belonging entirely
to the feed, expressed in a type owned by the transport. Swapping the ADS-B service for another
one, or testing the feed without one, meant importing the vendor to describe the outcome.

The same shape repeated: `PresenceFeed` imported the MyPreflight client to name a session
error, `Updater` imported the Windows Downloads-folder lookup to have a default, and
`ConsolePrompt` — a thing that draws on a terminal — sat in `infrastructure/platform` while the
dashboard that shares its stream types sat in `presentation`.

## What Changes

- **`application/ports/` holds what the core needs, in its own words.** Six small files:
  `positions`, `presence`, `session`, `prompt`, `downloads`, `logger`. Each declares an
  interface, and where an outcome matters to a use case, the error type that carries it.
- **Adapters depend on ports, not the other way round.** `AdsbClient` implements
  `PositionPublisher` and throws the port's errors. `FlightTrackerClient` implements
  `PresenceSource`. `IpcPresenceWriter` implements `PresenceWriter`, and the mapping from a
  `Presence` to a Discord activity moved to the adapter that speaks Discord.
- **The pure release rules moved to `domain`.** `isUpdateAvailable` compares two version
  strings and `versionedName` stamps a version into a file name; neither touches anything.
  They sat in an HTTP client and a Windows path helper, which is why the dashboard had to
  import GitHub's client to decide whether to offer an update key.
- **`Updater` takes a `DownloadArea`** instead of three functions defaulting to Windows
  registry lookups, and `main` supplies the real one.
- **`ConsolePrompt` moved to `presentation/tui/`**, where a thing that reads keystrokes and
  writes questions belongs. The `Prompt` interface and `PromptCancelledError` went to the ports.
- **A test guards the rule.** `architecture.spec.ts` walks the tree and fails on any import
  that runs the wrong way, including any adapter reaching past the ports into the core.

## Capabilities

No capability changes behaviour, so this change carries no spec deltas (`skip_specs: true`).
Error wording, log lines and the dashboard are byte-for-byte what they were.

## Impact

- **Zero inward imports, and something that keeps it that way.** The guard fails the suite on a
  violation rather than leaving it for the next reader to notice.
- **Nothing user-visible changed.** The error classes were renamed away from the vendor —
  `AdsbReportRejectedError` is now `PositionRejectedError` — but their messages still say
  "The ADS-B service", because ADS-B is aviation vocabulary the pilot reads on the dashboard,
  not an implementation detail to hide.
- **`PresenceFeed` no longer converts timestamps.** It passes the presence through and the
  Discord adapter maps it, so the ISO-to-epoch conversion is now tested where it happens.
- **The feeds can be tested without a transport.** Their tests already used fakes; those fakes
  now satisfy a declared interface rather than being cast through `unknown` to a client class.
