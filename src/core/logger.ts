import { appendFileSync, renameSync, statSync } from 'node:fs';
import type { LogLevel } from '../config/config';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MAX_LOG_BYTES = 5 * 1024 * 1024;

const SECRET_PATTERNS: RegExp[] = [
  /(Bearer\s+)[A-Za-z0-9._-]+/gi,
  /("?(?:password|accessToken|refreshToken|token)"?\s*[:=]\s*"?)[^",\s}]+/gi,
];

export function redact(message: string): string {
  return SECRET_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, '$1[redacted]'),
    message,
  );
}

export class Logger {
  constructor(
    private readonly level: LogLevel,
    private readonly filePath: string,
    private readonly scope = 'app',
  ) {}

  child(scope: string): Logger {
    return new Logger(this.level, this.filePath, scope);
  }

  debug(message: string): void {
    this.write('debug', message);
  }

  info(message: string): void {
    this.write('info', message);
  }

  warn(message: string): void {
    this.write('warn', message);
  }

  error(message: string): void {
    this.write('error', message);
  }

  private write(level: LogLevel, message: string): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) {
      return;
    }

    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${this.scope}] ${redact(message)}`;

    process.stdout.write(`${line}\n`);
    this.appendToFile(line);
  }

  private appendToFile(line: string): void {
    try {
      this.rotateIfNeeded();
      appendFileSync(this.filePath, `${line}\n`, { encoding: 'utf-8' });
    } catch {
      return;
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (statSync(this.filePath).size < MAX_LOG_BYTES) {
        return;
      }

      renameSync(this.filePath, `${this.filePath}.1`);
    } catch {
      return;
    }
  }
}
