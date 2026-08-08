import { describe, expect, it } from 'vitest';

// @ts-expect-error — plain ESM with no types, so it can run in an editor host.
import { positionOf } from '../cli/lib/positions.mjs';

/**
 * Where a dependency sits in the file.
 *
 * Two failures matter and neither throws. Underlining the wrong line puts a
 * warning against a line that has nothing to do with it — `"name": "my-app"`
 * at the top of a package.json is the project's own name, and this project has
 * already shipped a reader that mistook exactly that shape in a Cargo.toml.
 * Finding nothing is the safe failure and the one to prefer.
 *
 * The file is often mid-edit when an editor asks, because that is when
 * somebody is adding a dependency, so none of this may require the file to
 * parse.
 */

const PACKAGE_JSON = [
  '{',
  '  "name": "my-app",',
  '  "version": "1.0.0",',
  '  "dependencies": {',
  '    "axios": "^1.6.0",',
  '    "react": "^19.0.0"',
  '  },',
  '  "devDependencies": {',
  '    "vitest": "^4.0.0"',
  '  },',
  '  "scripts": {',
  '    "axios": "echo not a dependency"',
  '  }',
  '}',
].join('\n');

describe('package.json', () => {
  it('finds a runtime dependency on its own line', () => {
    expect(positionOf(PACKAGE_JSON, 'npm', 'axios')).toEqual({
      line: 4,
      character: 5,
      length: 5,
    });
  });

  it('finds one in devDependencies too', () => {
    expect(positionOf(PACKAGE_JSON, 'npm', 'vitest')?.line).toBe(8);
  });

  it('never points at the project name', () => {
    // Line 1 is `"name": "my-app"`. A dependency genuinely called `name` would
    // be found in the dependency block or not at all.
    expect(positionOf(PACKAGE_JSON, 'npm', 'name')).toBeNull();
  });

  it('never points at a script that shares a dependency name', () => {
    // `axios` appears twice: once as a dependency, once as a script. The first
    // is the one inside a dependency block, and the scan stops there.
    expect(positionOf(PACKAGE_JSON, 'npm', 'axios')?.line).toBe(4);
  });

  it('returns null for something not declared', () => {
    expect(positionOf(PACKAGE_JSON, 'npm', 'left-pad')).toBeNull();
  });

  it('handles a scoped name, brackets and all', () => {
    const text = '{\n  "dependencies": {\n    "@babel/core": "^8.0.0"\n  }\n}';
    expect(positionOf(text, 'npm', '@babel/core')).toEqual({
      line: 2,
      character: 5,
      length: 11,
    });
  });

  it('reads a manifest written on one line', () => {
    // What a generator emits, and what a paste often is. The names sit on the
    // same line as the block that opens them, so a reader that skips the
    // opening line finds nothing at all.
    const compact = '{"dependencies":{"asto":"^1.0.0","esbuild":"^0.28.0"}}';
    const at = positionOf(compact, 'npm', 'esbuild');

    expect(at?.line).toBe(0);
    expect(compact.slice(at?.character, (at?.character ?? 0) + (at?.length ?? 0))).toBe('esbuild');
  });

  it('still finds a line in a file that does not parse', () => {
    // Mid-edit is exactly when an editor asks.
    const broken = '{\n  "dependencies": {\n    "axios": "^1.6.0",\n';
    expect(positionOf(broken, 'npm', 'axios')?.line).toBe(2);
  });
});

describe('Cargo.toml', () => {
  const CARGO = [
    '[package]',
    'name = "my-app"',
    'version = "0.1.0"',
    '',
    '[dependencies]',
    'serde = "1.0"',
    'tokio = { version = "1.40" }',
    '',
    '[dev-dependencies]',
    'criterion = "0.5"',
  ].join('\n');

  it('finds a crate in the dependencies table', () => {
    expect(positionOf(CARGO, 'crates', 'serde')).toEqual({ line: 5, character: 0, length: 5 });
  });

  it('finds one in dev-dependencies', () => {
    expect(positionOf(CARGO, 'crates', 'criterion')?.line).toBe(9);
  });

  it('never points at a key in [package]', () => {
    // `name = "my-app"` is the shape that produced a dependency called `name`
    // once already. There is a real crate by that name.
    expect(positionOf(CARGO, 'crates', 'name')).toBeNull();
    expect(positionOf(CARGO, 'crates', 'version')).toBeNull();
  });
});

describe('requirements.txt', () => {
  const REQUIREMENTS = ['-r base.txt', 'requests==2.31.0', 'flask[async]>=3.0', 'httpx'].join('\n');

  it('finds a pinned package', () => {
    expect(positionOf(REQUIREMENTS, 'pypi', 'requests')).toEqual({
      line: 1,
      character: 0,
      length: 8,
    });
  });

  it('finds one that declares extras', () => {
    expect(positionOf(REQUIREMENTS, 'pypi', 'flask')?.line).toBe(2);
  });

  it('finds one with no version at all', () => {
    expect(positionOf(REQUIREMENTS, 'pypi', 'httpx')?.line).toBe(3);
  });

  it('does not match a name inside an include directive', () => {
    expect(positionOf(REQUIREMENTS, 'pypi', 'base')).toBeNull();
  });
});
