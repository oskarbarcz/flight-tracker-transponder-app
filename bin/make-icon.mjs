import { spawnSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SOURCE = 'assets/icon.svg';
const OUTFILE = 'assets/icon.ico';

const SIZES = [256, 128, 64, 48, 32, 16];

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

if (process.platform !== 'darwin') {
  process.stderr.write('this needs sips, so it only runs on macOS\n');
  process.exit(1);
}

function rasterise(source, size, target) {
  const result = spawnSync(
    'sips',
    [
      '-s',
      'format',
      'png',
      '--resampleHeightWidth',
      String(size),
      String(size),
      source,
      '--out',
      target,
    ],
    { stdio: 'ignore' },
  );

  if (result.status !== 0) {
    throw new Error(`sips could not render ${source} at ${size}px`);
  }

  return readFileSync(target);
}

function decodePng(png) {
  if (!png.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error('not a PNG');
  }

  let offset = 8;
  let header = null;
  const parts = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colour: body[9],
        interlace: body[12],
      };
    } else if (type === 'IDAT') {
      parts.push(body);
    } else if (type === 'IEND') {
      break;
    }

    offset += length + 12;
  }

  if (header === null) {
    throw new Error('PNG has no IHDR');
  }

  if (header.depth !== 8 || header.colour !== 6 || header.interlace !== 0) {
    throw new Error(
      `expected 8-bit non-interlaced RGBA, got depth ${header.depth}, ` +
        `colour type ${header.colour}, interlace ${header.interlace}`,
    );
  }

  return {
    width: header.width,
    height: header.height,
    pixels: unfilter(
      inflateSync(Buffer.concat(parts)),
      header.width,
      header.height,
    ),
  };
}

function unfilter(raw, width, height) {
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);

  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)];
    const from = row * (stride + 1) + 1;
    const to = row * stride;

    for (let index = 0; index < stride; index += 1) {
      const value = raw[from + index];
      const left = index >= bpp ? out[to + index - bpp] : 0;
      const up = row > 0 ? out[to - stride + index] : 0;
      const corner = row > 0 && index >= bpp ? out[to - stride + index - bpp] : 0;

      out[to + index] = (value + reconstruct(filter, left, up, corner)) & 0xff;
    }
  }

  return out;
}

function reconstruct(filter, left, up, corner) {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return (left + up) >> 1;
    case 4:
      return paeth(left, up, corner);
    default:
      throw new Error(`unknown PNG filter ${filter}`);
  }
}

function paeth(left, up, corner) {
  const estimate = left + up - corner;
  const dLeft = Math.abs(estimate - left);
  const dUp = Math.abs(estimate - up);
  const dCorner = Math.abs(estimate - corner);

  if (dLeft <= dUp && dLeft <= dCorner) {
    return left;
  }

  return dUp <= dCorner ? up : corner;
}

function toDib({ width, height, pixels }) {
  const maskStride = (((width + 31) >> 5) << 2);
  const header = Buffer.alloc(40);

  header.writeUInt32LE(40, 0);
  header.writeInt32LE(width, 4);
  header.writeInt32LE(height * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(width * height * 4, 20);

  const colour = Buffer.alloc(width * height * 4);
  const mask = Buffer.alloc(maskStride * height);

  for (let row = 0; row < height; row += 1) {
    const source = row * width * 4;
    const target = (height - 1 - row) * width * 4;
    const maskRow = (height - 1 - row) * maskStride;

    for (let column = 0; column < width; column += 1) {
      const from = source + column * 4;
      const to = target + column * 4;
      const alpha = pixels[from + 3];

      colour[to] = pixels[from + 2];
      colour[to + 1] = pixels[from + 1];
      colour[to + 2] = pixels[from];
      colour[to + 3] = alpha;

      if (alpha === 0) {
        mask[maskRow + (column >> 3)] |= 0x80 >> (column & 7);
      }
    }
  }

  return Buffer.concat([header, colour, mask]);
}

function toIco(frames) {
  const directory = Buffer.alloc(6 + frames.length * 16);

  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(frames.length, 4);

  let offset = directory.length;

  for (const [index, frame] of frames.entries()) {
    const entry = 6 + index * 16;

    directory.writeUInt8(frame.size === 256 ? 0 : frame.size, entry);
    directory.writeUInt8(frame.size === 256 ? 0 : frame.size, entry + 1);
    directory.writeUInt8(0, entry + 2);
    directory.writeUInt8(0, entry + 3);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(frame.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);

    offset += frame.data.length;
  }

  return Buffer.concat([directory, ...frames.map((frame) => frame.data)]);
}

const workspace = mkdtempSync(join(tmpdir(), 'ft-icon-'));

try {
  const frames = SIZES.map((size) => {
    const png = decodePng(
      rasterise(SOURCE, size, join(workspace, `${size}.png`)),
    );

    if (png.width !== size || png.height !== size) {
      throw new Error(
        `sips returned ${png.width}x${png.height} for a ${size}px frame`,
      );
    }

    return { size, data: toDib(png) };
  });

  const ico = toIco(frames);

  writeFileSync(OUTFILE, ico);
  process.stdout.write(
    `wrote ${OUTFILE}: ${SIZES.join(', ')}px, ${ico.length} bytes\n`,
  );
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
