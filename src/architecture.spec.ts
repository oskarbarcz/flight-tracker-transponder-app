import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';

type Layer =
  | 'domain'
  | 'application'
  | 'infrastructure'
  | 'presentation'
  | 'integration'
  | 'root';

const MAY_IMPORT: Record<Layer, Layer[]> = {
  domain: [],
  application: ['domain'],
  infrastructure: ['application', 'domain'],
  presentation: ['application', 'domain'],
  integration: ['application', 'domain', 'infrastructure', 'presentation'],
  root: ['application', 'domain', 'infrastructure', 'presentation'],
};

const PORTS = join('application', 'ports');

const SOURCE = join(__dirname);

const IMPORT = /\bfrom\s+'(\.[^']*)'/g;

function layerOf(path: string): Layer {
  const [first] = relative(SOURCE, path).split(sep);

  return first === 'domain' ||
    first === 'application' ||
    first === 'infrastructure' ||
    first === 'presentation' ||
    first === 'integration'
    ? first
    : 'root';
}

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return sources(path);
    }

    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [path]
      : [];
  });
}

function importsOf(path: string): string[] {
  const text = readFileSync(path, 'utf-8');

  return [...text.matchAll(IMPORT)].map((match) =>
    normalize(join(dirname(path), match[1] ?? '')),
  );
}

describe('the layers', () => {
  const files = sources(SOURCE);

  it('finds the source tree it is meant to be guarding', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it.each(Object.keys(MAY_IMPORT) as Layer[])(
    '%s imports only downward',
    (layer) => {
      const offences = files
        .filter((file) => layerOf(file) === layer)
        .flatMap((file) =>
          importsOf(file)
            .filter((target) => layerOf(target) !== layer)
            .filter((target) => !MAY_IMPORT[layer].includes(layerOf(target)))
            .map(
              (target) =>
                `${relative(SOURCE, file)} -> ${relative(SOURCE, target)}`,
            ),
        );

      expect(offences).toEqual([]);
    },
  );

  it('lets the adapters reach the core only through its ports', () => {
    const offences = files
      .filter((file) => layerOf(file) === 'infrastructure')
      .flatMap((file) =>
        importsOf(file)
          .filter((target) => layerOf(target) === 'application')
          .filter((target) => !relative(SOURCE, target).startsWith(PORTS))
          .map(
            (target) =>
              `${relative(SOURCE, file)} -> ${relative(SOURCE, target)}`,
          ),
      );

    expect(offences).toEqual([]);
  });

  it('keeps the domain answerable to nothing', () => {
    const reaching = files
      .filter((file) => layerOf(file) === 'domain')
      .flatMap((file) =>
        importsOf(file).filter((target) => layerOf(target) !== 'domain'),
      );

    expect(reaching).toEqual([]);
  });
});
