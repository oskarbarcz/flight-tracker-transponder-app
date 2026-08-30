import {
  type CargoHold,
  type FuelProgress,
  type GroundService,
  type PassengerProgress,
  serviceIdOf,
  serviceStateOf,
} from '../../domain/ground-services';
import { isRecord } from './capture';

export function readServices(published: unknown): GroundService[] {
  if (!Array.isArray(published)) {
    return [];
  }

  const services: GroundService[] = [];

  for (const entry of published) {
    const service = readService(entry);

    if (service !== null) {
      services.push(service);
    }
  }

  return services;
}

function readService(entry: unknown): GroundService | null {
  if (!isRecord(entry)) {
    return null;
  }

  const id = serviceIdOf(entry.id);

  if (id === null) {
    return null;
  }

  const detail = isRecord(entry.detail) ? entry.detail : null;

  return {
    id,
    state: serviceStateOf(entry.state),
    phase: text(detail?.phase),
    operator: text(entry.operator),
    passengers: readPassengers(detail?.pax),
    bagsPercent: count(detail?.bagsPercent),
    cargo: readCargo(detail?.cargo),
    fuel: readFuel(detail?.fuel),
  };
}

function readPassengers(published: unknown): PassengerProgress | null {
  if (!isRecord(published)) {
    return null;
  }

  const done = count(published.done);
  const total = count(published.total);

  return done === null || total === null ? null : { done, total };
}

function readCargo(published: unknown): CargoHold[] {
  if (!Array.isArray(published)) {
    return [];
  }

  const holds: CargoHold[] = [];

  for (const entry of published) {
    if (!isRecord(entry)) {
      continue;
    }

    const done = count(entry.done);
    const total = count(entry.total);

    if (done === null || total === null) {
      continue;
    }

    holds.push({
      hold: text(entry.hold) ?? '',
      unit: text(entry.unit) ?? '',
      done,
      total,
    });
  }

  return holds;
}

function readFuel(published: unknown): FuelProgress | null {
  if (!isRecord(published)) {
    return null;
  }

  const loaded = count(published.current);

  return loaded === null
    ? null
    : {
        loaded,
        aircraftTotal: count(published.aircraftTotal),
        unit: text(published.unit) ?? '',
      };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
