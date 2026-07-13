// The UI shell. `ui/` imports `app/` and `ports/` (and the inner, pure layers);
// `app/` never imports `ui/`.
//
// A canvas must not be the only way in (§9.4). Everything the map can do is also
// reachable from a keyboard-navigable node list, the toolbar has real buttons with
// real shortcuts, selection — node, aggregated edge, AND internal bucket — is
// announced via aria-live, and the detail panel is ordinary focusable DOM.
//
// The two side panels are DRAWERS. At a wide viewport they are docked and open, as
// before. Below a breakpoint they float over the canvas and start closed, because a
// 290px explorer and a 380px detail panel in a 800px window left the map 130px of
// width — a strip of pixels in which nothing can be read, selected, or believed.

import { VisualSpecsError } from '../contract/errors.ts';
import { ancestryOf } from '../contract/model.ts';
import type { Controller, Derived } from '../app/controller.ts';
import type { ProjectController, ProjectControllerState } from '../app/projectController.ts';
import type { AppState } from '../app/state.ts';
import { edgeStyle, nodeStyle } from '../app/registry.ts';
import { DEFAULT_LIMITS } from '../contract/limits.ts';
import type { StoredDocRef } from '../ports/projectStore.ts';
import type { InternalBucketId } from '../projection/types.ts';
import { clear, button, el } from './dom.ts';
import { renderDetail } from './detail.ts';

export interface AppUi {
  destroy(): void;
}

/** Below this the panels stop stealing width from the map and float over it. */
const DOCKED_MIN_WIDTH = 1200;
const ZOOM_STEP = 1.25;

/**
 * The read-only browser test hooks exist in dev and test builds ONLY.
 *
 * Declared at module scope so that Vite replaces `import.meta.env.DEV` with `false` in
 * a production build, the constant folds to `false`, and BOTH branches that mention the
 * global are eliminated — the assignment and the cleanup. The first cut gated only the
 * assignment, so `delete globalThis.__visualSpecs` survived into `dist` and the
 * bundle still carried the literal.
 */
const IS_TEST_BUILD = import.meta.env.DEV || import.meta.env.MODE === 'test';
const TEST_HOOK = '__visualSpecs';

