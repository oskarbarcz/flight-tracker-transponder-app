export type ServiceId =
  | 'boarding'
  | 'deboarding'
  | 'catering'
  | 'refueling'
  | 'pushback'
  | 'jetway'
  | 'stairs'
  | 'gpu'
  | 'deicing'
  | 'lavatory'
  | 'water'
  | 'cleaning';

export type ServiceState =
  | 'requestable'
  | 'requested'
  | 'performing'
  | 'completed'
  | 'bypassed';

export type PassengerProgress = {
  done: number;
  total: number;
};

export type CargoHold = {
  hold: string;
  unit: string;
  done: number;
  total: number;
};

export type FuelProgress = {
  loaded: number;
  aircraftTotal: number | null;
  unit: string;
};

export type GroundService = {
  id: ServiceId;
  state: ServiceState | null;
  phase: string | null;
  operator: string | null;
  passengers: PassengerProgress | null;
  bagsPercent: number | null;
  cargo: CargoHold[];
  fuel: FuelProgress | null;
};

export const SERVICE_IDS: Record<string, ServiceId> = {
  Boarding: 'boarding',
  Deboarding: 'deboarding',
  Catering: 'catering',
  Refueling: 'refueling',
  Departure: 'pushback',
  OperateJetways: 'jetway',
  OperateStairs: 'stairs',
  GPU: 'gpu',
  DeIce: 'deicing',
  Lavatory: 'lavatory',
  Water: 'water',
  Cleaning: 'cleaning',
};

export const SERVICE_STATES: Record<string, ServiceState> = {
  available: 'requestable',
  requested: 'requested',
  performing: 'performing',
  completed: 'completed',
  bypassed: 'bypassed',
};

const RANK: Record<ServiceState, number> = {
  requestable: 0,
  requested: 1,
  performing: 2,
  bypassed: 3,
  completed: 4,
};

export function serviceIdOf(published: unknown): ServiceId | null {
  return typeof published === 'string'
    ? (SERVICE_IDS[published] ?? null)
    : null;
}

export function serviceStateOf(published: unknown): ServiceState | null {
  return typeof published === 'string'
    ? (SERVICE_STATES[published] ?? null)
    : null;
}

export function isRunning(service: GroundService): boolean {
  return service.state === 'performing' || service.state === 'requested';
}

export function isWorthShowing(service: GroundService): boolean {
  return service.state !== null && service.state !== 'requestable';
}

export class Turnaround {
  private reached = new Map<ServiceId, ServiceState>();
  private services: GroundService[] = [];

  accept(services: GroundService[]): void {
    for (const service of services) {
      if (service.state === null) {
        continue;
      }

      const seen = this.reached.get(service.id);

      if (seen === undefined || RANK[service.state] > RANK[seen]) {
        this.reached.set(service.id, service.state);
      }
    }

    this.services = services.map((service) => ({
      ...service,
      state: this.settled(service),
    }));
  }

  reset(): void {
    this.reached = new Map();
    this.services = [];
  }

  snapshot(): GroundService[] {
    return this.services;
  }

  running(): GroundService[] {
    return this.services.filter(isRunning);
  }

  private settled(service: GroundService): ServiceState | null {
    const reached = this.reached.get(service.id);

    if (service.state === null || reached === undefined) {
      return service.state;
    }

    return reached === 'completed' && service.state === 'requestable'
      ? 'completed'
      : service.state;
  }
}
