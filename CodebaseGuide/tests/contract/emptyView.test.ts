// `expanded: []` IS A VALUE. It is not the absence of a view.
//
// The first release could not save a collapsed map. `Collapse all → Export → Import`
// came back expanded, because `stateFromLoaded` inferred "this document has no view"
// from `expanded.size === 0` — and an extractor document with no view and a user's
// document with an empty one are indistinguishable that way. So the app quietly
// overrode a decision the user had made and saved.
//
// Six acceptance tests were green while this was broken, because the smoke called an
// export/import hook on the SAME controller and never restored anything from bytes.

import { describe, expect, it } from 'vitest';
import { exportDoc } from '../../src/contract/export.ts';
import { importDoc, refresh } from '../../src/contract/load.ts';
import { FakeRenderer } from '../../src/adapters/fake/FakeRenderer.ts';
import { Controller } from '../../src/app/controller.ts';
import { stateFromLoaded } from '../../src/app/state.ts';
import { sampleDoc } from '../support/doc.ts';

function withView(view: unknown): string {
  return JSON.stringify({ ...(JSON.parse(sampleDoc()) as object), view });
}

describe('importDoc reports WHAT THE DOCUMENT SAID', () => {
  it('distinguishes an absent `expanded` from an explicitly empty one', () => {
    const noView = importDoc(sampleDoc());
    expect(noView.viewProvided.expanded).toBe(false);

    const emptyView = importDoc(withView({}));
    expect(emptyView.viewProvided.expanded).toBe(false); // `view` exists, `expanded` does not

    const explicitlyEmpty = importDoc(withView({ expanded: [] }));
    expect(explicitlyEmpty.viewProvided.expanded).toBe(true);
    expect(explicitlyEmpty.view.expanded.size).toBe(0);
  });
});

describe('stateFromLoaded honours an explicitly collapsed map', () => {
  it('computes the initial view ONLY when the document provided no expansion', () => {
    const fresh = stateFromLoaded(importDoc(sampleDoc()));
    expect([...fresh.view.expanded]).toEqual(['repo']); // an extractor document: opens readably
  });

  it('does NOT re-open a map the user deliberately collapsed', () => {
    const collapsed = stateFromLoaded(importDoc(withView({ expanded: [] })));
    expect([...collapsed.view.expanded]).toEqual([]);
  });

  it('keeps a non-empty expansion exactly as saved', () => {
    const state = stateFromLoaded(importDoc(withView({ expanded: ['pkg-a'] })));
    expect([...state.view.expanded]).toEqual(['pkg-a']);
  });
});

describe('the full round-trip, through bytes', () => {
  it('Collapse all → export → import → still collapsed, and exports collapsed again', () => {
    const renderer = new FakeRenderer();
    const controller = new Controller(renderer, stateFromLoaded(importDoc(sampleDoc())));
    controller.start();
    expect(renderer.nodeIds().length).toBeGreaterThan(1);

    controller.dispatch({ type: 'CollapseAll' });
    const exported = controller.exportText();
    expect((JSON.parse(exported) as { view: { expanded: string[] } }).view.expanded).toEqual([]);

    // A brand-new controller, from the exported BYTES — not a hook on the same one.
    const renderer2 = new FakeRenderer();
    const controller2 = new Controller(renderer2, stateFromLoaded(importDoc(exported)));
    controller2.start();

    expect([...controller2.state.view.expanded]).toEqual([]);
    expect(renderer2.nodeIds()).toEqual(['repo']); // the root, and nothing inside it

    // …and exporting it again does not quietly re-open it either.
    const again = JSON.parse(controller2.exportText()) as { view: { expanded: string[] } };
    expect(again.view.expanded).toEqual([]);
  });

  it('an empty expansion survives export → import as bytes, without the app in the way', () => {
    const loaded = importDoc(withView({ expanded: [], positions: {}, viewport: { x: 1, y: 2, zoom: 3 } }));
    const text = exportDoc({ raw: loaded.raw, view: loaded.view });
    const again = importDoc(text);
    expect(again.viewProvided.expanded).toBe(true);
    expect(again.view.expanded.size).toBe(0);
    expect(again.view.viewport).toEqual({ x: 1, y: 2, zoom: 3 });
  });
});

describe('refresh carries an empty expansion across, authoritatively', () => {
  it('re-extracting does not re-open a collapsed map', () => {
    const first = importDoc(withView({ expanded: [] }));
    const { loaded } = refresh(sampleDoc(), { model: first.model, view: first.view });

    expect(loaded.viewProvided.expanded).toBe(true);
    expect(loaded.view.expanded.size).toBe(0);
    // …and the state built from it stays collapsed.
    expect([...stateFromLoaded(loaded).view.expanded]).toEqual([]);
  });
});
