## Why

The source tree was organised by mechanism. `core` held the status registry, the logger and
the supervisor — three things with nothing in common but the fact that everything imports
them. `api` held the HTTP client, the token store, the GitHub release client and the sign-in
use case, four things at three different altitudes. `feeds` and `update` each held one use case
and its adapters mixed together.

That works while a reader already knows the codebase. It stops working at the two moments that
matter: deciding where a new file goes, and telling whether a rule is a business rule or an
accident of the transport underneath it. The phase automation added in
`transponder-automation` made this concrete — `TransponderSchedule` and `RatePolicy` are the
only two files in the app that hold a decision worth arguing about, and nothing about their
old address said so.

The dependency graph was already almost layered by accident. `domain` imported nothing but
itself. `platform` and `config` were self-contained. Only the naming hid it.

## What Changes

- **Four layers, named on the directory.** `domain` for the rules that would survive a rewrite
  of every adapter, `application` for the use cases that sequence them, `infrastructure` for
  everything that talks to something outside the process, `presentation` for the terminal
  frame and the tray icon.
- **`main.ts` is the composition root, and stays at the top.** It is the one file allowed to
  know every layer, because building the object graph is what it is for.
- **`core` is dissolved.** The status registry and the supervisor are application concerns; the
  logger writes to a file and a stream, so it is infrastructure.
- **`api` is split by altitude.** The client and the token store go to
  `infrastructure/mypreflight`, the release client to `infrastructure/github` beside the
  downloader that consumes it, and `sign-in` to `application` where the use case lives.
- **No behaviour changes.** Every file keeps its contents; only its address and its import
  lines change.

## Capabilities

No capability changes behaviour, so this change carries no spec deltas (`skip_specs: true`).
The specs describe what the app does, and it does exactly what it did before.

## Impact

- **Every import line in the app moved.** Nothing else did: the same 398 tests pass, `tsc`
  is clean, and `--print-frame` renders the same frame.
- **Git records the moves as renames**, so `git log --follow` and `git blame` still reach
  through them.
- **Eleven imports still point inward**, from `application` to `infrastructure`. Seven are
  type-only and cost nothing at runtime. Four are real: three error classes and a handful of
  path helpers that the use cases call directly. Turning those around means extracting ports
  and re-homing the errors in `domain`, which is a change of its own rather than a rename —
  it became `application-ports`, which closes all eleven and adds a test that keeps them
  closed.
- **The pending `transponder-automation` change is unaffected.** Its tasks name classes rather
  than paths, so they still read true.
