import { TRAY_SIZE, type TrayColour, trayIcon } from './icon';
import { NoTray, type Tray } from './tray';

const WS_EX_TOOLWINDOW = 0x00000080;

const NIM_ADD = 0;
const NIM_MODIFY = 1;
const NIM_DELETE = 2;
const NIM_SETVERSION = 4;

const NIF_ICON = 0x02;
const NIF_TIP = 0x04;
const NIF_SHOWTIP = 0x80;

const NOTIFYICON_VERSION_4 = 4;
const IMAGE_ICON_FORMAT = 0x00030000;

const CLASS_BYTES = 80;
const CLASS_PROC = 8;
const CLASS_INSTANCE = 24;
const CLASS_NAME = 64;

const NID_BYTES = 976;
const NID_WINDOW = 8;
const NID_ID = 16;
const NID_FLAGS = 20;
const NID_ICON = 32;
const NID_TIP = 40;
const NID_TIP_CHARS = 128;
const NID_VERSION = 816;
const CB_SIZE_CANDIDATES = [976, 952, 504];

const TOOLTIP_CHARS = NID_TIP_CHARS - 1;

type Call = (...args: unknown[]) => unknown;

type Win32 = {
  ptr: (buffer: NodeJS.TypedArray) => number | bigint;
  notifyIcon: Call;
  createIcon: Call;
  destroyIcon: Call;
  destroyWindow: Call;
  unregisterClass: Call;
};

export type TrayLogger = {
  info(message: string): void;
  warn(message: string): void;
};

export async function openWindowsTray(logger: TrayLogger): Promise<Tray> {
  if (process.platform !== 'win32') {
    return new NoTray();
  }

  try {
    return await attach(logger);
  } catch (error) {
    logger.warn(`no tray icon: ${describe(error)}`);

    return new NoTray();
  }
}

type Ffi = {
  dlopen: (
    path: string,
    symbols: Record<string, unknown>,
  ) => { symbols: Record<string, Call | undefined> };
  ptr: Win32['ptr'];
  FFIType: Record<string, unknown>;
};

async function attach(logger: TrayLogger): Promise<Tray> {
  const specifier = 'bun:ffi';
  const { dlopen, ptr, FFIType } = (await import(specifier)) as Ffi;

  const p = FFIType.ptr;
  const i32 = FFIType.i32;
  const u32 = FFIType.u32;

  const user32 = dlopen('user32.dll', {
    RegisterClassExW: { args: [p], returns: u32 },
    UnregisterClassW: { args: [p, p], returns: i32 },
    CreateWindowExW: {
      args: [u32, p, p, u32, i32, i32, i32, i32, p, p, p, p],
      returns: p,
    },
    DestroyWindow: { args: [p], returns: i32 },
    CreateIconFromResourceEx: {
      args: [p, u32, i32, u32, i32, i32, u32],
      returns: p,
    },
    DestroyIcon: { args: [p], returns: i32 },
  });

  const shell32 = dlopen('shell32.dll', {
    Shell_NotifyIconW: { args: [u32, p], returns: i32 },
  });

  const kernel32 = dlopen('kernel32.dll', {
    GetModuleHandleW: { args: [p], returns: p },
    GetProcAddress: { args: [p, p], returns: p },
    GetLastError: { args: [], returns: u32 },
  });

  const lastError = need(kernel32, 'GetLastError');
  const fail = (call: string): never => {
    throw new Error(`${call} failed with Win32 error ${String(lastError())}`);
  };

  const moduleHandle = need(kernel32, 'GetModuleHandleW');
  const procAddress = need(kernel32, 'GetProcAddress');
  const registerClass = need(user32, 'RegisterClassExW');
  const createWindow = need(user32, 'CreateWindowExW');

  const instance = moduleHandle(null);
  const className = wide(`FlightTrackerTray${process.pid}`);

  const defWindowProc = procAddress(
    moduleHandle(ptr(wide('user32.dll'))),
    ptr(narrow('DefWindowProcW')),
  );

  if (isNull(defWindowProc)) {
    fail('GetProcAddress(DefWindowProcW)');
  }

  const wndClass = Buffer.alloc(CLASS_BYTES);
  wndClass.writeUInt32LE(CLASS_BYTES, 0);
  writePointer(wndClass, CLASS_PROC, defWindowProc);
  writePointer(wndClass, CLASS_INSTANCE, instance);
  writePointer(wndClass, CLASS_NAME, ptr(className));

  if (Number(registerClass(ptr(wndClass))) === 0) {
    fail('RegisterClassExW');
  }

  const window = createWindow(
    WS_EX_TOOLWINDOW,
    ptr(className),
    ptr(wide('MyPreflight transponder')),
    0,
    0,
    0,
    0,
    0,
    null,
    null,
    instance,
    null,
  );

  if (isNull(window)) {
    fail('CreateWindowExW');
  }

  logger.info('tray icon attached');

  return new WindowsTray(
    {
      ptr,
      notifyIcon: need(shell32, 'Shell_NotifyIconW'),
      createIcon: need(user32, 'CreateIconFromResourceEx'),
      destroyIcon: need(user32, 'DestroyIcon'),
      destroyWindow: need(user32, 'DestroyWindow'),
      unregisterClass: need(user32, 'UnregisterClassW'),
    },
    window,
    className,
    logger,
  );
}

