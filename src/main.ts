import { join } from 'node:path';
import { loadConfig } from './config/config';
import { envFilePaths, loadEnvFiles } from './config/env-file';
import { type LogSink, Logger, streamSink } from './core/logger';
import { Dashboard } from './tui/dashboard';
import { previewFrame } from './tui/preview';
import { useUtf8Console } from './platform/console-encoding';
import { Screen } from './tui/screen';
import { type ServiceName, StatusRegistry } from './core/status';
import { describeError, Supervisor } from './core/supervisor';
import {
  FileTokenStore,
  InMemoryTokenStore,
  SecretTokenStore,
  type TokenStore,
} from './api/token-store';
import { ConsolePrompt } from './platform/prompt';
import { appDirectory, resolveStorage, type Storage } from './platform/paths';
import { secretStoreFor } from './platform/secret-store';
import { Downloader } from './update/downloader';
import { Updater } from './update/updater';
import { promptForSignIn } from './api/sign-in';
import {
  isUpdateAvailable,
  type Release,
  ReleaseClient,
} from './api/release.client';
import {
  FlightTrackerClient,
  NotSignedInError,
  SessionExpiredError,
} from './api/mypreflight.client';
import { AdsbClient, AdsbTokenRejectedError } from './adsb/adsb.client';
import { IpcPresenceWriter } from './discord/ipc-presence.writer';
import { isPlausibleCallsign } from './domain/callsign';
import { PositionQueue } from './domain/position-queue';
import { RatePolicy } from './domain/rate-policy';
import { PositionFeed } from './feeds/position.feed';
import { PresenceFeed } from './feeds/presence.feed';
import { PROTOCOL_NAMES, SimconnectSource } from './sim/simconnect.source';
import { NoTray, type Tray, trayColour, trayTooltip } from './tray/tray';
import { openWindowsTray } from './tray/win32.tray';

const SESSION_FILE = 'session.json';

