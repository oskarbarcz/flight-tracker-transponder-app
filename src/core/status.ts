export type ConnectionName = 'simulator' | 'discord' | 'adsb' | 'api';

// `standby` is the transponder's own word for it, and only `adsb` ever wears
// it: the connection is fine, the pilot has switched transmission off.
export type ConnectionState =
  | 'connected'
  | 'disconnected'
  | 'unauthorised'
  | 'waiting-for-flight'
  | 'standby';

// The two services this app talks to over the network, as opposed to the two
// local sockets. Only these publish a version of their own.
export type ServiceName = 'api' | 'adsb';

export type Crew = {
  name: string;
  email: string;
};

export type ServiceAirport = {
  iata: string | null;
  icao: string | null;
  name: string | null;
};

// The flight as Flight Tracker describes it, which is a different thing from
// what the simulator has loaded. Both are shown, because the disagreement
// between them is a fault worth seeing.
export type CurrentService = {
  callsign: string;
  departure: ServiceAirport | null;
  arrival: ServiceAirport | null;
  airframe: string | null;
  registration: string | null;
};

export type StatusSnapshot = {
  connections: Record<ConnectionName, ConnectionState>;
  faults: Record<ConnectionName, string | null>;
  serviceVersions: Record<ServiceName, string | null>;
  latestRelease: string | null;
  crew: Crew | null;
  service: CurrentService | null;
  callsign: string | null;
  aircraftIdentifier: string | null;
  squawk: string | null;
  groundSpeedKt: number | null;
  transmitting: boolean;
  lastAcceptedReportAt: Date | null;
  publishedCount: number;
  droppedCount: number;
  presenceState: string | null;
  presenceDetails: string | null;
};

const CONNECTIONS: ConnectionName[] = ['simulator', 'discord', 'adsb', 'api'];

const SERVICES: ServiceName[] = ['api', 'adsb'];

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

  private readonly serviceVersions = new Map<ServiceName, string | null>(
    SERVICES.map((name) => [name, null]),
  );

  // Why a connection is unhappy, in words, kept apart from the state so the
  // dashboard can say more than `disconnected`. A pilot whose simulator will
  // not connect should not have to open the debug pane to find out why.
  private readonly faults = new Map<ConnectionName, string>();

  private latestRelease: string | null = null;
  private crew: Crew | null = null;
  private service: CurrentService | null = null;
  private callsign: string | null = null;
  private aircraftIdentifier: string | null = null;
  private squawk: string | null = null;
  private groundSpeedKt: number | null = null;
  private transmitting = true;
  private lastAcceptedReportAt: Date | null = null;
  private publishedCount = 0;
  private droppedCount = 0;
  private presenceState: string | null = null;
  private presenceDetails: string | null = null;

  set(name: ConnectionName, state: ConnectionState): void {
    this.connections.set(name, state);
  }

  setFault(name: ConnectionName, message: string | null): void {
    if (message === null) {
      this.faults.delete(name);

      return;
    }

    this.faults.set(name, message);
  }

  setServiceVersion(name: ServiceName, version: string | null): void {
    this.serviceVersions.set(name, version);
  }

  setLatestRelease(version: string | null): void {
    this.latestRelease = version;
  }

  setCrew(crew: Crew | null): void {
    this.crew = crew;
  }

  setService(service: CurrentService | null): void {
    this.service = service;
  }

  setCallsign(callsign: string | null): void {
    this.callsign = callsign;
  }

  setAircraftIdentifier(identifier: string | null): void {
    this.aircraftIdentifier = identifier;
  }

  // What the transponder is actually squawking, taken from the last sample
  // rather than from the last report: it is the aircraft's state, and it is
  // worth seeing even while nothing is being published.
  setTransponder(squawk: string | null, groundSpeedKt: number | null): void {
    this.squawk = squawk;
    this.groundSpeedKt = groundSpeedKt;
  }

  setTransmitting(transmitting: boolean): void {
    this.transmitting = transmitting;
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
      faults: Object.fromEntries(
        CONNECTIONS.map((name) => [name, this.faults.get(name) ?? null]),
      ) as Record<ConnectionName, string | null>,
      serviceVersions: Object.fromEntries(this.serviceVersions) as Record<
        ServiceName,
        string | null
      >,
      latestRelease: this.latestRelease,
      crew: this.crew,
      service: this.service,
      callsign: this.callsign,
      aircraftIdentifier: this.aircraftIdentifier,
      squawk: this.squawk,
      groundSpeedKt: this.groundSpeedKt,
      transmitting: this.transmitting,
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
