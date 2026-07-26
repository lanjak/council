import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Guards against exactly what shipped broken in the 0.4.1 release: the
// version lives in several files that have to be bumped together
// (package.json, package-lock.json, the two Claude plugin manifests, and
// previously a hardcoded literal in src/cli.ts) with nothing checking they
// agree. This test is that check - it runs in CI on every push/PR, so a
// release that forgets to bump one of them fails before merge, not after
// it's already public on npm/GitHub.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel: string) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

describe('version consistency across release-relevant files', () => {
  const pkg = readJson('package.json');
  const version = pkg.version as string;

  it('is a non-empty semver-shaped string (sanity check on the check itself)', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('package-lock.json matches package.json at both the root and the root package entry', () => {
    const lock = readJson('package-lock.json');
    expect(lock.version).toBe(version);
    expect(lock.packages?.[''].version).toBe(version);
  });

  it('the Claude Code plugin manifest matches package.json', () => {
    const plugin = readJson('plugin/.claude-plugin/plugin.json');
    expect(plugin.version).toBe(version);
  });

  it('the marketplace manifest matches package.json at both version fields', () => {
    const marketplace = readJson('.claude-plugin/marketplace.json');
    expect(marketplace.metadata?.version).toBe(version);
    expect(marketplace.plugins?.[0]?.version).toBe(version);
  });

  it("the CLI's --version reads from package.json, not a hardcoded literal", () => {
    const cliSource = readFileSync(join(root, 'src/cli.ts'), 'utf8');
    // Regression guard for the actual bug: .version('0.4.0') as a string
    // literal is exactly the pattern that silently went stale. If this
    // fails, someone reintroduced a hardcoded version string in cli.ts.
    expect(cliSource).not.toMatch(/\.version\(\s*['"]\d+\.\d+\.\d+['"]\s*\)/);
    expect(cliSource).toMatch(/\.version\(\s*pkg\.version\s*\)/);
  });
});