class WindowsTray implements Tray {
  private added = false;
  private cbSize = CB_SIZE_CANDIDATES[0] ?? NID_BYTES;
  private shown: string | null = null;
  private icon: unknown = null;

  constructor(
    private readonly win32: Win32,
    private readonly window: unknown,
    private readonly className: Buffer,
    private readonly logger: TrayLogger,
  ) {}

  show(colour: TrayColour, tooltip: string): void {
    const fingerprint = `${colour} ${tooltip}`;

    if (fingerprint === this.shown) {
      return;
    }

    try {
      const icon = this.makeIcon(colour);

      if (!this.added) {
        this.add(icon, tooltip);
      } else if (!this.notify(NIM_MODIFY, this.describeIcon(icon, tooltip))) {
        this.added = false;
        this.add(icon, tooltip);
      }

      this.replaceIcon(icon);
      this.shown = fingerprint;
    } catch (error) {
      this.logger.warn(`tray update failed: ${describe(error)}`);
      this.shown = null;
    }
  }

  hide(): void {
    if (this.added) {
      this.notify(NIM_DELETE, this.describeIcon(this.icon, ''));
      this.added = false;
    }

    this.replaceIcon(null);
    this.win32.destroyWindow(this.window);
    this.win32.unregisterClass(this.win32.ptr(this.className), null);
  }

  private add(icon: unknown, tooltip: string): void {
    for (const candidate of CB_SIZE_CANDIDATES) {
      this.cbSize = candidate;

      if (this.notify(NIM_ADD, this.describeIcon(icon, tooltip))) {
        this.added = true;
        this.notify(NIM_SETVERSION, this.describeIcon(icon, tooltip));

        return;
      }
    }

    throw new Error(
      `Shell_NotifyIconW refused every NOTIFYICONDATAW size (${CB_SIZE_CANDIDATES.join(', ')})`,
    );
  }

  private notify(message: number, data: Buffer): boolean {
    return Number(this.win32.notifyIcon(message, this.win32.ptr(data))) !== 0;
  }

  private describeIcon(icon: unknown, tooltip: string): Buffer {
    const data = Buffer.alloc(NID_BYTES);

    data.writeUInt32LE(this.cbSize, 0);
    writePointer(data, NID_WINDOW, this.window);
    data.writeUInt32LE(1, NID_ID);
    data.writeUInt32LE(NIF_ICON | NIF_TIP | NIF_SHOWTIP, NID_FLAGS);
    writePointer(data, NID_ICON, icon);
    data.writeUInt32LE(NOTIFYICON_VERSION_4, NID_VERSION);

    const text = wide(tooltip.slice(0, TOOLTIP_CHARS));
    text.copy(data, NID_TIP, 0, Math.min(text.length, NID_TIP_CHARS * 2));

    return data;
  }

  private makeIcon(colour: TrayColour): unknown {
    const blob = trayIcon(colour);
    const icon = this.win32.createIcon(
      this.win32.ptr(blob),
      blob.length,
      1,
      IMAGE_ICON_FORMAT,
      TRAY_SIZE,
      TRAY_SIZE,
      0,
    );

    if (isNull(icon)) {
      throw new Error('CreateIconFromResourceEx returned no icon');
    }

    return icon;
  }

  private replaceIcon(next: unknown): void {
    const previous = this.icon;
    this.icon = next;

    if (!isNull(previous)) {
      this.win32.destroyIcon(previous);
    }
  }
}

function need(
  library: { symbols: Record<string, Call | undefined> },
  name: string,
): Call {
  const symbol = library.symbols[name];

  if (symbol === undefined) {
    throw new Error(`${name} is not available in this Windows build`);
  }

  return symbol;
}

export function wide(text: string): Buffer {
  return Buffer.from(`${text}\u0000`, 'utf16le');
}

export function narrow(text: string): Buffer {
  return Buffer.from(`${text}\u0000`, 'latin1');
}

function writePointer(buffer: Buffer, offset: number, value: unknown): void {
  buffer.writeBigUInt64LE(BigInt(asAddress(value)), offset);
}

function asAddress(value: unknown): number | bigint {
  if (typeof value === 'bigint') {
    return value;
  }

  return typeof value === 'number' ? Math.trunc(value) : 0;
}

function isNull(value: unknown): boolean {
  return value === null || value === undefined || value === 0 || value === 0n;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
