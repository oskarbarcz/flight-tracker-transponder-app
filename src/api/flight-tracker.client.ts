import type { TokenStore } from './token-store';

export type DiscordPresencePayload = {
  state: string;
  details: string;
  startTimestamp: string | null;
  endTimestamp: string | null;
  smallImageKey: string;
  largeImageKey: string;
};

export type CurrentFlight = {
  id: string;
  callsign: string;
};

export class SessionExpiredError extends Error {
  constructor() {
    super('The stored session is no longer accepted by the API.');
  }
}

export class NotSignedInError extends Error {
  constructor() {
    super('No session is available; the pilot has to sign in.');
  }
}

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

const RENEW_MARGIN_MS = 60_000;
const ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1000;

export class FlightTrackerClient {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly tokenStore: TokenStore,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async signIn(email: string, password: string): Promise<void> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/api/v1/auth/sign-in`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      },
    );

    if (!response.ok) {
      throw new SessionExpiredError();
    }

    await this.acceptTokens((await response.json()) as TokenPair);
  }

  async signOut(): Promise<void> {
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    await this.tokenStore.clear();
  }

  async getCurrentFlight(): Promise<CurrentFlight | null> {
    const me = (await this.get('/api/v1/user/me')) as {
      currentFlightId: string | null;
    };

    if (me.currentFlightId === null) {
      return null;
    }

    const flight = (await this.get(`/api/v1/flight/${me.currentFlightId}`)) as {
      id: string;
      callsign: string;
    };

    return { id: flight.id, callsign: flight.callsign };
  }

  async getDiscordPresence(): Promise<DiscordPresencePayload | null> {
    const response = await this.authorizedRequest(
      '/api/v1/user/me/discord-presence',
    );

    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`presence request failed with ${response.status}`);
    }

    return (await response.json()) as DiscordPresencePayload;
  }

  private async get(path: string): Promise<unknown> {
    const response = await this.authorizedRequest(path);

    if (!response.ok) {
      throw new Error(`request to ${path} failed with ${response.status}`);
    }

    return response.json();
  }

  private async authorizedRequest(path: string): Promise<Response> {
    await this.ensureAccessToken();

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (response.status !== 401) {
      return response;
    }

    this.accessToken = null;
    await this.ensureAccessToken();

    return this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
  }

  private async ensureAccessToken(): Promise<void> {
    if (
      this.accessToken !== null &&
      this.now() < this.accessTokenExpiresAt - RENEW_MARGIN_MS
    ) {
      return;
    }

    const session = await this.tokenStore.read();

    if (session === null) {
      throw new NotSignedInError();
    }

    const response = await this.fetchImpl(
      `${this.baseUrl}/api/v1/auth/refresh`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.refreshToken}` },
      },
    );

    if (!response.ok) {
      await this.tokenStore.clear();
      this.accessToken = null;
      throw new SessionExpiredError();
    }

    await this.acceptTokens((await response.json()) as TokenPair);
  }

  private async acceptTokens(tokens: TokenPair): Promise<void> {
    this.accessToken = tokens.accessToken;
    this.accessTokenExpiresAt = this.now() + ACCESS_TOKEN_LIFETIME_MS;
    await this.tokenStore.write({ refreshToken: tokens.refreshToken });
  }
}
