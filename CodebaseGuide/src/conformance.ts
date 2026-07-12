// The adapter conformance page. This is how the SHARED suite (§8.3) is run against
// the real adapter, in a real browser, with real pointer events — which is the only
// place hit-testing and event ordering can actually be proven.
//
// `npm run smoke:adapter` opens this page and fails on any failing case. It needs
// no dataset and no UI, so it is the EARLY gate: it runs long before the extractor
// or the detail panel exist. The acceptance smoke (`npm run smoke`) is the late one.

import type { GraphRenderer } from './ports/renderer.ts';
import { runConformance, type InputDriver } from './ports/renderer.conformance.ts';
import { Canvas2DRenderer } from './adapters/canvas2d/Canvas2DRenderer.ts';

const HOST_SIZE = { w: 900, h: 600 };

function makeHost(): HTMLElement {
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '0px';
  host.style.top = '0px';
  host.style.width = `${HOST_SIZE.w}px`;
  host.style.height = `${HOST_SIZE.h}px`;
  document.body.appendChild(host);
  return host;
}

function makeInput(host: HTMLElement, _renderer: GraphRenderer): InputDriver {
  const canvas = host.querySelector('canvas');
  if (canvas === null) throw new Error('the adapter did not create a canvas');

  const send = (type: string, x: number, y: number, heldButton: 0 | 2 = 0): void => {
    canvas.dispatchEvent(
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: type === 'pointermove' ? -1 : heldButton,
        buttons: type === 'pointerup' ? 0 : heldButton === 2 ? 2 : 1,
      }),
    );
  };

  return {
    pointerDown: (x, y) => send('pointerdown', x, y),
    pointerMove: (x, y) => send('pointermove', x, y),
    pointerUp: (x, y) => send('pointerup', x, y),
    click: (x, y) => {
      send('pointerdown', x, y);
      send('pointerup', x, y);
    },
    dblclick: (x, y) => {
      send('pointerdown', x, y);
      send('pointerup', x, y);
      send('pointerdown', x, y);
      send('pointerup', x, y);
    },
    rightDrag: (fromX, fromY, toX, toY) => {
      send('pointerdown', fromX, fromY, 2);
      send('pointermove', toX, toY, 2);
      send('pointerup', toX, toY, 2);
    },
    contextMenu: (x, y) => {
      const event = new MouseEvent('contextmenu', {
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
        button: 2,
      });
      canvas.dispatchEvent(event);
      return event.defaultPrevented;
    },
    hostOrigin: () => {
      const rect = host.getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    },
  };
}

async function main(): Promise<void> {
  const report = await runConformance({
    name: 'Canvas2DRenderer',
    makeRenderer: () => new Canvas2DRenderer(),
    makeHost,
    makeInput,
  });

  (globalThis as unknown as Record<string, unknown>)['__CONFORMANCE__'] = report;

  const out = document.createElement('pre');
  out.id = 'report';
  out.textContent = JSON.stringify(report, null, 2);
  out.style.position = 'relative';
  out.style.zIndex = '10';
  out.style.background = '#0b0e16';
  out.style.color = report.failed === 0 ? '#86e0a4' : '#f3b6b5';
  out.style.padding = '16px';
  out.style.font = '12px ui-monospace, monospace';
  document.body.appendChild(out);
}

void main();