export function mountUi(root: HTMLElement, controller: Controller, projectController: ProjectController): AppUi {
  clear(root);

  const canvasHost = el('div', { class: 'canvas-host', id: 'canvas-host' }, []);
  const detailHost = el('div', { class: 'detail-body' }, []);
  const listHost = el('div', { class: 'node-list', role: 'listbox', 'aria-label': 'All nodes' }, []);
  const legendHost = el('div', { class: 'legend' }, []);
  const bannerHost = el('div', { class: 'banners' }, []);
  const projectHost = el('div', { class: 'project-strip' }, []);
  const statusHost = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' }, []);
  const countsHost = el('div', { class: 'counts' }, []);

  const shell = el('div', { class: 'shell' }, []);

  // --- drawers -------------------------------------------------------------

  let sidebarOpen = docked();
  let detailOpen = docked();

  function docked(): boolean {
    return globalThis.innerWidth >= DOCKED_MIN_WIDTH;
  }

  /**
   * When the drawers FLOAT, only one may be open.
   *
   * Docked, they take their own columns and both fit. Floating, they lie ON TOP of the
   * map: a 320px explorer on the left and a 400px detail panel on the right leave an
   * 800px window **80 pixels** of map you can actually see or click. Measuring the
   * canvas said 800×560 and told us nothing, because the canvas was underneath them.
   *
   * So below the breakpoint, opening one closes the other. It is not a preference; two
   * overlays over a small map is simply not a state worth being able to reach.
   */
  function setPanel(which: 'sidebar' | 'detail', open: boolean): void {
    const exclusive = !docked() && open;
    if (which === 'sidebar') {
      sidebarOpen = open;
      if (exclusive) detailOpen = false;
    } else {
      detailOpen = open;
      if (exclusive) sidebarOpen = false;
    }
    applyLayout();
  }

  function applyLayout(): void {
    const isDocked = docked();
    // Belt and braces: whatever route got us here, never two overlays at once.
    if (!isDocked && sidebarOpen && detailOpen) detailOpen = false;

    shell.classList.toggle('docked', isDocked);
    shell.classList.toggle('floating', !isDocked);
    shell.classList.toggle('sidebar-open', sidebarOpen);
    shell.classList.toggle('detail-open', detailOpen);
    sidebarToggle.setAttribute('aria-expanded', sidebarOpen ? 'true' : 'false');
    detailToggle.setAttribute('aria-expanded', detailOpen ? 'true' : 'false');
    sidebar.hidden = !sidebarOpen;
    detailPanel.hidden = !detailOpen;
    // The canvas host just changed size; the adapter observes it, but say so anyway.
    controller.resize();
  }

  const sidebarToggle = button('Explorer', () => setPanel('sidebar', !sidebarOpen), {
    title: 'Show or hide the explorer ([)',
    'aria-expanded': 'true',
    id: 'toggle-sidebar',
  });
  const detailToggle = button('Details', () => setPanel('detail', !detailOpen), {
    title: 'Show or hide the detail panel (])',
    'aria-expanded': 'true',
    id: 'toggle-detail',
  });

  // --- controls ------------------------------------------------------------

  const search = el('input', {
    type: 'search',
    id: 'search',
    class: 'search',
    placeholder: 'Search nodes by name or path…',
    'aria-label': 'Search nodes by name or path',
    autocomplete: 'off',
  });
  search.addEventListener('input', () => {
    controller.dispatch({ type: 'SetSearch', query: search.value });
  });

  const fileInput = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'hidden-input',
    id: 'import-input',
    'aria-label': 'Open a Visual Specs document temporarily',
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file === undefined) return;

    // Refuse an oversized file BEFORE reading it into memory. `file.size` is already in
    // BYTES, and the whole point of a denial-of-service cap is not to allocate the thing
    // you are about to refuse. The contract enforces the same cap for programmatic
    // callers; this is the preflight.
    if (file.size > DEFAULT_LIMITS.maxBytes) {
      reportLoadError(
        new Error(
          `${file.name} is ${file.size} bytes, over the ${DEFAULT_LIMITS.maxBytes} byte cap.`,
        ),
      );
      fileInput.value = '';
      return;
    }

    void file.text().then(
      (text) => {
        try {
          projectController.openTemporaryText(file.name, text);
          setStatus(`Imported ${file.name}.`);
        } catch (err) {
          reportLoadError(err);
        }
      },
      (err: unknown) => reportLoadError(err),
    );
    fileInput.value = '';
  });

  const projectName = el('input', {
    type: 'text',
    class: 'project-name',
    maxlength: '120',
    'aria-label': 'Project name',
    placeholder: 'Visual Specs',
  });
  let currentProjectState = projectController.snapshot();
  let renderedProjectKey: string | null | undefined;
  let renderedProjectName = '';
  let importRefs: readonly StoredDocRef[] = [];
  let exportRefs: readonly StoredDocRef[] = [];
  const importSelect = el('select', { class: 'project-imports', 'aria-label': 'Project imports' });
  const exportSelect = el('select', { class: 'project-exports', 'aria-label': 'Project export copies' });
  const createProject = button('Create Project', () => {
    if (!confirmDestructive('create a different project')) return;
    // The action is invoked directly in the click task. FsaProjectStore opens the
    // directory picker before ProjectController performs semantic hashing.
    void runProjectAction(() => projectController.createProject(projectName.value || 'Visual Specs'));
  });
  const openProject = button('Open Project', () => {
    if (!confirmDestructive('open another project')) return;
    void runProjectAction(() => projectController.openProject());
  });
  const enableEditing = button('Enable editing', () => {
    void runProjectAction(() => projectController.enableEditing());
  });
  const repairProject = button('Repair project', () => {
    void runProjectAction(() => projectController.repairProject());
  });
  const renameProject = button('Rename', () => {
    void runProjectAction(() => projectController.renameProject(projectName.value));
  });
  const saveProject = button('Save', () => {
    void runProjectAction(() => projectController.saveCurrent());
  });
  const addJson = button('Add JSON', () => {
    void runProjectAction(() => projectController.addJsonToProject());
  });
  const refreshImports = button('Refresh imports', () => {
    void runProjectAction(() => projectController.refreshImports());
  });
  const importJson = button('Import JSON', () => {
    const ref = importRefs[importSelect.selectedIndex];
    if (ref !== undefined) void runProjectAction(() => projectController.importStoredDoc(ref));
  });
  const refreshExports = button('Refresh exports', () => {
    void runProjectAction(() => projectController.refreshExports());
  });
  const openExport = button('Open export copy', () => {
    const ref = exportRefs[exportSelect.selectedIndex];
    if (ref !== undefined) void runProjectAction(() => projectController.previewStoredExport(ref));
  });
  const restoreExport = button('Restore from export', () => {
    const ref = exportRefs[exportSelect.selectedIndex];
    if (ref === undefined) return;
    if (!globalThis.confirm(`Restore ${ref.fileName} as current? The current file will be backed up first.`)) return;
    void runProjectAction(() => projectController.restoreStoredExport(ref));
  });
  const returnToProject = button('Return to project', () => projectController.returnToProject());
  const openTemporary = button('Open JSON temporarily', () => {
    if (!confirmDestructive('open a temporary JSON document')) return;
    fileInput.click();
  });
  const restoreAutosave = button('Restore view', () => projectController.restoreAutosaveView());
  const keepAutosave = button('Keep current', () => projectController.keepCurrentView());
  const exportAutosave = button('Export autosave copy', () => {
    void runProjectAction(() => projectController.exportAutosaveCopy());
  });
  const projectMessage = el('span', { class: 'project-message' }, []);
  const autosaveActions = el('span', { class: 'autosave-actions' }, [
    restoreAutosave,
    keepAutosave,
    exportAutosave,
  ]);

  function confirmDestructive(action: string): boolean {
    if (!currentProjectState.dirty) return true;
    return globalThis.confirm(`Unsaved layout or view changes will be lost if you ${action}. Continue?`);
  }

  const exportJson = button('Export JSON', () => void doExport(), {
    title: 'Save this map, with your layout (S)',
    id: 'export-btn',
  });

  const toolbar = el('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Map controls' }, [
    el('div', { class: 'brand' }, [
      el('span', { class: 'brand-mark' }, ['◈']),
      el('span', { class: 'brand-name' }, ['Visual Specs']),
    ]),
    sidebarToggle,
    detailToggle,
    el('span', { class: 'divider' }, []),
    button('Fit', () => controller.fit(), { title: 'Fit the map to the window (F)' }),
    button('−', () => controller.zoomBy(1 / ZOOM_STEP), {
      title: 'Zoom out (-)',
      'aria-label': 'Zoom out',
      id: 'zoom-out',
    }),
    button('+', () => controller.zoomBy(ZOOM_STEP), {
      title: 'Zoom in (+)',
      'aria-label': 'Zoom in',
      id: 'zoom-in',
    }),
    el('span', { class: 'divider' }, []),
    button('Expand all', () => controller.dispatch({ type: 'ExpandAll' }), { title: 'Expand every container (E)' }),
    button('Collapse all', () => controller.dispatch({ type: 'CollapseAll' }), { title: 'Collapse everything (C)' }),
    button('Reset layout', () => controller.dispatch({ type: 'ResetLayout' }), {
      title: 'Throw away the positions you dragged and re-pack (R)',
    }),
    el('span', { class: 'spacer' }, []),
    openTemporary,
    exportJson,
    fileInput,
  ]);

  const sidebar = el('aside', { class: 'panel sidebar', 'aria-label': 'Navigator' }, [
    el('div', { class: 'field' }, [search]),
    countsHost,
    listHost,
    el('h3', { class: 'legend-title' }, ['Legend']),
    legendHost,
  ]);

  const detailPanel = el('aside', { class: 'panel detail-panel', 'aria-label': 'Details' }, [
    detailHost,
  ]);

  shell.appendChild(toolbar);
  shell.appendChild(projectHost);
  shell.appendChild(bannerHost);
  shell.appendChild(el('div', { class: 'body' }, [sidebar, canvasHost, detailPanel]));
  shell.appendChild(statusHost);
  root.appendChild(shell);

  // --- behaviour -----------------------------------------------------------

  /** So that "Selection cleared." is announced on a real clear, and never on a load
   *  where there was nothing selected in the first place. */
  let hadSelection = false;

  function setStatus(message: string): void {
    clear(statusHost);
    statusHost.appendChild(el('span', {}, [message]));
  }

  function reportLoadError(err: unknown): void {
    const message =
      err instanceof VisualSpecsError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'The document could not be read.';
    clear(bannerHost);
    bannerHost.appendChild(
      el('div', { class: 'banner error', role: 'alert' }, [
        el('strong', {}, ['This document was refused. ']),
        el('span', {}, [message]),
      ]),
    );
    setStatus('Import failed.');
  }

  async function runProjectAction(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (err) {
      if (isPickerCancellation(err)) {
        setStatus('Cancelled. No project or document state changed.');
        return;
      }
      reportLoadError(err);
    }
  }

  async function doExport(): Promise<void> {
    try {
      await projectController.exportJson();
      setStatus('Exported. Your layout, expansion and viewport are in the file.');
    } catch (err) {
      reportLoadError(err);
    }
  }

  // Read-only hooks for the browser tests: they let a test know WHERE a line is
  // drawn, which only the domain knows (§7). They never bypass the loop, and the
  // acceptance smoke drives import/export through the real controls.
  //
  // They exist ONLY in dev and test builds. A production bundle ships no such object —
  // and, since `IS_TEST_BUILD` folds to `false`, not even the name of one.
  if (IS_TEST_BUILD) {
    (globalThis as unknown as Record<string, unknown>)[TEST_HOOK] = {
      scene: () => controller.derived.scene.scene,
      viewport: () => controller.state.view.viewport,
    };
  }

  const onKey = (e: KeyboardEvent): void => {
    const target = e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case 'f':
      case 'F':
        controller.fit();
        break;
      case 'e':
      case 'E':
        controller.dispatch({ type: 'ExpandAll' });
        break;
      case 'c':
      case 'C':
        controller.dispatch({ type: 'CollapseAll' });
        break;
      case 'r':
      case 'R':
        controller.dispatch({ type: 'ResetLayout' });
        break;
      case 's':
      case 'S':
        if (currentProjectState.canExport) void doExport();
        break;
      case '+':
      case '=':
        controller.zoomBy(ZOOM_STEP);
        break;
      case '-':
      case '_':
        controller.zoomBy(1 / ZOOM_STEP);
        break;
      case '[':
        setPanel('sidebar', !sidebarOpen);
        break;
      case ']':
        setPanel('detail', !detailOpen);
        break;
      case 'Escape':
        // Close whichever drawer is lying over the map. Docked panels stay put: they
        // are not in the way, and dismissing them would be a surprise.
        if (!docked()) {
          if (sidebarOpen) setPanel('sidebar', false);
          else if (detailOpen) setPanel('detail', false);
        }
        break;
      case '/':
        e.preventDefault();
        if (!sidebarOpen) setPanel('sidebar', true);
        search.focus();
        break;
      default:
        break;
    }
  };
  document.addEventListener('keydown', onKey);

  let wasDocked = docked();
  const onResize = (): void => {
    const isDocked = docked();
    if (isDocked !== wasDocked) {
      // Crossing the breakpoint re-establishes the default for that size, rather than
      // stranding the user with two drawers open over a small map.
      wasDocked = isDocked;
      sidebarOpen = isDocked;
      detailOpen = isDocked;
    }
    applyLayout();
  };
  globalThis.addEventListener('resize', onResize);

  const cb = {
    onSelectNode: (id: string): void => {
      controller.dispatch({ type: 'Select', nodeIds: [id], edgeId: null });
    },
    onExpandTo: (id: string): void => {
      controller.dispatch({ type: 'ExpandTo', id });
    },
    onSelectBucket: (id: InternalBucketId): void => {
      controller.dispatch({ type: 'Select', nodeIds: [], edgeId: id });
    },
  };

  const unsubscribe = controller.subscribe((state, derived) => {
    renderBanners(state, derived);
    renderCounts(state, derived);
    renderList(state, derived);
    renderLegend(state);
    renderDetail(detailHost, state, derived, cb);
    announce(state, derived);
  });
  const unsubscribeProject = projectController.subscribe(renderProjectState);

  applyLayout();

  function renderBanners(state: AppState, derived: Derived): void {
    clear(bannerHost);

    // The document names a commit but was extracted from a DIRTY working tree, so every
    // `path:line` in it describes the files on disk rather than the files at that commit.
    // A map that cannot back its own provenance has to say so, out loud, at the top.
    if (state.model.source?.dirty === true) {
      const commit = state.model.source.commit?.slice(0, 7) ?? 'the commit';
      bannerHost.appendChild(
        el('div', { class: 'banner warn dirty' }, [
          el('strong', {}, ['Extracted from a dirty working tree. ']),
          el('span', {}, [
            `Tracked files differ from ${commit}, so the evidence points at the files on disk, ` +
              `not at that commit.`,
          ]),
        ]),
      );
    }

    // A quiet map is not a trustworthy map (§9.3).
    const degraded = state.model.coverage.filter((c) => c.status !== 'available');
    if (degraded.length > 0) {
      bannerHost.appendChild(
        el('div', { class: 'banner warn coverage' }, [
          el('strong', {}, ['Coverage: ']),
          ...degraded.flatMap((c) => [
            el('span', { class: 'cov' }, [
              el('code', {}, [c.kind]),
              el('span', { class: `cov-status ${c.status}` }, [c.status]),
              el('span', { class: 'muted' }, [c.reason ?? '']),
            ]),
          ]),
        ]),
      );
    }

    const unresolved = state.model.unresolved.length;
    if (unresolved > 0) {
      bannerHost.appendChild(
        el('div', { class: 'banner info' }, [
          el('strong', {}, [`${unresolved} unresolved `]),
          el('span', {}, [
            'relation(s) were seen but not guessed at. They are listed in the document, with evidence.',
          ]),
        ]),
      );
    }

    if (state.readOnly) {
      bannerHost.appendChild(
        el('div', { class: 'banner warn' }, [
          el('strong', {}, ['Read-only. ']),
          el('span', {}, [
            'This document declares a requirement this build does not implement, so it will not be written back.',
          ]),
        ]),
      );
    }

    for (const w of state.warnings) {
      if (
        w.code === 'unknown-minor' ||
        w.code === 'snippet-present' ||
        w.code === 'absolute-path-in-free-form-field'
      ) {
        bannerHost.appendChild(el('div', { class: 'banner info' }, [el('span', {}, [w.message])]));
      }
    }

    if (state.loss !== null) {
      const l = state.loss;
      bannerHost.appendChild(
        el('div', { class: 'banner info' }, [
          el('strong', {}, ['Refreshed. ']),
          el('span', {}, [
            `${l.newNodes.length} new node(s); dropped ${l.droppedPositions.length} position(s) and ` +
              `${l.droppedExpanded.length} expanded id(s) that no longer exist; ${l.reparented.length} reparented.`,
          ]),
        ]),
      );
    }

    const hidden = derived.scene.hiddenByFilter;
    if (hidden.nodes > 0 || hidden.edges > 0) {
      bannerHost.appendChild(
        el('div', { class: 'banner info' }, [
          el('span', {}, [
            `A filter is hiding ${hidden.nodes} node(s) and ${hidden.edges} relation(s). Projection is unchanged — a filter is a mask, not a re-projection.`,
          ]),
        ]),
      );
    }
  }

  function renderCounts(state: AppState, derived: Derived): void {
    clear(countsHost);
    const internal = derived.graph.internalBuckets.reduce((n, b) => n + b.count, 0);
    countsHost.appendChild(
      el('dl', { class: 'counts-grid' }, [
        el('dt', {}, ['Nodes']),
        el('dd', {}, [String(state.model.nodes.length)]),
        el('dt', {}, ['Relations']),
        el('dd', {}, [String(state.model.edges.length)]),
        el('dt', {}, ['Drawn']),
        el('dd', {}, [String(derived.graph.visibleEdges.length)]),
        el('dt', {}, ['Folded away']),
        el(
          'dd',
          {
            title:
              'Relations with both endpoints inside one collapsed box. Select the box to see them.',
          },
          [String(internal)],
        ),
      ]),
    );
  }

  function renderList(state: AppState, derived: Derived): void {
    clear(listHost);
    const query = state.search.query.trim();
    const nodes =
      query === ''
        ? state.model.nodes.filter((n) => n.kind !== 'file' && n.kind !== 'directory')
        : state.model.nodes.filter((n) => state.search.matches.has(n.id));

    if (nodes.length === 0) {
      listHost.appendChild(el('p', { class: 'muted pad' }, ['No node matches.']));
      return;
    }

    const shown = nodes.slice(0, 400);
    for (const node of shown) {
      const style = nodeStyle(node.kind);
      const selected = state.selection.nodeIds.includes(node.id);
      const visible = derived.graph.visibleNodes.includes(node.id);
      const row = el(
        'button',
        {
          type: 'button',
          class: `node-row${selected ? ' selected' : ''}`,
          role: 'option',
          'aria-selected': selected ? 'true' : 'false',
          title: node.path ?? node.id,
        },
        [
          el('span', { class: `swatch shape-${style.shape}`, style: `--swatch:${style.stroke}` }, []),
          el('span', { class: 'node-label' }, [node.label]),
          el('span', { class: 'node-kind' }, [node.kind]),
          visible ? null : el('span', { class: 'node-hidden', title: 'Hidden inside a collapsed box' }, ['⊂']),
        ],
      );
      row.addEventListener('click', () => {
        // Reveal a hit that is hidden inside collapsed ancestors, then select it.
        controller.dispatch({ type: 'ExpandTo', id: node.id });
        controller.dispatch({ type: 'Select', nodeIds: [node.id], edgeId: null });
        controller.fit([node.id]);
      });
      row.addEventListener('dblclick', () => {
        controller.dispatch({ type: 'ToggleExpand', id: node.id });
      });
      listHost.appendChild(row);
    }
    if (nodes.length > shown.length) {
      listHost.appendChild(
        el('p', { class: 'muted pad' }, [`… and ${nodes.length - shown.length} more. Narrow the search.`]),
      );
    }
  }

  function renderLegend(state: AppState): void {
    clear(legendHost);

    const nodeKinds = [...new Set(state.model.nodes.map((n) => n.kind))].sort();
    const edgeKinds = [...new Set(state.model.edges.map((e) => e.kind))].sort();

    for (const kind of nodeKinds) {
      const style = nodeStyle(kind);
      const on = state.filters.nodeKinds.has(kind);
      legendHost.appendChild(
        toggleRow(kind, style.stroke, style.title, on, `shape-${style.shape}`, () => {
          const next = new Set(state.filters.nodeKinds);
          if (on) next.delete(kind);
          else next.add(kind);
          controller.dispatch({ type: 'SetFilter', nodeKinds: next });
        }),
      );
    }
    for (const kind of edgeKinds) {
      const style = edgeStyle(kind);
      const on = state.filters.edgeKinds.has(kind);
      legendHost.appendChild(
        toggleRow(kind, style.color, style.title, on, 'edge', () => {
          const next = new Set(state.filters.edgeKinds);
          if (on) next.delete(kind);
          else next.add(kind);
          controller.dispatch({ type: 'SetFilter', edgeKinds: next });
        }),
      );
    }

    const testsOn = state.filters.hideTests;
    legendHost.appendChild(
      toggleRow('hide tests', '#94a3b8', 'Mask files the extractor marked as tests', testsOn, 'edge', () => {
        controller.dispatch({ type: 'SetFilter', hideTests: !testsOn });
      }),
    );
  }

  function toggleRow(
    label: string,
    color: string,
    title: string,
    on: boolean,
    shapeClass: string,
    onToggle: () => void,
  ): HTMLElement {
    const b = el(
      'button',
      {
        type: 'button',
        class: `legend-row${on ? '' : ' off'}`,
        title,
        'aria-pressed': on ? 'true' : 'false',
      },
      [
        el('span', { class: `swatch ${shapeClass}`, style: `--swatch:${color}` }, []),
        el('span', {}, [label]),
      ],
    );
    b.addEventListener('click', onToggle);
    return b;
  }

  /**
   * Announce what is selected — a node, an AGGREGATED EDGE, or an INTERNAL BUCKET.
   *
   * The first cut returned early when there was no selected node, so clicking the one
   * line that carries 133 command relations announced nothing at all. The thing this
   * product exists to tell you was the thing it would not say out loud.
   *
   * Clearing the selection is also an event. Returning early left the *previous*
   * selection announced, so a screen reader would still be describing a thing that is
   * no longer selected. `hadSelection` is what keeps that from firing on a fresh load,
   * where nothing was ever selected and there is nothing to clear.
   */
  function announce(state: AppState, derived: Derived): void {
    const edgeId = state.selection.edgeId;
    const hasSelection = edgeId !== null || state.selection.nodeIds.length > 0;
    if (!hasSelection) {
      if (hadSelection) setStatus('Selection cleared.');
      hadSelection = false;
      return;
    }
    hadSelection = true;

    if (edgeId !== null) {
      const visible = derived.graph.visibleEdgeById.get(edgeId as never);
      if (visible !== undefined) {
        const source = state.model.nodeById.get(state.outline.entityOf(visible.sourceId));
        const target = state.model.nodeById.get(state.outline.entityOf(visible.targetId));
        setStatus(
          `Selected relation ${visible.kind}, ${source?.label ?? visible.sourceId} to ${target?.label ?? visible.targetId}. ` +
            `${visible.count} logical relation${visible.count === 1 ? '' : 's'} behind it, listed with evidence in the detail panel.`,
        );
        return;
      }
      const bucket = derived.graph.internalBucketById.get(edgeId as never);
      if (bucket !== undefined) {
        const container = state.model.nodeById.get(state.outline.entityOf(bucket.containerId));
        setStatus(
          `Selected ${bucket.count} ${bucket.kind} relation${bucket.count === 1 ? '' : 's'} folded inside ${container?.label ?? bucket.containerId}.`,
        );
        return;
      }
    }

    const id = state.selection.nodeIds[0];
    if (id === undefined) return;
    const node = state.model.nodeById.get(state.outline.entityOf(id));
    if (node === undefined) return;
    const buckets = derived.graph.internalBucketsByNode.get(id) ?? [];
    const folded = buckets.reduce((n, b) => n + b.count, 0);
    const where = ancestryOf(state.model, node.id)
      .map((a) => state.model.nodeById.get(a)?.label ?? a)
      .join(' / ');
    setStatus(
      `Selected ${node.kind} ${node.label} — ${where}.` +
        (folded > 0 ? ` ${folded} relation${folded === 1 ? '' : 's'} folded inside it.` : ''),
    );
  }

  function renderProjectState(project: ProjectControllerState): void {
    currentProjectState = project;
    if (project.projectKey !== renderedProjectKey || (project.projectKey !== null && project.name !== renderedProjectName)) {
      projectName.value = project.name;
    }
    renderedProjectKey = project.projectKey;
    renderedProjectName = project.name;
    createProject.disabled = !project.canCreateProject;
    openProject.disabled = !project.canOpenProject;
    enableEditing.disabled = !project.canEnableEditing;
    repairProject.disabled = !project.canRepairProject;
    repairProject.hidden = !project.needsRepair;
    renameProject.disabled = !project.canWriteProject;
    saveProject.disabled = !project.canWriteProject;
    addJson.disabled = !project.canAddImport;
    refreshImports.disabled = !project.canBrowseProject;
    importJson.disabled = !project.canImport || project.imports.length === 0;
    importSelect.disabled = !project.canBrowseProject || project.imports.length === 0;
    refreshExports.disabled = !project.canBrowseProject;
    openExport.disabled = !project.canBrowseProject || project.exports.length === 0;
    restoreExport.disabled = !project.canRestoreExport || project.exports.length === 0;
    exportSelect.disabled = !project.canBrowseProject || project.exports.length === 0;
    returnToProject.hidden = !project.canReturnToProject;
    returnToProject.disabled = !project.canReturnToProject;
    exportJson.disabled = !project.canExport;
    exportAutosave.disabled = project.readOnly;
    exportAutosave.hidden = project.readOnly;
    autosaveActions.hidden = !project.pendingAutosave;

    if (importRefs !== project.imports) {
      importRefs = project.imports;
      clear(importSelect);
      if (project.imports.length === 0) {
        importSelect.appendChild(el('option', { value: '' }, ['No imports']));
      } else {
        for (const ref of project.imports) {
          importSelect.appendChild(el('option', { value: ref.id }, [ref.displayName]));
        }
      }
    }

    if (exportRefs !== project.exports) {
      exportRefs = project.exports;
      clear(exportSelect);
      if (project.exports.length === 0) {
        exportSelect.appendChild(el('option', { value: '' }, ['No export copies']));
      } else {
        for (const ref of project.exports) {
          exportSelect.appendChild(el('option', { value: ref.id }, [ref.displayName]));
        }
      }
    }

    clear(projectMessage);
    projectMessage.appendChild(
      el('span', {}, [`${project.persistenceLabel} ${project.message}`]),
    );

    clear(projectHost);
    projectHost.appendChild(
      el('div', { class: 'project-controls' }, [
        projectName,
        createProject,
        openProject,
        enableEditing,
        repairProject,
        renameProject,
        saveProject,
        addJson,
        refreshImports,
        importSelect,
        importJson,
        refreshExports,
        exportSelect,
        openExport,
        restoreExport,
        returnToProject,
        autosaveActions,
        projectMessage,
      ]),
    );
  }

  return {
    destroy(): void {
      unsubscribe();
      unsubscribeProject();
      document.removeEventListener('keydown', onKey);
      globalThis.removeEventListener('resize', onResize);
      if (IS_TEST_BUILD) {
        delete (globalThis as unknown as Record<string, unknown>)[TEST_HOOK];
      }
      clear(root);
    },
  };
}

export function canvasHostOf(root: HTMLElement): HTMLElement {
  const host = root.querySelector('.canvas-host');
  if (host === null) throw new Error('the canvas host was not mounted');
  return host as HTMLElement;
}

function isPickerCancellation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    String(err.name) === 'AbortError'
  );
}
