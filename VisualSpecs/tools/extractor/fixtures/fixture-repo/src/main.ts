// Covers: relative .ts import, a `paths` alias, an index import, a JSON import,
// an asset import that only a bundler resolves, and a literal dynamic import().
import { getConfig } from './ipc.ts';
import { greet } from '@shared/util.ts';
import { VERSION } from './shared/index.ts';
import data from './data.json';
import './styles.css';

export type { Config } from './ipc.ts';

async function lazy(): Promise<void> {
  await import('./shared/util.ts');
}

export function boot(): void {
  void getConfig();
  void greet(String(data.name));
  void VERSION;
  void lazy();
}
