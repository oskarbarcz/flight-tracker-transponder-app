import { Client } from '@xhayper/discord-rpc';
import type { DiscordActivity, PresenceWriter } from './presence.writer';

export class IpcPresenceWriter implements PresenceWriter {
  private client: Client | null = null;

  constructor(
    private readonly applicationId: string,
    private readonly onDisconnected: () => void,
  ) {}

  async connect(): Promise<void> {
    if (this.client !== null) {
      return;
    }

    const client = new Client({ clientId: this.applicationId });

    client.on('disconnected', () => {
      this.client = null;
      this.onDisconnected();
    });

    await client.login();
    this.client = client;
  }

  async setActivity(activity: DiscordActivity): Promise<void> {
    await this.connect();

    await this.client?.user?.setActivity({
      details: activity.details,
      state: activity.state,
      ...(activity.startTimestamp !== undefined
        ? { startTimestamp: activity.startTimestamp }
        : {}),
      ...(activity.endTimestamp !== undefined
        ? { endTimestamp: activity.endTimestamp }
        : {}),
      largeImageKey: activity.largeImageKey,
      smallImageKey: activity.smallImageKey,
    });
  }

  async clearActivity(): Promise<void> {
    if (this.client === null) {
      return;
    }

    await this.client.user?.clearActivity();
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    this.client = null;

    await client?.destroy();
  }
}
