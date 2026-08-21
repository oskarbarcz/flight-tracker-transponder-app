## 0. Develop on macOS, verify on Windows

- [x] 0.1 Reach the simulator over IPv4 so the daily loop runs on the Mac: `SIMCONNECT_HOST` / `SIMCONNECT_PORT` config, passed to `open()` as `{ host, port }`. Unset means the local pipe, which is what ships.
- [ ] 0.2 On the Windows PC, add the `SimConnect.Comm` block (`Protocol` IPv4, `Scope` global, `Address` 0.0.0.0, a port, `MaxClients`) to `%APPDATA%\Microsoft Flight Simulator 2024\SimConnect.xml`, open the port on the firewall, and confirm the Mac connects while a flight is loaded.
- [x] 0.3 Confirm the Discord IPC client resolves macOS socket paths, so presence can be written to and inspected on the Mac's own Discord client.
- [x] 0.4 Keep the bundle free of native modules — platform secrets go through a child process (`security` on macOS, PowerShell DPAPI on Windows), not a binding — so the Windows executable can be cross-compiled from macOS.
- [x] 0.5 GitHub Actions: `verify` on ubuntu (Biome, typecheck, tests) for every push and pull request, then `build-windows` on `windows-latest` on merge to main — compiles the executable, smoke-tests that it refuses to start without configuration, and uploads it as an artifact.
- [ ] 0.6 Group everything that can only be judged on Windows into one pass: pipe-based discovery, tray, registry autostart, DPAPI, the packaged executable, the real flight.

## 1. Spikes that decide the shape

- [ ] 1.1 Confirm `node-simconnect` connects to MSFS 2024 — over IPv4 from the Mac first, then over the local pipe on the PC — and reads the variables the existing feeder uses — `PLANE LATITUDE`, `PLANE LONGITUDE`, `INDICATED ALTITUDE`, `GPS GROUND SPEED`, `MAGNETIC COMPASS`, `VERTICAL SPEED`, `CONTACT POINT IS ON GROUND`, `TRANSPONDER CODE:1` — plus `ATC ID` for diagnostics, at 1 Hz. Record the protocol version used and the sim version reported by `recvOpen`.
- [x] 1.2 Inventory what the C# transponder calls beyond plain SimVar reads. Done from source (`kodowiec/FlightTrackerFeeder`) and from the bundled `old-app/Simvars.exe`, which turned out to be the MSFS SDK sample and not the feeder: nothing beyond SimVar reads on the user aircraft, all covered by `node-simconnect`. Field-by-field findings are in `design.md`.
- [ ] 1.3 Tray spike: drive a Windows tray icon with menu and dynamic tooltip from Node. Evaluate `systray2` first, a native addon second. Decide and record; if both fail, adopt the no-tray fallback (Windows service plus local status page) before packaging.
- [ ] 1.4 Credential spike — **code written and unit-tested, both paths still unverified against a real store**: confirm the `security` round-trip on macOS and the DPAPI round-trip on Windows, and that each still works from inside the bundle chosen in 6.1. Using a child process rather than a keyring binding is what keeps the bundle cross-compilable.
- [ ] 1.5 Discord IPC spike: handshake with an application id and set an activity with both asset keys, confirming the images render. Settles the art-asset naming question, including the space in the current large-image key.

## 2. Project skeleton

- [x] 2.1 TypeScript Node project, strict mode, Biome for linting and formatting (one tool, one config, no ESLint/Prettier pair).
- [x] 2.2 Configuration from environment plus a user config file: API base URL, ADS-B base URL, Discord application id, poll intervals, log level. No secrets in either.
- [x] 2.3 A supervisor that runs independent named loops with their own backoff, so a failure in one cannot reach the other, and a single shutdown path that clears the Discord activity.
- [x] 2.4 Structured local logger with size-bounded rotation and credential redaction.

## 3. API client

- [x] 3.1 `POST /api/v1/auth/sign-in`; keep access and refresh tokens, discard the password.
- [x] 3.2 Renew via `POST /api/v1/auth/refresh` — the refresh token goes in the `Authorization` header, there is no body, and the guard rejects an access token on that route — ahead of the 15-minute expiry; on rejection clear the session, prompt for sign-in, and clear the activity.
- [x] 3.3 Persist and load the refresh token through a `SecretStore`: macOS keychain via `security`, Windows DPAPI via PowerShell, selected by platform, with the `0600` file store as the fallback where neither exists. Unit-tested through an injected command runner.
- [x] 3.4 `GET /api/v1/user/me` for `currentFlightId`, polled on an interval, exposing "no current flight" as a first-class state rather than an error.
- [x] 3.5 `GET /api/v1/flight/:id` for `callsign`; apply the API's own normalisation — whitespace removed, upper case — and cache per flight id.
- [x] 3.6 `GET /api/v1/user/me/discord-presence`: `200` returns the payload, `204` returns "nothing to publish", `401` triggers the renewal path in 3.2.

