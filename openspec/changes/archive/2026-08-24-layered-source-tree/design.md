## Context

The question a layered tree has to answer is not "what kind of thing is this file" but "what
is this file allowed to import". Everything else — the names, the depth, how many directories
there are — follows from that or is decoration.

The existing graph, before anything moved:

- `domain` imported only `domain`. Already pure.
- `platform`, `config` imported only themselves. Already leaves.
- `core` imported `config` and itself, and was imported by everything.
- `feeds` imported six other directories, which is what a use case looks like.
- `tui` imported `api`, `core` and `platform`.

So the layering existed. It was the naming that hid it, and one directory — `core` — that
straddled two layers and made the hiding possible.

## Decisions

### Four layers, because the terminal is the product

Three would have been defensible: the TUI and the tray are adapters like any other, and
hexagonal architecture would file them under driving adapters without ceremony. But this app
has no other face. The dashboard is not a way of looking at the product, it *is* the product,
and a pilot's bug report is almost always about something on that frame. Giving it a top-level
address makes the thing people actually talk about easy to find.

### `core` had to go, because it was two layers wearing one name

`StatusRegistry` is application state: what the app currently believes about four connections,
a flight and a switch. `Supervisor` is application lifecycle: it restarts loops with backoff.
`Logger` opens a file, rotates it, and writes to a stream — infrastructure by any reading.

Keeping them together is exactly what made the old tree hard to reason about, because `core`
became the answer to "where does this go" whenever the answer was unclear. Dissolving it means
that question now has to be answered properly every time, which is the point.

### `api` was three altitudes in one directory

`mypreflight.client.ts` speaks HTTP to the platform. `token-store.ts` persists what that client
needs. `release.client.ts` speaks HTTP to GitHub and has nothing to do with either. `sign-in.ts`
is a use case: prompt, call, report, retry a bounded number of times.

They are now at three addresses. `release.client.ts` moved next to `downloader.ts` under
`infrastructure/github`, because "ask GitHub what the newest release is" and "fetch the asset
it named" are one conversation with one service, and they were two directories apart.

### Filenames lost their directory's name, and nothing else

`adsb/adsb.client.ts` became `adsb/client.ts`, `api/mypreflight.client.ts` became
`mypreflight/client.ts`. Two files named `client.ts` in one tree is a small cost against the
stutter of repeating the directory in every basename. Everything else kept its name exactly,
so `git log --follow` reaches through and a reader who knew the old tree still recognises the
new one.

### The moves are `git mv`, and the imports were computed rather than patched

Every relative specifier was resolved against the old location, looked up in the move map, and
re-emitted relative to the new one. No regex ran over the import paths themselves, so a
specifier could not be rewritten into something that happens to resolve to the wrong file. A
resolution pass over the finished tree confirmed all 71 files, then `tsc`, Biome and the suite
confirmed it a second time.

## Risks / Trade-offs

- **Eleven imports still point inward.** `application` reaches into `infrastructure`: seven
  type-only, which cost nothing at runtime and disappear at compile time, and four real ones —
  `AdsbReportRejectedError` and `AdsbTokenRejectedError` in the position feed,
  `NotSignedInError` and `SessionExpiredError` in the presence feed, `PromptCancelledError` in
  sign-in, and the Downloads path helpers in the updater.

  These are the honest residue of a move-only change. Turning them around means error types
  that belong to `domain` rather than to the transport that raised them, and ports for the
  path helpers — a change with a real diff and real risk, which is why it is not in this one.
  The tree now makes them visible, which it did not before.

- **`presentation` reaches into `infrastructure` too.** The dashboard imports
  `isUpdateAvailable` from the release client to decide whether to offer the update key. It is
  a pure comparison sitting in an infrastructure file; it would be at home in `domain`.

- **A big diff across every file.** Unavoidable for a rename of this shape, and the reason it
  is its own change with no behaviour in it: a reviewer can read the move map and trust the
  suite, rather than looking for a logic change hidden among the import lines.

- **The layering is a convention, not a constraint.** Nothing stops the next file from
  importing upward. `application-ports` turned it into one, with an `architecture.spec.ts` that
  walks the tree and fails the suite on any import running the wrong way.
