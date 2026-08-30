import type { GroundService } from '../../domain/ground-services';

export type GroundHandlingStatus = 'searching' | 'connected' | 'unsupported';

export type Stand = {
  airport: string | null;
  parking: string | null;
};

export type GroundServicesHandlers = {
  onStatus: (status: GroundHandlingStatus) => void;
  onServices: (services: GroundService[]) => void;
  onStand: (stand: Stand) => void;
};

export interface GroundServicesSource {
  run(signal: AbortSignal): Promise<void>;
}
