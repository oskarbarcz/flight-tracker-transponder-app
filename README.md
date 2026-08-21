<div align="center">

[![oskar barcz / flight-tracker-transponder-app][banner]][homepage]

The desktop companion app for [**MyPreflight**][homepage] platform. App acts like an HTTP-based transponder, feeding
position from your flight simulator to our dedicated ADS-B receiver.

<a href="https://github.com/oskarbarcz/flight-tracker-transponder-app/releases/latest">
  <img src="https://img.shields.io/badge/Download%20for%20Windows-2EA44F?style=for-the-badge&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZiI%2BPHBhdGggZD0iTTEyIDE3IDUgMTBoNFYzaDZ2N2g0ek00IDE5aDE2djJINHoiLz48L3N2Zz4%3D" alt="Download for Windows" height="46">
</a>

**One file. No installer. Windows x64.**

</div>

## About

**MyPreflight** is a briefing service and electronic flight board app for your virtual flights, providing you realistic
figures, checklists, procedures and data to perform your flight like a real pilots do. You can customize your
experience, integrate with SimBrief and other tools. Check out our homepage at [mypreflight.io][homepage].

**This module** is the part running on your PC. It does things, that our servers cannot:
- reads your aircraft position and feeds it to our service, so you see your flight progress anywhere you are,
- sets your Discord rich presence, so your friends can be briefed on the flight you are commencing,
- connects with your printer, allowing you to print flight documents with real hardware.

[![integrity][ci-badge]][ci-url]
[![release][release-badge]][release-url]
[![license][license-badge]][license-url]

### Built with

[![TypeScript][ts-badge]][ts-url]
[![Node.js][node-shield]][node-url]
[![Bun][bun-badge]][bun-url]

Two runtime dependencies: `node-simconnect` and `dotenv`. Discord's IPC, the tray
icon and the dashboard are written against the platform directly.

## Getting started

### Requirements for end user

- **Windows 10** or **Windows 11**
- **Microsoft Flight Simulator 2024**
- **Discord**, if you want rich presence
- A **MyPreflight** account

### Install

No installer, nothing to configure.

1. Download `mypreflight-transponder.exe` from the [latest release][release-url].
2. Put it in a folder of its own.
3. Start the simulator, and Discord if you use it.
4. Start the app by double-click. Enter your MyPreflight credentials.
5. Your flight is going to be tracked automatically!

### Portable, and it stays that way

Everything the app writes lives in the folder the executable sits in, whichever
directory you happen to launch it from:

| File                            | What it holds                                          |
|---------------------------------|--------------------------------------------------------|
| `session.secret`                | your refresh token, encrypted with Windows DPAPI       |
| `mypreflight-transponder.log`   | the rolling log, capped at 5 MB plus one rotation      |
| `.env`                          | optional overrides, only if you write one              |

Nothing goes to `%APPDATA%`, nothing goes into the registry, no service is
registered and no shortcut is created. Deleting the folder uninstalls the app.
Carry the folder on a stick if you like; the session is the one thing that does
not travel, because DPAPI ties it to the Windows account that signed in, so the
app simply asks for the password again on a different machine.

If the folder cannot be written to — `C:\Program Files`, a read-only stick, a
locked share — the app says so on the dashboard and runs anyway, without a log
and without remembering the session. Move it somewhere you own, or point
`DATA_DIR` at a folder you can write to.

### Updates

The app asks GitHub for the newest release every 15 minutes and tells you when
it finds one:

```
  ^ update — v0.12.0 is out — press [u] to save it to your Downloads folder
```

Press `u` and it downloads that release into your Downloads folder as
`mypreflight-transponder-0.12.0.exe`, next to whatever is already there rather
than over it, and checks the download against the checksum GitHub publishes
before keeping it. Then quit the app and swap the executable for the new one —
it never replaces itself while running, and never restarts on its own.

For an unattended machine, `mypreflight-transponder.exe --download-update` does
the same thing and exits: nothing to download, or the path it wrote.

## Usage

Start a flight in the platform first. The callsign comes from that flight, so
nothing is published without one.

The dashboard has five sections: who is signed in, the current flight, the
transponder, Discord, and the state of both services.

```
╭─ 3 XPNDR ─────────────────╮╭─ 4 COMMS ─────────────────────────────────────╮
│ sim:      ● connected     ││ discord:  ● connected                         │
│ callsign: [LH455]         ││ presence: [ON]                                │
│ tail:     [SP-LVD]        ││ BER -> WAW                                    │
│ squawk:   [2000]          ││ Cruise, landing at 15:50z                     │
│ mode:     [MODE C]        ││                                               │
│ spd:      451kt           ││                                               │
│ call:     11:30:30z       ││                                               │
╰───────────────────────────╯╰───────────────────────────────────────────────╯
```

