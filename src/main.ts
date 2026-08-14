import { loadConfig } from './config/config';
import { envFilePaths, loadEnvFiles } from './config/env-file';
import { type LogSink, Logger, streamSink } from './core/logger';
import { Dashboard } from './tui/dashboard';
import { previewFrame } from './tui/preview';
import { useUtf8Console } from './platform/console-encoding';
import { Screen } from './tui/screen';
import { StatusRegistry } from './core/status';
import { describeError, Supervisor } from './core/supervisor';
import { FileTokenStore, SecretTokenStore } from './api/token-store';
import { ConsolePrompt } from './platform/prompt';
import { secretStoreFor } from './platform/secret-store';
import { promptForSignIn } from './api/sign-in';
import {
  FlightTrackerClient,
  NotSignedInError,
  SessionExpiredError,
} from './api/flight-tracker.client';
import { AdsbClient, AdsbTokenRejectedError } from './adsb/adsb.client';
import { IpcPresenceWriter } from './discord/ipc-presence.writer';
import { PositionQueue } from './domain/position-queue';
import { RatePolicy } from './domain/rate-policy';
import { PositionFeed } from './feeds/position.feed';
import { PresenceFeed } from './feeds/presence.feed';
import { PROTOCOL_NAMES, SimconnectSource } from './sim/simconnect.source';

const SESSION_FILE = 'session.json';

async function bootstrap(): Promise<void> {
  loadEnvFiles(envFilePaths());

  const config = loadConfig();
  const status = new StatusRegistry();

  let logSink: LogSink = streamSink;
  const logger = new Logger(
    config.logLevel,
    config.logFilePath,
    'app',
    (line) => logSink(line),
  );
  const supervisor = new Supervisor(logger);

  if (
    process.platform === 'win32' &&
    !(await useUtf8Console(process.platform))
  ) {
    logger.warn(
      'could not switch the console to UTF-8, box drawing may be mojibake',
    );
  }

  const secrets = secretStoreFor(process.platform, process.cwd());
  const tokenStore =
    secrets === null
      ? new FileTokenStore(SESSION_FILE)
      : new SecretTokenStore(secrets);

  const api = new FlightTrackerClient(config.apiBaseUrl, tokenStore);

  const adsbToken = process.env.ADSB_CLIENT_TOKEN ?? '';
  const adsb = new AdsbClient(config.adsbBaseUrl, adsbToken);

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
      await promptForSignIn(
        api,
        new ConsolePrompt(process.stdin, process.stdout),
        logger,
      );
    } else {
      logger.warn(
        'no stored session, and no console to ask the pilot to sign in',
      );
    }
  }

  await adsb.verifyToken().then(
    () => status.set('adsb', 'connected'),
    (error: unknown) => {
      status.set(
        'adsb',
        error instanceof AdsbTokenRejectedError
          ? 'unauthorised'
          : 'disconnected',
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
    callsignOverride = callsign;
    positionFeed.setCurrentFlightCallsign(callsign);

    logger.warn(
      callsign === null
        ? 'callsign override released: following the current flight again'
        : `callsign overridden to ${callsign}: publishing without a Flight Tracker flight`,
    );
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

  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) {
      return;
    }

    stopping = true;
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
              logger.info(
                `simulator connected: ${application} over ${PROTOCOL_NAMES[protocol] ?? protocol}`,
              );
            },
            (error: unknown) => {
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
    },
  });

  supervisor.start({
    name: 'current-flight',
    run: async (signal) => {
      while (!signal.aborted) {
        try {
          const flight = await api.getCurrentFlight();
          applyCallsign(flight?.callsign ?? null);
          status.set('api', 'connected');
        } catch (error) {
          if (
            error instanceof SessionExpiredError ||
            error instanceof NotSignedInError
          ) {
            status.set('api', 'unauthorised');
            applyCallsign(null);
          } else {
            status.set('api', 'disconnected');
            logger.warn(`current flight poll failed: ${describeError(error)}`);
          }
        }

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
    name: 'status',
    run: async (signal) => {
      while (!signal.aborted) {
        logger.info(status.describe());
        await sleep(60_000);
      }
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const version = (): string => process.env.APP_VERSION ?? 'dev';

if (process.argv.includes('--version')) {
  process.stdout.write(`${version()}\n`);
} else if (process.argv.includes('--print-frame')) {
  // Draws one dashboard frame and exits. CI uses it to prove the box drawing
  // and colour survive into the compiled executable, and it doubles as the
  // way to see on a real console whether the code page is behaving.
  void useUtf8Console(process.platform).then(() => {
    process.stdout.write(`${previewFrame(version())}\n`);
  });
} else {
  void bootstrap().catch((error: unknown) => {
    process.stderr.write(`failed to start: ${describeError(error)}\n`);
    process.exit(1);
  });
}