async function bootstrap(): Promise<void> {
  loadEnvFiles(envFilePaths());

  const storage = resolveStorage(appDirectory(), process.env.DATA_DIR);
  const config = loadConfig(process.env, storage.directory);
  const status = new StatusRegistry();

  let logSink: LogSink = streamSink;
  const logger = new Logger(
    config.logLevel,
    storage.writable ? config.logFilePath : null,
    'app',
    (line) => logSink(line),
  );
  const supervisor = new Supervisor(logger);

  if (!storage.writable) {
    const complaint =
      `cannot write to ${storage.directory}, so the session and the log are off ` +
      'for this run and nothing is stored anywhere else: move the app to a ' +
      'folder you own, or point DATA_DIR at one';

    status.setStorageFault(complaint);
    logger.warn(complaint);
  }

  if (
    process.platform === 'win32' &&
    !(await useUtf8Console(process.platform))
  ) {
    logger.warn(
      'could not switch the console to UTF-8, box drawing may be mojibake',
    );
  }

  const tokenStore = tokenStoreFor(storage);

  const api = new FlightTrackerClient(config.apiBaseUrl, tokenStore);

  const adsbToken = process.env.ADSB_CLIENT_TOKEN ?? '';
  const adsb = new AdsbClient(config.adsbBaseUrl, adsbToken);
  const releases = new ReleaseClient();
  const updater = new Updater(new Downloader(), status, logger.child('update'));

  let latestRelease: Release | null = null;
  let announcedRelease: string | null = null;

  const presenceWriter = new IpcPresenceWriter(
    config.discordApplicationId,
    () => {
      status.set('discord', 'disconnected');
      presenceFeed.forgetPublishedState();
    },
  );

  const positionFeed = new PositionFeed(
    adsb,
    new PositionQueue(config.queueCapacity),
    new RatePolicy(),
    status,
    logger.child('position'),
  );

  const presenceFeed = new PresenceFeed(
    api,
    presenceWriter,
    status,
    logger.child('presence'),
  );

  if ((await tokenStore.read()) === null) {
    if (process.stdin.isTTY) {
      const signedIn = await promptForSignIn(
        api,
        new ConsolePrompt(process.stdin, process.stdout),
        logger,
      );

      if (!signedIn) {
        logger.warn('not signed in: press s on the dashboard to try again');
      }
    } else {
      logger.warn(
        'no stored session, and no console to ask the pilot to sign in',
      );
    }
  }

  await adsb.verifyToken().then(
    () => {
      status.set('adsb', 'connected');
      status.setFault('adsb', null);
    },
    (error: unknown) => {
      const rejected = error instanceof AdsbTokenRejectedError;
      status.set('adsb', rejected ? 'unauthorised' : 'disconnected');
      status.setFault(
        'adsb',
        rejected
          ? 'the ADS-B client token was rejected; this build cannot publish positions'
          : describeError(error),
      );
      logger.error(`ADS-B token check failed: ${describeError(error)}`);
    },
  );

  let callsignOverride: string | null = null;

  const applyCallsign = (callsign: string | null): void => {
    if (callsignOverride === null) {
      positionFeed.setCurrentFlightCallsign(callsign);
    }
  };

  const overrideCallsign = (callsign: string | null): void => {
    if (callsign !== null && !isPlausibleCallsign(callsign)) {
      logger.warn(
        `${callsign} is not a callsign the ADS-B service will accept: two to twelve letters, digits or hyphens`,
      );

      return;
    }

    callsignOverride = callsign;
    positionFeed.setCurrentFlightCallsign(callsign);

    logger.warn(
      callsign === null
        ? 'callsign override released: following the current flight again'
        : `callsign overridden to ${callsign}: publishing without a MyPreflight flight`,
    );
  };

  const reportedVersions = new Map<ServiceName, string>();

  const readVersion = async (
    name: ServiceName,
    read: () => Promise<string>,
  ): Promise<void> => {
    try {
      const version = await read();
      status.setServiceVersion(name, version);

      if (reportedVersions.get(name) !== version) {
        reportedVersions.set(name, version);
        logger.info(`${name} is running v${version}`);
      }
    } catch (error) {
      logger.debug(
        `could not read the ${name} version: ${describeError(error)}`,
      );
    }
  };

  const pollCurrentFlight = async (): Promise<void> => {
    try {
      const me = await api.getCurrentUser();
      status.setCrew({ name: me.name, email: me.email });

      const flight =
        me.currentFlightId === null
          ? null
          : await api.getFlight(me.currentFlightId);

      status.setService(
        flight === null
          ? null
          : {
              callsign: flight.callsign,
              departure: flight.departure,
              arrival: flight.arrival,
              airframe: flight.airframe,
              registration: flight.registration,
            },
      );
      applyCallsign(flight?.callsign ?? null);
      status.set('api', 'connected');
      status.setFault('api', null);
    } catch (error) {
      if (
        error instanceof SessionExpiredError ||
        error instanceof NotSignedInError
      ) {
        status.set('api', 'unauthorised');
        status.setFault('api', 'not signed in; press s to sign in');
        status.setCrew(null);
        status.setService(null);
        applyCallsign(null);
      } else {
        status.set('api', 'disconnected');
        status.setFault('api', describeError(error));
        logger.warn(`current flight poll failed: ${describeError(error)}`);
      }
    }
  };

  const dashboard =
    process.stdout.isTTY === true
      ? new Dashboard(
          new Screen(process.stdout),
          status,
          process.env.APP_VERSION ?? 'dev',
          () => process.stdout.columns ?? 80,
          process.stdin,
        )
      : null;

  const signIn = (email: string, password: string): void => {
    void api.signIn(email, password).then(
      async () => {
        logger.info(`signed in as ${email}`);
        status.set('api', 'connected');
        status.setFault('api', null);
        dashboard?.revealLogs();
        await pollCurrentFlight();
      },
      (error: unknown) => {
        status.set('api', 'unauthorised');
        status.setFault('api', describeError(error));
        logger.error(`sign-in failed: ${describeError(error)}`);
        dashboard?.revealLogs();
      },
    );
  };

  const signOut = (): void => {
    void api.signOut().then(
      () => {
        status.set('api', 'unauthorised');
        status.setFault('api', 'signed out; press s to sign in again');
        status.setCrew(null);
        status.setService(null);
        applyCallsign(null);
        logger.info('signed out: press s to sign in again');
        dashboard?.revealLogs();
      },
      (error: unknown) => {
        logger.error(`sign-out failed: ${describeError(error)}`);
        dashboard?.revealLogs();
      },
    );
  };

  const toggleTransmitting = (): void => {
    positionFeed.setTransmitting(!positionFeed.isTransmitting);
  };

  const announceRelease = (release: Release): void => {
    if (
      !isUpdateAvailable(version(), release.version) ||
      announcedRelease === release.version
    ) {
      return;
    }

    announcedRelease = release.version;
    logger.info(
      dashboard === null
        ? `v${release.version} is out: run --download-update to save it to your Downloads folder`
        : `v${release.version} is out: press u to save it to your Downloads folder`,
    );
  };

  const downloadRelease = (): void => {
    if (latestRelease === null) {
      logger.warn('no release has been read from GitHub yet');
      dashboard?.revealLogs();

      return;
    }

    void updater.download(latestRelease);
  };

  const tray: Tray = await openWindowsTray(logger.child('tray'));

  const paintTray = (): void => {
    const snapshot = status.snapshot();
    tray.show(
      trayColour(snapshot),
      trayTooltip(snapshot, process.env.APP_VERSION ?? 'dev'),
    );
  };

  paintTray();

  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) {
      return;
    }

    stopping = true;
    tray.hide();
    dashboard?.stop();
    logSink = streamSink;
    logger.info('shutting down');
    await presenceFeed.clear().catch(() => undefined);
    await presenceWriter.disconnect().catch(() => undefined);
    await supervisor.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  if (dashboard !== null) {
    logSink = (line) => dashboard.append(line);
    dashboard.start({
      onQuit: () => void shutdown(),
      onCallsign: overrideCallsign,
      onSignIn: signIn,
      onSignOut: signOut,
      onTransmit: toggleTransmitting,
      onUpdate: downloadRelease,
    });
    process.stdout.on('resize', () => dashboard.resize());
  }

  supervisor.start({
    name: 'simulator',
    run: async (signal) => {
      const source = new SimconnectSource(config.simConnectRemote);
      const closed = new Promise<void>((resolve) => {
        void source
          .connect({
            onSample: (sample) => {
              positionFeed.accept(sample);
              void positionFeed.drain();
            },
            onAircraftIdentifier: (identifier) =>
              status.setAircraftIdentifier(identifier),
            onClosed: () => resolve(),
          })
          .then(
            ({ application, protocol }) => {
              status.set('simulator', 'connected');
              status.setFault('simulator', null);
              logger.info(
                `simulator connected: ${application} over ${PROTOCOL_NAMES[protocol] ?? protocol}`,
              );
            },
            (error: unknown) => {
              status.setFault(
                'simulator',
                `${describeError(error)} ${simulatorHint()}`,
              );
              logger.warn(
                `simulator connection failed: ${describeError(error)}`,
              );
              resolve();
            },
          );
      });

      signal.addEventListener('abort', () => source.disconnect(), {
        once: true,
      });

      await closed;
      status.set('simulator', 'disconnected');

      if (!signal.aborted) {
        status.setFault(
          'simulator',
          status.snapshot().faults.simulator ??
            `the simulator closed the connection ${simulatorHint()}`,
        );
      }
    },
  });

  supervisor.start({
    name: 'current-flight',
    run: async (signal) => {
      while (!signal.aborted) {
        await pollCurrentFlight();
        await sleep(config.currentFlightPollIntervalMs);
      }
    },
  });

  supervisor.start({
    name: 'presence',
    run: async (signal) => {
      while (!signal.aborted) {
        await presenceWriter.connect().then(
          () => status.set('discord', 'connected'),
          () => status.set('discord', 'disconnected'),
        );

        await presenceFeed.tick();
        await sleep(config.presencePollIntervalMs);
      }
    },
  });

  supervisor.start({
    name: 'versions',
    run: async (signal) => {
      while (!signal.aborted) {
        await Promise.all([
          readVersion('api', () => api.version()),
          readVersion('adsb', () => adsb.version()),
          releases.latest().then(
            (release) => {
              latestRelease = release;
              status.setLatestRelease(release.version);
              announceRelease(release);
            },
            (error: unknown) => {
              logger.debug(
                `could not read the latest release: ${describeError(error)}`,
              );
            },
          ),
        ]);
        await sleep(config.versionPollIntervalMs);
      }
    },
  });

  supervisor.start({
    name: 'tray',
    run: async (signal) => {
      while (!signal.aborted) {
        paintTray();
        await sleep(1_000);
      }
    },
  });

  supervisor.start({
    name: 'status',
    run: async (signal) => {
      while (!signal.aborted) {
        logger.info(status.describe());
        await sleep(60_000);
      }
    },
  });
}

