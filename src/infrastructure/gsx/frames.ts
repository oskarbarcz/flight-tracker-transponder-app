import { isRecord } from './capture';
import type { GsxFrame } from './connection';

export type DecodedFrame =
  | { kind: 'hello'; capabilities: string[]; gsxRunning: boolean }
  | { kind: 'snapshot'; state: Record<string, unknown> }
  | { kind: 'patch'; key: string; value: unknown }
  | { kind: 'result'; id: string | null; ok: boolean }
  | { kind: 'event'; topic: string | null }
  | { kind: 'unreadable' };

const UNREADABLE: DecodedFrame = { kind: 'unreadable' };

export const ENVELOPE_KEYS = ['v', 'type', 'ts', 'id', 'ok', 'error'];

export function decode(frame: GsxFrame): DecodedFrame {
  const value = frame.value;

  if (!frame.parsed || !isRecord(value)) {
    return UNREADABLE;
  }

  switch (value.type) {
    case 'hello':
      return {
        kind: 'hello',
        capabilities: strings(value.capabilities),
        gsxRunning: value.gsxRunning === true,
      };
    case 'snapshot':
      return { kind: 'snapshot', state: withoutEnvelope(value) };
    case 'patch':
      return patchOf(value);
    case 'result':
      return {
        kind: 'result',
        id: typeof value.id === 'string' ? value.id : null,
        ok: value.ok === true,
      };
    case 'event':
      return {
        kind: 'event',
        topic: typeof value.topic === 'string' ? value.topic : null,
      };
    default:
      return UNREADABLE;
  }
}

function patchOf(value: Record<string, unknown>): DecodedFrame {
  const path = value.path;

  if (typeof path !== 'string') {
    return UNREADABLE;
  }

  const key = path.replace(/^\/+/, '');

  return key === '' || key.includes('/')
    ? UNREADABLE
    : { kind: 'patch', key, value: value.value };
}

function withoutEnvelope(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const state: Record<string, unknown> = {};

  for (const [key, held] of Object.entries(value)) {
    if (!ENVELOPE_KEYS.includes(key)) {
      state[key] = held;
    }
  }

  return state;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}
