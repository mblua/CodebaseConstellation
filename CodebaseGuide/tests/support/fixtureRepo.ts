// CodebaseGuide's tests must pass on a clean checkout of CodebaseConstellation,
// where AgentsCommander — a DIFFERENT repository — is simply absent (§10.7).
//
// So the extractor's tests run against a small fixture repo, which is materialised
// into a temp directory and `git init`ed at test time. That exercises the real
// `git ls-files -z` path rather than stubbing it, and it commits no nested `.git`.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_SOURCE = fileURLToPath(
  new URL('../../tools/extractor/fixtures/fixture-repo', import.meta.url),
);

export interface FixtureRepo {
  root: string;
  cleanup(): void;
}

export function makeFixtureRepo(): FixtureRepo {
  const root = mkdtempSync(join(tmpdir(), 'codebaseguide-fixture-'));
  cpSync(FIXTURE_SOURCE, root, { recursive: true });

  const git = (args: string[]): void => {
    execFileSync('git', args, { cwd: root, stdio: 'pipe', windowsHide: true });
  };
  git(['init', '--quiet']);
  git(['config', 'user.email', 'fixture@example.com']);
  git(['config', 'user.name', 'Fixture']);
  git(['config', 'commit.gpgsign', 'false']);
  git(['add', '-A']);
  git(['commit', '--quiet', '-m', 'fixture']);

  return {
    root,
    cleanup(): void {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
