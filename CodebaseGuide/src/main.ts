// THE COMPOSITION ROOT — the only module that imports a concrete adapter and a UI
// root, and wires them together (§2). Changing the renderer changes this file plus
// the new adapter's files. Nothing in contract/, domain/ or projection/ moves, and
// the architecture test enforces that rather than trusting it.

import './styles.css';
// The committed dataset is imported as TEXT and parsed through the same validator
// an imported file goes through — so the app makes no network call of any kind
// (§11), and the real document is exercised by the real code path.
import datasetText from '../data/agentscommander.json?raw';

import { GuideError } from './contract/errors.ts';
import { importDoc } from './contract/load.ts';
import { stateFromLoaded } from './app/state.ts';
import { Controller } from './app/controller.ts';
import { Canvas2DRenderer } from './adapters/canvas2d/Canvas2DRenderer.ts';
import { canvasHostOf, mountUi } from './ui/app.ts';

function boot(): void {
  const root = document.getElementById('root');
  if (root === null) throw new Error('#root is missing from index.html');

  try {
    const loaded = importDoc(datasetText);
    const renderer = new Canvas2DRenderer();
    const controller = new Controller(renderer, stateFromLoaded(loaded));

    mountUi(root, controller);
    renderer.mount(canvasHostOf(root));
    controller.start();
    controller.fit();
  } catch (err) {
    const message =
      err instanceof GuideError ? err.message : err instanceof Error ? err.message : String(err);
    const pre = document.createElement('pre');
    pre.className = 'boot-error';
    pre.textContent = `CodebaseGuide could not open its dataset.\n\n${message}`;
    root.appendChild(pre);
    throw err;
  }
}

boot();