## Development

Needs Node 26. Both local sockets are reachable from macOS, so no Windows machine
is needed day to day.

```bash
npm install
npm test           # unit and integration tests
npm run lint       # biome
npm run typecheck
npm start          # needs the environment in .env.example
npm run build:exe  # single Windows executable, needs bun

npx ts-node src/main.ts --print-frame   # the dashboard, drawn without a simulator
```

Under `ts-node` the app has no executable to sit beside, so it keeps its state
in the working directory. `DATA_DIR` overrides that in either case, and expands
`%WINDOWS_STYLE%` variables.

## Contact

My name is Oskar, an experienced programmer, cybersecurity enthusiast, and conference speaker from Poland. Feel free to
contact me via the platforms below:

<div align="center">

[![LinkedIn][linkedin-badge]][linkedin-url]
[![GitHub][github-badge]][github-url]
[![Website][web-badge]][web-url]

</div>

## License

A public domain under the [Unlicense][license-url]. Do what you want with it. I am an experienced software engineer, but
I am not connected anyhow with the airline industry. This project is created for educational purposes only and should
not be used for real-world aviation operations.

[linkedin-badge]: https://img.shields.io/badge/Oskar%20Barcz-0A66C2?style=for-the-badge&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZiI%2BPHBhdGggZD0iTTIwLjQ1IDIwLjQ1aC0zLjU1di01LjU3YzAtMS4zMy0uMDMtMy4wNC0xLjg1LTMuMDQtMS44NSAwLTIuMTQgMS40NS0yLjE0IDIuOTR2NS42N0g5LjM1VjloMy40MXYxLjU2aC4wNWMuNDgtLjkgMS42NC0xLjg1IDMuMzctMS44NSAzLjYgMCA0LjI3IDIuMzcgNC4yNyA1LjQ2djYuMjl6TTUuMzQgNy40M2MtMS4xNCAwLTIuMDYtLjkzLTIuMDYtMi4wNiAwLTEuMTQuOTItMi4wNiAyLjA2LTIuMDYgMS4xNCAwIDIuMDYuOTMgMi4wNiAyLjA2IDAgMS4xNC0uOTMgMi4wNi0yLjA2IDIuMDZ6bTEuNzggMTMuMDJIMy41NlY5aDMuNTZ2MTEuNDV6TTIyLjIzIDBIMS43N0MuNzkgMCAwIC43NyAwIDEuNzN2MjAuNTRDMCAyMy4yMy43OSAyNCAxLjc3IDI0aDIwLjQ1QzIzLjIgMjQgMjQgMjMuMjMgMjQgMjIuMjdWMS43M0MyNCAuNzcgMjMuMiAwIDIyLjIzIDB6Ii8%2BPC9zdmc%2B&logoColor=white
[linkedin-url]: https://www.linkedin.com/in/oskarbarcz
[github-badge]: https://img.shields.io/badge/@oskarbarcz-181717?style=for-the-badge&logo=github&logoColor=white
[github-url]: https://github.com/oskarbarcz
[web-badge]: https://img.shields.io/badge/barcz.me-4A5568?style=for-the-badge&logo=googlechrome&logoColor=white
[web-url]: https://barcz.me

[banner]: .github/assets/background.png
[homepage]: https://mypreflight.io
[ci-badge]: https://img.shields.io/github/actions/workflow/status/oskarbarcz/flight-tracker-transponder-app/integrity.yaml?branch=main&style=for-the-badge&label=integrity
[ci-url]: https://github.com/oskarbarcz/flight-tracker-transponder-app/actions/workflows/integrity.yaml
[release-badge]: https://img.shields.io/github/v/release/oskarbarcz/flight-tracker-transponder-app?style=for-the-badge
[release-url]: https://github.com/oskarbarcz/flight-tracker-transponder-app/releases/latest
[license-badge]: https://img.shields.io/github/license/oskarbarcz/flight-tracker-transponder-app?style=for-the-badge
[license-url]: https://unlicense.org
[node-shield]: https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white
[node-url]: https://nodejs.org
[ts-badge]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[ts-url]: https://www.typescriptlang.org
[bun-badge]: https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white
[bun-url]: https://bun.sh