## 4. Position feed

- [x] 4.1 SimConnect connection with pinned protocol version, discovery left to the library, and indefinite backoff retry that reports state instead of exiting.
- [x] 4.2 One data definition for the variables in 1.1, requested per second on the user aircraft.
- [x] 4.3 Map a sample to the ADS-B payload: `date, latitude, longitude, altitude, groundSpeed, track, verticalRate, squawk, isOnGround, callsign`. Omit what the sim does not supply rather than sending zero.
- [x] 4.4 Decode BCD squawk (`0x1200` → `1200`) with a unit test over the wrap cases, including codes containing 7 and 0.
- [x] 4.5 Rate policy: publish every tick airborne, every fifth on the ground, and immediately on an on-ground transition.
- [x] 4.6 `POST /api/v1/position` per report with the ADS-B client token; treat any non-2xx as a publish failure.
- [x] 4.7 Bounded FIFO retry queue (cap 3600, oldest dropped first) preserving each report's sample timestamp; count published, accepted and dropped for diagnostics.
- [x] 4.8 Suppress the whole feed while there is no current flight, and switch callsign cleanly when the current flight changes mid-session.
- [x] 4.9 Validate the ADS-B token at startup with `POST /api/v1/auth-check/client` and surface an invalid token as an error state.

## 5. Rich presence

- [x] 5.1 Discord IPC client with the application id, backoff retry, and reconnect that rewrites the current activity rather than waiting for the next change.
- [x] 5.2 Poll presence every 15 seconds; on payload, write the activity passing `state`, `details` and both asset keys through unchanged and converting the timestamps.
- [x] 5.3 Clear the activity on `204`, on sign-out, and on shutdown.
- [x] 5.4 Tolerate null timestamps by writing text and images with no timer.
- [x] 5.5 On a failed poll, leave the last activity in place and log; never clear on a transport error, only on an explicit empty answer.

## 6. Packaging and installation

- [ ] 6.1 Bundle to a single Windows executable — the `build:exe` script and the CI job exist but have never run, since Bun is not installed locally; the first CI run on main is what proves it. Cross-compiled from macOS (`bun build --compile --target=bun-windows-x64`) or built by the CI runner from 0.5; the tooling follows from 1.3 and 1.4, since a tray helper binary is the only asset that has to ride along.
- [ ] 6.2 Optional autostart through the user's `Run` registry key, toggled from the tray, no administrator rights.
- [ ] 6.3 Version check against a published manifest with a tray notification; no self-replacement in this release.
- [ ] 6.4 README covering install, sign-in, the two tokens, and what each tray state means.

## 7. Verification

- [x] 7.1 Unit tests for BCD squawk decoding, callsign normalisation against the API's rule, the rate policy including transitions, and queue eviction order.
- [x] 7.2 Integration test over real HTTP against stub services: sign-in, renewal (refresh token as bearer, empty body), a rejected session, presence payload and `204`, the ADS-B token check, a published report asserted field by field, and an outage with recovery in order.
- [ ] 7.3 A real flight with the C# app closed: check in, fly, and confirm `flight-tracker-api` shows first position, off-block, takeoff, arrival and the stored path, then compare the track against a flight flown by the C# app.
- [ ] 7.4 Confirm rich presence on a real Discord profile — text, both images, and the countdown — and that it clears when the flight closes.
- [ ] 7.5 Degradation matrix: sim absent, Discord absent, ADS-B unreachable, API unreachable, no current flight, revoked ADS-B token, revoked session. Each leaves the app running and the unaffected feed working.
- [ ] 7.6 Leave it running for a full session — several hours across more than one flight — and confirm no leak, no unbounded log, and no stale activity left behind.

## 8. Cutover

- [ ] 8.1 Pilot the new app with one pilot for several flights, C# app closed, comparing tracks per flight.
- [ ] 8.2 Roll out per pilot; never run both for the same callsign, since two 1 Hz streams with different clock offsets add jitter the API's detection reads as movement.
- [ ] 8.3 Retire the C# transponder once every active pilot has moved, and record in `flight-tracker-api`'s README which client feeds the ADS-B service.
