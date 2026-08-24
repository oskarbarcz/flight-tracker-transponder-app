export type Presence = {
  state: string;
  details: string;
  startTimestamp: string | null;
  endTimestamp: string | null;
  smallImageKey: string;
  largeImageKey: string;
};

export interface PresenceSource {
  getDiscordPresence(): Promise<Presence | null>;
}

export interface PresenceWriter {
  connect(): Promise<void>;
  setActivity(presence: Presence): Promise<void>;
  clearActivity(): Promise<void>;
  disconnect(): Promise<void>;
}
