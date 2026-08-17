export const TRAY_SIZE = 16;

export const TRAY_COLOURS = {
  transmitting: { red: 0x3f, green: 0xb9, blue: 0x50 },
  standby: { red: 0x8a, green: 0x8a, blue: 0x8a },
  waiting: { red: 0x38, green: 0xa8, blue: 0xd8 },
  fault: { red: 0xd9, green: 0x3a, blue: 0x3a },
} as const;

export type TrayColour = keyof typeof TRAY_COLOURS;

const HEADER_BYTES = 40;

export function trayIcon(colour: TrayColour): Buffer {
  const { red, green, blue } = TRAY_COLOURS[colour];
  const size = TRAY_SIZE;
  const maskStride = ((size + 31) >> 5) << 2;

  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt32LE(HEADER_BYTES, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(size * size * 4, 20);

  const pixels = Buffer.alloc(size * size * 4);
  const mask = Buffer.alloc(maskStride * size);
  const centre = (size - 1) / 2;
  const radius = size / 2 - 0.5;

  for (let row = 0; row < size; row += 1) {
    const target = (size - 1 - row) * size * 4;
    const maskRow = (size - 1 - row) * maskStride;

    for (let column = 0; column < size; column += 1) {
      const alpha = coverage(column - centre, row - centre, radius);
      const at = target + column * 4;

      pixels[at] = blue;
      pixels[at + 1] = green;
      pixels[at + 2] = red;
      pixels[at + 3] = alpha;

      if (alpha === 0) {
        const at = maskRow + (column >> 3);
        mask[at] = (mask[at] ?? 0) | (0x80 >> (column & 7));
      }
    }
  }

  return Buffer.concat([header, pixels, mask]);
}

function coverage(x: number, y: number, radius: number): number {
  const distance = Math.sqrt(x * x + y * y);
  const edge = radius - distance;

  if (edge >= 0.5) {
    return 255;
  }

  if (edge <= -0.5) {
    return 0;
  }

  return Math.round((edge + 0.5) * 255);
}
