## 1. The layers

- [x] 1.1 `domain/` left where it was: the seven pure files that import nothing but each other, and the two — `RatePolicy`, `TransponderSchedule` — that hold the decisions worth arguing about.
- [x] 1.2 `application/` holds the use cases and the app's own state: both feeds, the updater, sign-in, the supervisor and the status registry.
- [x] 1.3 `infrastructure/` holds everything that talks outside the process, grouped by what it talks to: `mypreflight/`, `adsb/`, `github/`, `sim/`, `discord/`, `platform/`, `config/`, and the logger.
- [x] 1.4 `presentation/` holds the two things a pilot looks at: `tui/` and `tray/`.
- [x] 1.5 `main.ts` stays at the top as the composition root, the one file that knows every layer.

## 2. The moves

- [x] 2.1 `core/` dissolved: status and supervisor to `application/`, logger to `infrastructure/`.
- [x] 2.2 `api/` split: the client and token store to `infrastructure/mypreflight/`, the release client to `infrastructure/github/` beside the downloader, sign-in to `application/`.
- [x] 2.3 `update/` split: the downloader to `infrastructure/github/`, the updater to `application/`.
- [x] 2.4 `feeds/` flattened into `application/`; `adsb/` and `sim/` moved under `infrastructure/`.
- [x] 2.5 Filenames lost only the prefix their directory now carries — `adsb.client.ts` to `adsb/client.ts`, `mypreflight.client.ts` to `mypreflight/client.ts`. Everything else kept its name.
- [x] 2.6 Every move made with `git mv`, so `--follow` and `blame` reach through them.

## 3. The imports

- [x] 3.1 Specifiers resolved against the old location, mapped, and re-emitted relative to the new one, rather than patched by regex.
- [x] 3.2 A resolution pass over the finished tree: every relative import in all 71 files points at a file that exists.
- [x] 3.3 Biome reflowed the import lines the longer paths pushed past eighty columns.

## 4. Nothing else changed

- [x] 4.1 The same 398 tests pass, `tsc --noEmit` is clean, Biome is clean.
- [x] 4.2 `--print-frame` renders the same frame, and `npm run build` still compiles.
- [x] 4.3 No build configuration needed touching: `jest`, `tsconfig` and `biome` all address `src` by glob, and `bin/build-exe.mjs` names only `src/main.ts`, which has not moved.
