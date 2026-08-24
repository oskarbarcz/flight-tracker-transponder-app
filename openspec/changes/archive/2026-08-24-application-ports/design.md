## Context

The rule being enforced is one sentence: a layer may name things below it and never above it.
Everything here follows from applying it to eleven imports that broke it, and the interesting
part is that most of them broke it by accident of *where a type was declared* rather than by
any real coupling.

Four shapes of violation, and each wants a different answer:

1. **A type-only reference to a concrete class.** `PositionFeed` took a `Logger`. It calls four
   methods; it does not care that the real one rotates a file.
2. **An error class owned by the wrong side.** The feed's retry-or-drop decision was expressed
   with the transport's exception types.
3. **A default argument.** `Updater` had working defaults that read the Windows registry, which
   is a dependency the constructor advertises whether or not anyone uses it.
4. **A file in the wrong layer entirely.** `ConsolePrompt` is a terminal interface filed under
   `platform`.

## Decisions

### Ports carry their errors, because the error is part of the contract

The interface `PositionPublisher` says a report can be published. What the caller needs to know
is what the three failures *mean*: this token will never work, this report will never be
accepted, this attempt might work later. That is not incidental to the contract, it is most of
it — the feed's entire retry policy is a switch over those three.

So the errors live beside the interface that raises them. `AdsbClient` implements the interface
and throws the port's types, which is dependency inversion doing exactly what it is for: the
adapter now speaks the core's language rather than the core learning the adapter's.

### The error messages kept saying "ADS-B", and that is not a leak

The tempting move after renaming `AdsbReportRejectedError` to `PositionRejectedError` is to
rename the message too. That was tried and reverted.

ADS-B is not a vendor. It is an aviation standard, the app's status registry has always called
one of its four connections `adsb`, the README calls it the ADS-B service, and the pilot reads
`! adsb — …` on the dashboard when it breaks. Generalising the message to "the position
service" would have made the app vaguer for the person reading it in order to make a diagram
tidier. The class names generalised; the words the pilot sees did not move.

### The Discord mapping moved to the Discord adapter

`PresenceFeed` used to fetch a payload, convert its ISO timestamps to epoch milliseconds, and
hand the result to the writer. Two of those three steps are Discord's business.

Now the port speaks `Presence` — the thing the platform reports — and `IpcPresenceWriter` maps
it at the wire. The feed got shorter, the conversion is tested next to the protocol that needs
it, and the fingerprint the feed compares against is now the presence itself rather than its
Discord rendering, which is the more meaningful comparison anyway.

### `isUpdateAvailable` and `versionedName` are domain, awkward as that sounds

Neither has anything to do with flying, which makes `domain/` feel like the wrong shelf. But
the test is not "is this about aeroplanes", it is "would this survive replacing every adapter",
and both would: comparing `0.9.0` against `0.10.0`, and turning `transponder.exe` plus `0.12.0`
into `transponder-0.12.0.exe`, are rules with no I/O and no dependency on GitHub being where
releases come from.

Leaving `isUpdateAvailable` in the GitHub client is what forced the dashboard — which only
wants to know whether to light up a key — to import an HTTP client.

### `Updater`'s defaults became a port, not more parameters

The three injected functions were already a port in everything but name; the defaults were what
tied them to Windows. Collapsing them into one `DownloadArea` object makes the seam explicit
and gives `main` one thing to build. The test double is now a three-line literal instead of
three positional arguments whose order had to be remembered.

### A test, not a document

The convention would slip. `architecture.spec.ts` reads the tree, resolves every relative
import, and asserts that no file names something above it — plus the stronger rule that
`infrastructure` may only reach `application/ports`, never the use cases themselves.

It was checked by breaking it: an import from `domain` to `infrastructure/logger` was added and
the suite failed naming that exact edge, then reverted. A guard that has never been seen to
fail is not yet a guard.

## Risks / Trade-offs

- **Six more files, for interfaces some of which have one implementation.** That is the price of
  the direction being right, and the ports are small enough to read in one screen each.
- **`main.ts` got longer.** The composition root now builds the `DownloadArea` that used to be
  a default. That is where the wiring belongs; it was previously hidden in a constructor.
- **The architecture test parses imports with a regular expression.** It reads `from '…'` and
  nothing else, so a dynamic `import()` or a `require` would slip past it. Neither appears in
  this codebase, and the resolution check confirms every path it does find exists.
- **`instanceof` across the port boundary.** The feeds still branch on error types, which
  depends on the adapter throwing the port's classes rather than its own look-alikes. The
  integration tests exercise the real adapter against a stub HTTP service, so a divergence there
  fails the suite rather than production.