function tokenStoreFor(storage: Storage): TokenStore {
  if (!storage.writable) {
    return new InMemoryTokenStore();
  }

  const secrets = secretStoreFor(process.platform, storage.directory);

  return secrets === null
    ? new FileTokenStore(join(storage.directory, SESSION_FILE))
    : new SecretTokenStore(secrets);
}

async function fetchRelease(): Promise<void> {
  const status = new StatusRegistry();
  const logger = new Logger('info', null, 'update');
  const updater = new Updater(new Downloader(), status, logger);
  let release: Release;

  try {
    release = await new ReleaseClient().latest();
  } catch (error) {
    process.stderr.write(
      `could not read the latest release: ${describeError(error)}\n`,
    );
    process.exit(1);
  }

  if (!isUpdateAvailable(version(), release.version)) {
    process.stdout.write(`v${version()} is already the newest release\n`);
    process.exit(0);
  }

  process.exit((await updater.download(release)) === null ? 1 : 0);
}

function simulatorHint(): string {
  return process.env.SIMCONNECT_HOST === undefined ||
    process.env.SIMCONNECT_HOST.trim() === ''
    ? '(start MSFS and load a flight; retrying)'
    : `(check MSFS is running on ${process.env.SIMCONNECT_HOST.trim()}, its SimConnect.xml has an IPv4 block, and the port is open; retrying)`;
}

