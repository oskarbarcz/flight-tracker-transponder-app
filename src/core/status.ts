export type ConnectionName = 'simulator' | 'discord' | 'adsb' | 'api';

// `standby` is the transponder's own word for it, and only `adsb` ever wears
// it: the connection is fine, the pilot has switched transmission off.
export type ConnectionState =
  | 'connected'
  | 'disconnected'
  | 'unauthorised'
  | 'waiting-for-flight'
  | 'standby';

export type StatusSnapshot = {
  connections: Record<ConnectionName, ConnectionState>;
  callsign: string | null;
  aircraftIdentifier: string | null;
  lastAcceptedReportAt: Date | null;
  publishedCount: number;
  droppedCount: number;
  presenceState: string | null;
  presenceDetails: string | null;
};

const CONNECTIONS: ConnectionName[] = ['simulator', 'discord', 'adsb', 'api'];

export const CONNECTION_STATES: ConnectionState[] = [
  'connected',
  'disconnected',
  'unauthorised',
  'waiting-for-flight',
  'standby',
];

export class StatusRegistry {
  private readonly connections = new Map<ConnectionName, ConnectionState>(
    CONNECTIONS.map((name) => [name, 'disconnected' as ConnectionState]),
  );

  private callsign: string | null = null;
  private aircraftIdentifier: string | null = null;
  private lastAcceptedReportAt: Date | null = null;
  private publishedCount = 0;
  private droppedCount = 0;
  private presenceState: string | null = null;
  private presenceDetails: string | null = null;

  set(name: ConnectionName, state: ConnectionState): void {
    this.connections.set(name, state);
  }

  setCallsign(callsign: string | null): void {
    this.callsign = callsign;
  }

  setAircraftIdentifier(identifier: string | null): void {
    this.aircraftIdentifier = identifier;
  }

  recordAcceptedReport(at: Date): void {
    this.lastAcceptedReportAt = at;
    this.publishedCount += 1;
  }

  setDroppedCount(count: number): void {
    this.droppedCount = count;
  }

  setPresence(state: string | null, details: string | null): void {
    this.presenceState = state;
    this.presenceDetails = details;
  }

  snapshot(): StatusSnapshot {
    return {
      connections: Object.fromEntries(this.connections) as Record<
        ConnectionName,
        ConnectionState
      >,
      callsign: this.callsign,
      aircraftIdentifier: this.aircraftIdentifier,
      lastAcceptedReportAt: this.lastAcceptedReportAt,
      publishedCount: this.publishedCount,
      droppedCount: this.droppedCount,
      presenceState: this.presenceState,
      presenceDetails: this.presenceDetails,
    };
  }

  describe(): string {
    const snapshot = this.snapshot();
    const connections = CONNECTIONS.map(
      (name) => `${name}=${snapshot.connections[name]}`,
    ).join(' ');

    return (
      `${connections} callsign=${snapshot.callsign ?? '-'} ` +
      `aircraft=${snapshot.aircraftIdentifier ?? '-'} ` +
      `published=${snapshot.publishedCount} dropped=${snapshot.droppedCount}`
    );
  }
}
