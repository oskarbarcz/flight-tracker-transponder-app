import { loadConfig } from './config/config';
import { envFilePaths, loadEnvFiles } from './config/env-file';
import { Logger } from './core/logger';
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
import { SimconnectSource } from './sim/simconnect.source';

const SESSION_FILE = 'session.json';

async function bootstrap(): Promise<void> {
  loadEnvFiles(envFilePaths());

  const config = loadConfig();
  const logger = new Logger(config.logLevel, config.logFilePath);
  const status = new StatusRegistry();
  const supervisor = new Supervisor(logger);

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
          .then((application) => {
            status.set('simulator', 'connected');
            logger.info(`simulator connected: ${application}`);
          }, resolve);
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
          positionFeed.setCurrentFlightCallsign(flight?.callsign ?? null);
        } catch (error) {
          if (
            error instanceof SessionExpiredError ||
            error instanceof NotSignedInError
          ) {
            status.set('api', 'unauthorised');
            positionFeed.setCurrentFlightCallsign(null);
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

  const shutdown = async (): Promise<void> => {
    logger.info('shutting down');
    await presenceFeed.clear().catch(() => undefined);
    await presenceWriter.disconnect().catch(() => undefined);
    await supervisor.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (process.argv.includes('--version')) {
  process.stdout.write(`${process.env.APP_VERSION ?? 'dev'}\n`);
} else {
  void bootstrap().catch((error: unknown) => {
    process.stderr.write(`failed to start: ${describeError(error)}\n`);
    process.exit(1);
  });
}