async function trayCheck(): Promise<void> {
  const failures: string[] = [];
  const tray = await openWindowsTray({
    info: (message) => process.stdout.write(`${message}\n`),
    warn: (message) => {
      failures.push(message);
      process.stdout.write(`${message}\n`);
    },
  });

  if (tray instanceof NoTray) {
    process.stderr.write(
      `tray check failed: no tray was opened${failures.length > 0 ? `: ${failures.join('; ')}` : ''}\n`,
    );
    process.exit(1);
  }

  for (const colour of ['transmitting', 'standby', 'fault'] as const) {
    tray.show(colour, `tray check: ${colour}`);
  }

  tray.hide();

  if (failures.length > 0) {
    process.stderr.write(`tray check failed: ${failures.join('; ')}\n`);
    process.exit(1);
  }

  process.stdout.write('tray check passed: icon added, changed and removed\n');
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const version = (): string => process.env.APP_VERSION ?? 'dev';

if (process.argv.includes('--version')) {
  process.stdout.write(`${version()}\n`);
} else if (process.argv.includes('--download-update')) {
  void fetchRelease();
} else if (process.argv.includes('--tray-check')) {
  void trayCheck();
} else if (process.argv.includes('--print-frame')) {
  void useUtf8Console(process.platform).then(() => {
    process.stdout.write(`${previewFrame(version())}\n`);
  });
} else {
  void bootstrap().catch((error: unknown) => {
    process.stderr.write(`failed to start: ${describeError(error)}\n`);
    process.exit(1);
  });
}
