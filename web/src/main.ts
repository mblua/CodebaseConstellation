import "@fontsource-variable/space-grotesk/index.css";
import "./style.css";
import seedDatabaseUrl from "../../fixtures/seed.sqlite?url";
import { GraphDatabase } from "./database";
import {
  computeRenderState,
  createInitialFilterState,
  setMembership,
  type ComputedRenderState,
  type FilterState,
} from "./filterState";
import {
  EDGE_LAYER_COLOR,
  formatKind,
  LAYER_DEFINITIONS,
  NODE_STYLE,
  type CapabilityInfo,
  type FindingInfo,
  type GraphDataset,
  type NeighborInfo,
  type NodeDetail,
  type SearchResult,
} from "./model";
import { GraphRenderer } from "./renderer/GraphRenderer";
import { hasChangeEdges, shouldHideHistoryCapability } from "./snapshotUx";
import {
  applySpaghettiPreset,
  buildDiagnosticNodeClasses,
  DIAGNOSTIC_CODE,
  diagnosticClassForFinding,
  diagnosticClassLabel,
  diagnosticClassSummary,
  findingImpact,
  findingMeasure,
  friendlyMetric,
  metricDisplayOrder,
  rankSpaghettiFindings,
} from "./spaghettiMode";

const EXPECTED_CAPABILITIES = [
  "filesystem",
  "packages",
  "syntax_graph",
  "semantic_graph",
  "issue_file_touches",
  "layout",
] as const;

function byId<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Required UI element #${id} is missing`);
  return result as T;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatMetricValue(value: number, unit: string): string {
  if (unit === "boolean") return value === 0 ? "No" : "Yes";
  const formatted = Number.isInteger(value)
    ? new Intl.NumberFormat("en").format(value)
    : new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(value);
  return unit && unit !== "ratio" ? `${formatted} ${unit}` : formatted;
}

function nodeGlyph(kind: string, className: string): HTMLSpanElement {
  const style = NODE_STYLE[kind] ?? NODE_STYLE.symbol;
  const glyph = createElement("span", `${className} glyph-${style?.glyph ?? "circle"}`);
  glyph.style.setProperty("--glyph-color", style?.color ?? "#b8a1ff");
  glyph.setAttribute("aria-hidden", "true");
  return glyph;
}

function statusBadge(status: CapabilityInfo["status"], label: string = status): HTMLSpanElement {
  return createElement("span", `status-badge status-${status}`, label);
}

class ConstellationApp {
  #database: GraphDatabase | null = null;
  #dataset: GraphDataset | null = null;
  #renderer: GraphRenderer | null = null;
  #filters: FilterState | null = null;
  #renderState: ComputedRenderState | null = null;
  #globalFindings: FindingInfo[] = [];
  #spaghettiActive = false;
  #activeFinding: FindingInfo | null = null;
  #detailRequest = 0;
  #searchRequest = 0;
  #searchTimer = 0;

  readonly #canvasHost = byId<HTMLDivElement>("canvas-host");
  readonly #loadingPanel = byId<HTMLDivElement>("loading-panel");
  readonly #loadingTitle = byId<HTMLElement>("loading-title");
  readonly #loadingDetail = byId<HTMLElement>("loading-detail");
  readonly #sourceLabel = byId<HTMLElement>("source-label");
  readonly #sourceStatus = byId<HTMLElement>("source-status-dot");
  readonly #repositoryName = byId<HTMLElement>("repository-name");
  readonly #snapshotMeta = byId<HTMLElement>("snapshot-meta");
  readonly #graphStats = byId<HTMLDivElement>("graph-stats");
  readonly #layoutLabel = byId<HTMLElement>("layout-label");
  readonly #layerControls = byId<HTMLDivElement>("layer-controls");
  readonly #spaghettiButton = byId<HTMLButtonElement>("spaghetti-mode");
  readonly #findingIsolation = byId<HTMLDivElement>("finding-isolation");
  readonly #findingIsolationCopy = byId<HTMLElement>("finding-isolation-copy");
  readonly #exitFindingIsolationButton = byId<HTMLButtonElement>("exit-finding-isolation");
  readonly #nodeKindControls = byId<HTMLDivElement>("node-kind-controls");
  readonly #edgeKindControls = byId<HTMLDivElement>("edge-kind-controls");
  readonly #nodeFilterSummary = byId<HTMLElement>("node-filter-summary");
  readonly #edgeFilterSummary = byId<HTMLElement>("edge-filter-summary");
  readonly #capabilityList = byId<HTMLDivElement>("capability-list");
  readonly #nodeLegend = byId<HTMLDivElement>("node-legend");
  readonly #detailPanel = byId<HTMLElement>("detail-panel");
  readonly #fitButton = byId<HTMLButtonElement>("fit-view");
  readonly #clearButton = byId<HTMLButtonElement>("clear-selection");
  readonly #relationMode = byId<HTMLSelectElement>("relation-mode");
  readonly #openButton = byId<HTMLButtonElement>("open-database");
  readonly #fileInput = byId<HTMLInputElement>("database-file");
  readonly #searchInput = byId<HTMLInputElement>("node-search");
  readonly #searchResults = byId<HTMLDivElement>("search-results");
  readonly #toast = byId<HTMLDivElement>("toast");
  readonly #toastTitle = byId<HTMLElement>("toast-title");
  readonly #toastMessage = byId<HTMLElement>("toast-message");
  readonly #liveStatus = byId<HTMLElement>("live-status");

  constructor() {
    this.#spaghettiButton.addEventListener("click", () => this.#toggleSpaghettiMode());
    this.#exitFindingIsolationButton.addEventListener("click", () => this.#exitFindingIsolation());
    this.#openButton.addEventListener("click", () => this.#fileInput.click());
    this.#fileInput.addEventListener("change", () => {
      const file = this.#fileInput.files?.[0];
      this.#fileInput.value = "";
      if (!file) return;
      void file.arrayBuffer().then(
        (buffer) => this.openBytes(new Uint8Array(buffer), file.name),
        (error: unknown) => this.#showError("Could not read file", error),
      );
    });
    this.#fitButton.addEventListener("click", () => this.#renderer?.fitVisible());
    this.#clearButton.addEventListener("click", () => void this.#selectNode(null));
    this.#relationMode.addEventListener("change", () => {
      if (!this.#filters) return;
      const mode = this.#relationMode.value;
      if (mode === "all" || mode === "dim" || mode === "hide") {
        this.#markFiltersCustom();
        this.#filters.relationMode = mode;
        this.#refreshRenderState();
      }
    });
    this.#searchInput.addEventListener("input", () => this.#queueSearch());
    this.#searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.#hideSearchResults();
    });
    byId<HTMLButtonElement>("toast-close").addEventListener("click", () => {
      this.#toast.hidden = true;
    });
    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!this.#searchResults.contains(target) && target !== this.#searchInput) this.#hideSearchResults();
    });
    window.addEventListener("keydown", (event) => {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        this.#searchInput.focus();
      } else if ((event.key === "f" || event.key === "F") && !typing) {
        event.preventDefault();
        this.#renderer?.fitVisible();
      } else if (event.key === "Escape" && !typing) {
        void this.#selectNode(null);
      }
    });
  }

  async openSeed(): Promise<void> {
    this.#setLoading("Reading fixtures/seed.sqlite", "Fetching the checked-in v1 database…");
    try {
      const response = await fetch(seedDatabaseUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      await this.openBytes(new Uint8Array(await response.arrayBuffer()), "fixtures/seed.sqlite");
    } catch (error) {
      this.#handleLoadFailure("Seed database could not be loaded", error);
    }
  }

  async openBytes(bytes: Uint8Array, sourceLabel: string): Promise<void> {
    const started = performance.now();
    this.#setLoading(`Opening ${sourceLabel}`, `${formatBytes(bytes.byteLength)} · validating SQLite contract v1…`);
    this.#sourceStatus.className = "status-dot";
    let nextDatabase: GraphDatabase | null = null;
    let nextRenderer: GraphRenderer | null = null;
    try {
      nextDatabase = await GraphDatabase.open(bytes, sourceLabel);
      this.#loadingDetail.textContent = "Verifying blob digests, headers, records, and render codes…";
      const dataset = await nextDatabase.loadGraph();
      this.#loadingDetail.textContent = "Preparing GPU buffers and culled labels…";
      const [labels, findings] = await Promise.all([
        nextDatabase.getLabelCandidates(200),
        nextDatabase.getGlobalFindings(),
      ]);
      const filters = createInitialFilterState(dataset);
      const renderState = computeRenderState(dataset, filters);
      nextRenderer = new GraphRenderer(
        this.#canvasHost,
        dataset,
        labels,
        filters,
        renderState,
        (nodeIndex) => void this.#selectNode(nodeIndex),
      );

      const previousRenderer = this.#renderer;
      const previousDatabase = this.#database;
      this.#renderer = nextRenderer;
      this.#database = nextDatabase;
      this.#dataset = dataset;
      this.#filters = filters;
      this.#renderState = renderState;
      this.#globalFindings = findings;
      this.#spaghettiActive = false;
      this.#activeFinding = null;
      nextRenderer = null;
      nextDatabase = null;
      previousRenderer?.dispose();
      if (previousDatabase) await previousDatabase.close();

      this.#renderDatasetUI();
      this.#renderGlobalOverview();
      this.#sourceStatus.className = "status-dot ready";
      this.#loadingPanel.classList.add("done");
      const elapsed = Math.round(performance.now() - started);
      this.#liveStatus.textContent = `${dataset.snapshot.repositoryName} loaded: ${dataset.positions.nodeIds.length} nodes and ${dataset.edges.edgeIds.length} edges in ${elapsed} milliseconds.`;
      this.#sourceLabel.textContent = `${sourceLabel} · ${formatBytes(bytes.byteLength)}`;
      const readyWindow = window as Window & {
        __CONSTELLATION_READY__?: boolean;
        __CONSTELLATION_STATS__?: { nodes: number; edges: number; source: string };
      };
      readyWindow.__CONSTELLATION_READY__ = true;
      readyWindow.__CONSTELLATION_STATS__ = {
        nodes: dataset.positions.nodeIds.length,
        edges: dataset.edges.edgeIds.length,
        source: sourceLabel,
      };
    } catch (error) {
      nextRenderer?.dispose();
      if (nextDatabase) {
        try {
          await nextDatabase.close();
        } catch (cleanupError) {
          console.warn("Database cleanup after load failure was incomplete", cleanupError);
        }
      }
      this.#handleLoadFailure(`Could not open ${sourceLabel}`, error);
    }
  }

  #handleLoadFailure(title: string, error: unknown): void {
    this.#showError(title, error);
    if (this.#renderer) {
      this.#sourceStatus.className = "status-dot ready";
      this.#loadingPanel.classList.add("done");
      return;
    }
    this.#sourceStatus.className = "status-dot error";
    this.#loadingTitle.textContent = "Database rejected";
    this.#loadingDetail.textContent = error instanceof Error ? error.message : String(error);
    this.#loadingPanel.classList.remove("done");
  }

  #setLoading(title: string, detail: string): void {
    this.#loadingTitle.textContent = title;
    this.#loadingDetail.textContent = detail;
    this.#loadingPanel.classList.remove("done");
  }

  #showError(title: string, error: unknown): void {
    console.error(title, error);
    this.#toastTitle.textContent = title;
    this.#toastMessage.textContent = error instanceof Error ? error.message : String(error);
    this.#toast.hidden = false;
    this.#liveStatus.textContent = `${title}: ${this.#toastMessage.textContent}`;
  }

  #renderDatasetUI(): void {
    const dataset = this.#dataset;
    if (!dataset) return;
    this.#repositoryName.textContent = dataset.snapshot.repositoryName;
    const revision = dataset.snapshot.revision.length > 12
      ? dataset.snapshot.revision.slice(0, 10)
      : dataset.snapshot.revision;
    const snapshotScope = dataset.snapshot.historyMode === "absent"
      ? "current source"
      : `${dataset.snapshot.historyMode} history`;
    this.#snapshotMeta.textContent = `${revision} · ${snapshotScope} · ${dataset.layout.algorithm}`;
    this.#layoutLabel.textContent = `${dataset.layout.name} · ${dataset.layout.nodeCount} nodes / ${dataset.layout.edgeCount} edges`;
    this.#sourceLabel.textContent = `${dataset.sourceLabel} · ${formatBytes(this.#database?.bytes ?? 0)}`;
    this.#renderSpaghettiControls();
    this.#renderLayers();
    this.#renderNodeKindControls();
    this.#renderEdgeKindControls();
    this.#renderCapabilities();
    this.#renderLegend();
    this.#updateStats();
  }

  #renderLayers(): void {
    const dataset = this.#dataset;
    const filters = this.#filters;
    if (!dataset || !filters) return;
    this.#layerControls.replaceChildren();
    const changeCapability = dataset.capabilities.find((entry) => entry.capability === "issue_file_touches") ?? {
      capability: "issue_file_touches",
      status: "unavailable" as const,
      coverage: null,
      detail: "This snapshot does not declare issue-to-file capability.",
    };
    for (const layer of LAYER_DEFINITIONS) {
      if (layer.key === "change" && !hasChangeEdges(dataset.edgeKinds)) continue;
      const button = createElement("button", "layer-button");
      button.type = "button";
      button.setAttribute("aria-pressed", String(filters.enabledLayers.has(layer.key)));
      button.style.setProperty("--layer-color", EDGE_LAYER_COLOR[layer.key]);
      const stripe = createElement("span", "layer-stripe");
      const copy = createElement("span", "layer-copy");
      copy.append(createElement("strong", undefined, layer.label), createElement("small", undefined, layer.hint));
      button.append(stripe, copy);
      if (layer.key === "change" && this.#spaghettiActive) {
        button.disabled = true;
        button.title = "Spaghetti mode is a current-source dependency view and never enables change history.";
        button.append(statusBadge("unavailable", "current only"));
      } else if (layer.key === "change" && changeCapability.status !== "available") {
        button.append(statusBadge(changeCapability.status, changeCapability.status));
        button.title = changeCapability.detail;
      }
      button.addEventListener("click", () => {
        this.#markFiltersCustom();
        setMembership(filters.enabledLayers, layer.key, !filters.enabledLayers.has(layer.key));
        this.#renderLayers();
        this.#refreshRenderState();
      });
      this.#layerControls.append(button);
    }
  }

  #renderNodeKindControls(): void {
    const dataset = this.#dataset;
    const filters = this.#filters;
    if (!dataset || !filters) return;
    this.#nodeKindControls.replaceChildren();
    for (const kind of dataset.nodeKinds.filter((entry) => entry.count > 0)) {
      const label = createElement("label", "check-row");
      const checkbox = createElement("input") as HTMLInputElement;
      checkbox.type = "checkbox";
      checkbox.checked = filters.enabledNodeKinds.has(kind.key);
      const glyph = nodeGlyph(kind.key, "mini-glyph");
      const name = createElement("span", "check-label", formatKind(kind.key));
      const count = createElement("span", "check-count", compactNumber(kind.count));
      checkbox.addEventListener("change", () => {
        this.#markFiltersCustom();
        setMembership(filters.enabledNodeKinds, kind.key, checkbox.checked);
        this.#refreshRenderState();
      });
      label.title = kind.description;
      label.append(checkbox, glyph, name, count);
      this.#nodeKindControls.append(label);
    }
  }

  #renderEdgeKindControls(): void {
    const dataset = this.#dataset;
    const filters = this.#filters;
    if (!dataset || !filters) return;
    this.#edgeKindControls.replaceChildren();
    for (const kind of dataset.edgeKinds.filter((entry) => entry.count > 0)) {
      const label = createElement("label", "check-row");
      const checkbox = createElement("input") as HTMLInputElement;
      checkbox.type = "checkbox";
      checkbox.checked = filters.enabledEdgeKinds.has(kind.key);
      const layerColor = LAYER_DEFINITIONS.find((layer) => layer.categories.includes(kind.category));
      const glyph = createElement("span", "mini-glyph glyph-circle");
      glyph.style.setProperty("--glyph-color", layerColor ? EDGE_LAYER_COLOR[layerColor.key] : "#637083");
      const name = createElement("span", "check-label", formatKind(kind.key));
      const count = createElement("span", "check-count", compactNumber(kind.count));
      checkbox.addEventListener("change", () => {
        this.#markFiltersCustom();
        setMembership(filters.enabledEdgeKinds, kind.key, checkbox.checked);
        this.#refreshRenderState();
      });
      label.title = kind.description;
      label.append(checkbox, glyph, name, count);
      this.#edgeKindControls.append(label);
    }
  }

  #allCapabilities(): CapabilityInfo[] {
    const historyMode = this.#dataset?.snapshot.historyMode;
    const existing = new Map((this.#dataset?.capabilities ?? []).map((capability) => [capability.capability, capability]));
    for (const key of EXPECTED_CAPABILITIES) {
      if (historyMode && shouldHideHistoryCapability(historyMode, key)) continue;
      if (!existing.has(key)) {
        existing.set(key, {
          capability: key,
          status: "unavailable",
          coverage: null,
          detail: "The snapshot does not declare this capability.",
        });
      }
    }
    return [...existing.values()]
      .filter((capability) => !historyMode || !shouldHideHistoryCapability(historyMode, capability.capability))
      .sort((left, right) => left.capability.localeCompare(right.capability));
  }

  #renderCapabilities(): void {
    this.#capabilityList.replaceChildren();
    for (const capability of this.#allCapabilities()) {
      const card = createElement("article", `capability-card status-${capability.status}`);
      const top = createElement("div", "capability-top");
      top.append(
        createElement("strong", undefined, formatKind(capability.capability)),
        statusBadge(capability.status),
      );
      card.append(top, createElement("p", undefined, capability.detail));
      if (capability.coverage !== null) {
        const coverage = createElement("div", "coverage-bar");
        const meter = createElement("i");
        meter.style.width = `${Math.round(capability.coverage * 100)}%`;
        coverage.title = `${Math.round(capability.coverage * 100)}% coverage`;
        coverage.append(meter);
        card.append(coverage);
      }
      this.#capabilityList.append(card);
    }
  }

  #renderLegend(): void {
    const entries = ["directory", "file", "package", "actor", "concept", "action", "symbol", "data_store"];
    this.#nodeLegend.replaceChildren();
    for (const kind of entries) {
      const style = NODE_STYLE[kind];
      if (!style) continue;
      const row = createElement("div", "legend-row");
      row.append(nodeGlyph(kind, "legend-glyph"), createElement("span", undefined, style.label));
      this.#nodeLegend.append(row);
    }
  }

  #renderSpaghettiControls(): void {
    this.#spaghettiButton.setAttribute("aria-pressed", String(this.#spaghettiActive));
    this.#spaghettiButton.classList.toggle("active", this.#spaghettiActive);
    const state = this.#spaghettiButton.querySelector<HTMLElement>(".preset-state");
    if (state) state.textContent = this.#spaghettiActive ? "Active" : "Explore";
    const isolation = this.#filters?.isolation;
    this.#findingIsolation.hidden = isolation === null || isolation === undefined;
    if (isolation && this.#activeFinding) {
      const nodeCount = isolation.nodeIndices.size;
      const edgeCount = isolation.edgeIndices.size;
      const diagnosticClass = diagnosticClassForFinding(this.#activeFinding);
      const label = diagnosticClass ? diagnosticClassLabel(diagnosticClass) : "Diagnostic finding";
      this.#findingIsolationCopy.textContent = `${label} · ${nodeCount} node${nodeCount === 1 ? "" : "s"} · ${edgeCount} edge${edgeCount === 1 ? "" : "s"}`;
    } else {
      this.#findingIsolationCopy.textContent = "";
    }
  }

  #buildCurrentDiagnosticClasses(): Float32Array {
    const dataset = this.#dataset;
    if (!dataset) return new Float32Array();
    return buildDiagnosticNodeClasses(
      dataset.positions.nodeIds.length,
      dataset.nodeIndexById,
      this.#globalFindings,
    );
  }

  #toggleSpaghettiMode(): void {
    const dataset = this.#dataset;
    const filters = this.#filters;
    const renderer = this.#renderer;
    if (!dataset || !filters || !renderer) return;
    this.#detailRequest += 1;
    renderer.setSelectionLabel(null);
    this.#activeFinding = null;
    if (this.#spaghettiActive) {
      const initial = createInitialFilterState(dataset);
      filters.enabledNodeKinds = initial.enabledNodeKinds;
      filters.enabledEdgeKinds = initial.enabledEdgeKinds;
      filters.enabledLayers = initial.enabledLayers;
      filters.relationMode = initial.relationMode;
      filters.selectedNodeIndex = null;
      filters.isolation = null;
      filters.diagnosticNodeClasses.fill(0);
      this.#spaghettiActive = false;
    } else {
      applySpaghettiPreset(dataset, filters);
      filters.diagnosticNodeClasses = this.#buildCurrentDiagnosticClasses();
      this.#spaghettiActive = true;
    }
    this.#relationMode.value = filters.relationMode;
    this.#renderSpaghettiControls();
    this.#renderLayers();
    this.#renderNodeKindControls();
    this.#renderEdgeKindControls();
    this.#refreshRenderState();
    this.#renderGlobalOverview();
    renderer.fitVisible();
    this.#liveStatus.textContent = this.#spaghettiActive
      ? "Spaghetti investigation active: current dependency findings are ranked and diagnostic participants are emphasized."
      : "Returned to the Structure overview.";
  }

  #markFiltersCustom(): void {
    const filters = this.#filters;
    if (!filters || (!this.#spaghettiActive && filters.isolation === null)) return;
    this.#spaghettiActive = false;
    this.#activeFinding = null;
    filters.isolation = null;
    filters.diagnosticNodeClasses.fill(0);
    this.#renderSpaghettiControls();
    this.#renderLayers();
    this.#renderGlobalOverview();
  }

  #exitFindingIsolation(): void {
    const filters = this.#filters;
    const renderer = this.#renderer;
    if (!filters || !renderer || filters.isolation === null) return;
    this.#detailRequest += 1;
    filters.isolation = null;
    filters.selectedNodeIndex = null;
    filters.diagnosticNodeClasses = this.#buildCurrentDiagnosticClasses();
    this.#activeFinding = null;
    renderer.setSelectionLabel(null);
    this.#renderSpaghettiControls();
    this.#refreshRenderState();
    this.#renderGlobalOverview();
    renderer.fitVisible();
    this.#liveStatus.textContent = "Finding isolation cleared; showing the full current-state dependency view.";
  }

  async #isolateFinding(finding: FindingInfo): Promise<void> {
    const dataset = this.#dataset;
    const filters = this.#filters;
    const renderer = this.#renderer;
    if (!dataset || !filters || !renderer) return;
    const nodeIndices = new Set<number>();
    const edgeIndices = new Set<number>();
    for (const attachment of finding.nodes) {
      const index = dataset.nodeIndexById.get(attachment.id.toString());
      if (index !== undefined) nodeIndices.add(index);
    }
    for (const attachment of finding.edges) {
      const index = dataset.edgeIndexById.get(attachment.id.toString());
      if (index !== undefined) edgeIndices.add(index);
    }
    if (nodeIndices.size === 0) {
      this.#liveStatus.textContent = `Finding ${finding.title} has no participant nodes in the active layout.`;
      return;
    }
    filters.isolation = { findingId: finding.id, nodeIndices, edgeIndices };
    filters.selectedNodeIndex = null;
    filters.diagnosticNodeClasses = this.#buildCurrentDiagnosticClasses();
    const diagnosticClass = diagnosticClassForFinding(finding);
    if (diagnosticClass) {
      for (const index of nodeIndices) filters.diagnosticNodeClasses[index] = DIAGNOSTIC_CODE[diagnosticClass];
    }
    this.#activeFinding = finding;
    renderer.setSelectionLabel(null);
    this.#renderSpaghettiControls();
    this.#refreshRenderState();
    renderer.fitVisible();

    const primaryId = finding.nodes.find((attachment) => attachment.role === "primary")?.id
      ?? finding.nodes[0]?.id;
    const primaryIndex = primaryId === undefined
      ? undefined
      : dataset.nodeIndexById.get(primaryId.toString());
    if (primaryIndex !== undefined) {
      await this.#selectNode(primaryIndex);
      renderer.fitVisible();
    } else {
      this.#renderGlobalOverview();
    }
  }

  #refreshRenderState(): void {
    const dataset = this.#dataset;
    const filters = this.#filters;
    const renderer = this.#renderer;
    if (!dataset || !filters || !renderer) return;
    const priorSelection = filters.selectedNodeIndex;
    this.#renderState = computeRenderState(dataset, filters);
    renderer.applyRenderState(filters, this.#renderState);
    if (priorSelection !== null && filters.selectedNodeIndex === null) {
      renderer.setSelectionLabel(null);
      this.#renderGlobalOverview();
    }
    this.#clearButton.disabled = filters.selectedNodeIndex === null;
    this.#updateStats();
  }

  #updateStats(): void {
    const dataset = this.#dataset;
    const state = this.#renderState;
    const filters = this.#filters;
    if (!dataset || !state || !filters) return;
    const stat = (value: string, label: string): HTMLDivElement => {
      const chip = createElement("div", "stat-chip");
      chip.append(createElement("strong", undefined, value), createElement("small", undefined, label));
      return chip;
    };
    this.#graphStats.replaceChildren(
      stat(`${compactNumber(state.visibleNodeCount)} / ${compactNumber(dataset.positions.nodeIds.length)}`, "visible nodes"),
      stat(`${compactNumber(state.visibleEdgeCount)} / ${compactNumber(dataset.edges.edgeIds.length)}`, "visible edges"),
    );
    this.#nodeFilterSummary.textContent = `${filters.enabledNodeKinds.size} on`;
    this.#edgeFilterSummary.textContent = `${filters.enabledEdgeKinds.size} on`;
  }

  async #selectNode(nodeIndex: number | null, focus = false): Promise<void> {
    const dataset = this.#dataset;
    const filters = this.#filters;
    const database = this.#database;
    if (!dataset || !filters || !database) return;
    const request = ++this.#detailRequest;
    if (nodeIndex === null) {
      filters.selectedNodeIndex = null;
      this.#renderer?.setSelectionLabel(null);
      this.#refreshRenderState();
      this.#renderGlobalOverview();
      return;
    }
    if (nodeIndex < 0 || nodeIndex >= dataset.positions.nodeIds.length) return;
    if (filters.isolation && !filters.isolation.nodeIndices.has(nodeIndex)) {
      filters.isolation = null;
      this.#activeFinding = null;
      filters.diagnosticNodeClasses = this.#buildCurrentDiagnosticClasses();
      this.#renderSpaghettiControls();
    }
    const kindCode = dataset.positions.kindCodes[nodeIndex] ?? 0;
    const kind = dataset.nodeKinds.find((entry) => entry.renderCode === kindCode);
    if (kind && this.#spaghettiActive && !filters.enabledNodeKinds.has(kind.key)) {
      this.#markFiltersCustom();
    }
    if (kind) filters.enabledNodeKinds.add(kind.key);
    filters.selectedNodeIndex = nodeIndex;
    this.#renderer?.setSelectionLabel(null);
    this.#refreshRenderState();
    this.#clearButton.disabled = false;
    if (focus) this.#renderer?.focusNode(nodeIndex);
    this.#renderDetailLoading();
    try {
      const nodeId = dataset.positions.nodeIds[nodeIndex];
      if (nodeId === undefined) return;
      const detail = await database.getNodeDetail(nodeId);
      if (request !== this.#detailRequest || filters.selectedNodeIndex !== nodeIndex) return;
      this.#renderer?.setSelectionLabel(nodeIndex, detail.name);
      this.#renderNodeDetail(detail);
      this.#liveStatus.textContent = `Selected ${detail.kind} ${detail.name}, with ${detail.neighbors.length} relationships and ${detail.findings.length} findings.`;
    } catch (error) {
      if (request !== this.#detailRequest) return;
      this.#showError("Could not load node details", error);
      this.#renderDetailError(error);
    }
  }

  #renderDetailLoading(): void {
    const skeleton = createElement("div", "loading-skeleton");
    skeleton.append(createElement("i"), createElement("i"), createElement("i"));
    this.#detailPanel.replaceChildren(skeleton);
  }

  #renderDetailError(error: unknown): void {
    const placeholder = createElement("div", "detail-placeholder");
    placeholder.append(
      createElement("span", "placeholder-glyph", "!"),
      createElement("p", "eyebrow", "DETAIL ERROR"),
      createElement("h2", undefined, "Metadata unavailable"),
      createElement("p", undefined, error instanceof Error ? error.message : String(error)),
    );
    this.#detailPanel.replaceChildren(placeholder);
  }

  #renderGlobalOverview(): void {
    const dataset = this.#dataset;
    if (!dataset) return;
    if (this.#spaghettiActive) {
      this.#renderSpaghettiOverview();
      return;
    }
    const content = createElement("div", "detail-content");
    const header = createElement("header", "global-summary");
    header.append(
      createElement("p", "eyebrow", dataset.snapshot.historyMode === "absent" ? "CURRENT SOURCE" : "START WITH STRUCTURE"),
      createElement("h2", undefined, dataset.snapshot.historyMode === "absent" ? "Current-source architecture" : "Architecture overview"),
      createElement(
        "p",
        undefined,
        dataset.snapshot.historyMode === "absent"
          ? "This snapshot explains the checked-out source tree. History was intentionally left out; use layers or Spaghetti investigation to inspect current dependencies."
          : "The initial view keeps hierarchy visible and dependency noise low. Turn on layers with a question in mind, then select a node to reveal its local evidence.",
      ),
    );
    content.append(header);

    const summary = createElement("section", "detail-section");
    const summaryHeading = createElement("div", "detail-section-heading");
    summaryHeading.append(createElement("h3", undefined, "Snapshot"), createElement("span", undefined, dataset.snapshot.completedAt));
    const grid = createElement("div", "snapshot-grid");
    const card = (value: string, label: string): HTMLDivElement => {
      const result = createElement("div", "snapshot-card");
      result.append(createElement("strong", undefined, value), createElement("span", undefined, label));
      return result;
    };
    if (dataset.snapshot.historyMode === "absent") {
      grid.append(
        card("Current source", "snapshot scope"),
        card(compactNumber(dataset.positions.nodeIds.length), "recorded nodes"),
        card(dataset.layout.name, "layout"),
        card(dataset.layout.algorithm, "algorithm"),
      );
    } else {
      grid.append(
        card(dataset.snapshot.historyMode, "history mode"),
        card(compactNumber(dataset.snapshot.visibleCommitCount), "visible commits"),
        card(dataset.layout.name, "layout"),
        card(dataset.layout.algorithm, "algorithm"),
      );
    }
    summary.append(summaryHeading, grid);
    content.append(summary);

    const findingsSection = createElement("section", "detail-section");
    const findingHeading = createElement("div", "detail-section-heading");
    findingHeading.append(
      createElement("h3", undefined, "Actionable findings"),
      createElement("span", undefined, `${this.#globalFindings.length} current`),
    );
    findingsSection.append(findingHeading);
    if (this.#globalFindings.length === 0) {
      findingsSection.append(createElement("p", "empty-state", "No findings are attached to this snapshot."));
    } else {
      const stack = createElement("div", "finding-stack");
      for (const finding of this.#globalFindings) stack.append(this.#findingCard(finding));
      findingsSection.append(stack);
    }
    content.append(findingsSection);
    this.#detailPanel.replaceChildren(content);
  }

  #renderSpaghettiOverview(): void {
    const content = createElement("div", "detail-content spaghetti-overview");
    const header = createElement("header", "global-summary spaghetti-summary");
    header.append(
      createElement("p", "eyebrow", "CURRENT-STATE DIAGNOSTICS"),
      createElement("h2", undefined, "Spaghetti investigation"),
      createElement(
        "p",
        undefined,
        "Dependency evidence is ranked by severity and measured impact. Choose a finding to isolate only its recorded participant nodes and supporting edges.",
      ),
    );
    const legend = createElement("div", "diagnostic-legend");
    for (const diagnosticClass of ["cycle", "hub", "boundary-sprawl"] as const) {
      const item = createElement("span", `diagnostic-key diagnostic-${diagnosticClass}`);
      item.append(createElement("i"), createElement("b", undefined, diagnosticClassLabel(diagnosticClass)));
      item.title = diagnosticClassSummary(diagnosticClass);
      legend.append(item);
    }
    header.append(legend);
    content.append(header);

    const findings = rankSpaghettiFindings(this.#globalFindings);
    const findingsSection = createElement("section", "detail-section");
    const heading = createElement("div", "detail-section-heading");
    heading.append(
      createElement("h3", undefined, "Current findings"),
      createElement("span", undefined, `${findings.length} ranked`),
    );
    findingsSection.append(heading);
    if (findings.length === 0) {
      findingsSection.append(createElement(
        "p",
        "empty-state",
        "No cycle, dependency-hub, or boundary-sprawl findings are recorded for this snapshot. The dependency graph remains available for manual inspection.",
      ));
    } else {
      const stack = createElement("div", "finding-stack diagnostic-findings");
      for (const finding of findings) stack.append(this.#findingCard(finding, true));
      findingsSection.append(stack);
    }
    content.append(findingsSection);
    this.#detailPanel.replaceChildren(content);
  }

  #renderNodeDetail(detail: NodeDetail): void {
    const style = NODE_STYLE[detail.kind] ?? NODE_STYLE.symbol;
    const content = createElement("div", "detail-content");
    const header = createElement("header", "detail-header");
    header.style.setProperty("--node-color", style?.color ?? "#b8a1ff");
    const titleRow = createElement("div", "detail-title-row");
    const titleCopy = createElement("div", "detail-title-copy");
    titleCopy.append(
      createElement("span", "kind-kicker", formatKind(detail.kind)),
      createElement("h2", undefined, detail.name),
    );
    titleRow.append(nodeGlyph(detail.kind, "node-glyph"), titleCopy);
    header.append(titleRow);
    const path = detail.path ?? detail.qualifiedName ?? detail.stableKey;
    header.append(createElement("p", "detail-path", path));
    const pills = createElement("div", "meta-pills");
    const confidence = createElement(
      "span",
      `pill${detail.confidence < 0.9 ? " confidence-low" : ""}`,
      `${Math.round(detail.confidence * 100)}% confidence`,
    );
    pills.append(confidence);
    if (detail.language) pills.append(createElement("span", "pill", detail.language));
    if (detail.external) pills.append(createElement("span", "pill confidence-low", "external"));
    if (this.#renderState?.selectionPinned) {
      const pinned = createElement("span", "pill confidence-low", "pinned outside active layers");
      pinned.title = "Search keeps this node visible, but the active layers still govern its neighbors and edges.";
      pills.append(pinned);
    }
    if (detail.startLine !== null) {
      pills.append(createElement("span", "pill", `lines ${detail.startLine}–${detail.endLine ?? detail.startLine}`));
    }
    header.append(pills);
    content.append(header);

    const metricsSection = createElement("section", "detail-section");
    const metricHeading = createElement("div", "detail-section-heading");
    metricHeading.append(createElement("h3", undefined, "Metrics"), createElement("span", undefined, `${detail.metrics.length} recorded`));
    metricsSection.append(metricHeading);
    if (detail.metrics.length === 0) {
      metricsSection.append(createElement("p", "empty-state", "No metrics are recorded for this node; the browser does not compute substitutes."));
    } else {
      const metricGrid = createElement("div", "metric-grid");
      const orderedMetrics = detail.metrics.slice().sort((left, right) =>
        metricDisplayOrder(left) - metricDisplayOrder(right) || left.key.localeCompare(right.key));
      for (const metric of orderedMetrics) {
        const friendly = friendlyMetric(metric);
        const card = createElement("div", "metric-card");
        card.title = `${friendly.detail} Source: ${metric.provenance}`;
        card.append(
          createElement("strong", undefined, formatMetricValue(metric.value, metric.unit)),
          createElement("span", undefined, friendly.label),
        );
        metricGrid.append(card);
      }
      metricsSection.append(metricGrid);
    }
    content.append(metricsSection);

    const findingsSection = createElement("section", "detail-section");
    const findingHeading = createElement("div", "detail-section-heading");
    findingHeading.append(createElement("h3", undefined, "Findings"), createElement("span", undefined, `${detail.findings.length} attached`));
    findingsSection.append(findingHeading);
    if (detail.findings.length === 0) {
      findingsSection.append(createElement("p", "empty-state", "No finding directly names this node."));
    } else {
      const stack = createElement("div", "finding-stack");
      for (const finding of detail.findings) {
        const completeFinding = this.#globalFindings.find((candidate) => candidate.id === finding.id) ?? finding;
        stack.append(this.#findingCard(completeFinding));
      }
      findingsSection.append(stack);
    }
    content.append(findingsSection);

    const neighborsSection = createElement("section", "detail-section");
    const neighborHeading = createElement("div", "detail-section-heading");
    neighborHeading.append(
      createElement("h3", undefined, "Relationships & evidence"),
      createElement("span", undefined, `${detail.neighbors.length} edges`),
    );
    neighborsSection.append(neighborHeading);
    if (detail.neighbors.length === 0) {
      neighborsSection.append(createElement("p", "empty-state", "No adjacent edges are recorded for this node."));
    } else {
      const list = createElement("div", "neighbor-list");
      for (const neighbor of detail.neighbors.slice(0, 120)) list.append(this.#neighborCard(neighbor));
      neighborsSection.append(list);
      if (detail.neighbors.length > 120) {
        neighborsSection.append(createElement("p", "empty-state", `Showing the first 120 of ${detail.neighbors.length} relationships.`));
      }
    }
    content.append(neighborsSection);

    const attributes = Object.entries(detail.attributes);
    if (attributes.length > 0) {
      const attributeSection = createElement("section", "detail-section");
      const heading = createElement("div", "detail-section-heading");
      heading.append(createElement("h3", undefined, "Attributes"), createElement("span", undefined, "source metadata"));
      const list = createElement("div", "attribute-list");
      for (const [key, value] of attributes) {
        list.append(createElement("span", "attribute-chip", `${key}: ${JSON.stringify(value)}`));
      }
      attributeSection.append(heading, list);
      content.append(attributeSection);
    }
    this.#detailPanel.replaceChildren(content);
  }

  #findingCard(finding: FindingInfo, allowIsolation = false): HTMLElement {
    const diagnosticClass = diagnosticClassForFinding(finding);
    const card = createElement(
      "article",
      `finding-card severity-${finding.severity}${diagnosticClass ? ` diagnostic-card diagnostic-${diagnosticClass}` : ""}`,
    );
    if (diagnosticClass) {
      card.dataset.findingClass = diagnosticClass;
      card.dataset.impact = String(findingImpact(finding));
      const diagnosticHeading = createElement("div", "diagnostic-card-heading");
      diagnosticHeading.append(
        createElement("span", "diagnostic-class-badge", diagnosticClassLabel(diagnosticClass)),
        createElement("span", `severity-chip severity-${finding.severity}`, finding.severity),
      );
      card.append(
        diagnosticHeading,
        createElement("h4", undefined, finding.title),
        createElement("p", "diagnostic-summary", diagnosticClassSummary(diagnosticClass)),
        createElement("p", undefined, finding.detail),
      );
    } else {
      card.append(createElement("h4", undefined, finding.title), createElement("p", undefined, finding.detail));
    }
    const meta = createElement("div", "finding-meta");
    if (diagnosticClass) {
      meta.append(
        createElement("span", undefined, findingMeasure(finding)),
        createElement("span", undefined, `${finding.edges.length} evidence edges`),
      );
    } else {
      meta.append(
        createElement("span", undefined, finding.severity),
        createElement("span", undefined, finding.status),
        createElement("span", undefined, formatKind(finding.category)),
      );
    }
    if (finding.role) meta.append(createElement("span", undefined, finding.role));
    card.append(meta);
    if (allowIsolation && diagnosticClass) {
      const nodeCount = new Set(finding.nodes.map((attachment) => attachment.id.toString())).size;
      const edgeCount = new Set(finding.edges.map((attachment) => attachment.id.toString())).size;
      const isolate = createElement("button", "finding-isolate");
      isolate.type = "button";
      isolate.dataset.nodeCount = String(nodeCount);
      isolate.dataset.edgeCount = String(edgeCount);
      isolate.append(
        createElement("span", undefined, "Isolate finding"),
        createElement("small", undefined, `${nodeCount} nodes · ${edgeCount} edges`),
      );
      isolate.addEventListener("click", () => void this.#isolateFinding(finding));
      card.append(isolate);
    }
    if (finding.recommendation) {
      const recommendation = createElement("div", "recommendation");
      recommendation.append(
        createElement("strong", undefined, "Recommendation"),
        createElement("p", undefined, finding.recommendation),
      );
      card.append(recommendation);
    }
    return card;
  }

  #neighborCard(neighbor: NeighborInfo): HTMLElement {
    const card = createElement("article", "neighbor-card");
    const top = createElement("button", "neighbor-top");
    top.type = "button";
    const direction = neighbor.direction === "outgoing" ? "→" : neighbor.direction === "incoming" ? "←" : "↔";
    const copy = createElement("span", "neighbor-name");
    copy.append(
      createElement("strong", undefined, neighbor.nodeName),
      createElement("small", undefined, neighbor.nodePath ?? formatKind(neighbor.nodeKind)),
    );
    top.append(
      createElement("span", "direction-mark", direction),
      copy,
      createElement("span", "edge-kind-chip", formatKind(neighbor.edgeKind)),
    );
    top.title = `${Math.round(neighbor.edgeConfidence * 100)}% confidence${neighbor.derived ? " · derived" : ""}`;
    top.addEventListener("click", () => {
      const index = this.#dataset?.nodeIndexById.get(neighbor.nodeId.toString());
      if (index !== undefined) void this.#selectNode(index, true);
    });
    card.append(top);
    if (neighbor.evidence.length > 0) {
      const details = createElement("details", "evidence-details");
      details.append(createElement("summary", undefined, `${neighbor.evidence.length} evidence record${neighbor.evidence.length === 1 ? "" : "s"}`));
      for (const evidence of neighbor.evidence) {
        const item = createElement("p", "evidence-item", evidence.excerpt ?? `${formatKind(evidence.kind)} evidence`);
        const references = [
          formatKind(evidence.kind),
          evidence.issueKey,
          evidence.commitHash?.slice(0, 10),
          evidence.startLine === null ? null : `lines ${evidence.startLine}–${evidence.endLine ?? evidence.startLine}`,
        ].filter((entry): entry is string => Boolean(entry));
        item.append(createElement("small", undefined, references.join(" · ")));
        details.append(item);
      }
      card.append(details);
    }
    return card;
  }

  #queueSearch(): void {
    window.clearTimeout(this.#searchTimer);
    const query = this.#searchInput.value.trim();
    if (!query) {
      this.#hideSearchResults();
      return;
    }
    this.#searchTimer = window.setTimeout(() => void this.#runSearch(query), 170);
  }

  async #runSearch(query: string): Promise<void> {
    const database = this.#database;
    if (!database) return;
    const request = ++this.#searchRequest;
    try {
      const results = await database.searchNodes(query);
      if (request !== this.#searchRequest || query !== this.#searchInput.value.trim()) return;
      this.#renderSearchResults(results);
    } catch (error) {
      if (request !== this.#searchRequest) return;
      this.#showError("Search failed", error);
    }
  }

  #renderSearchResults(results: SearchResult[]): void {
    this.#searchResults.replaceChildren();
    if (results.length === 0) {
      this.#searchResults.append(createElement("p", "search-empty", "No matching nodes in this snapshot."));
    } else {
      for (const result of results) {
        const button = createElement("button", "search-result");
        button.type = "button";
        button.setAttribute("role", "option");
        const copy = createElement("span", "search-result-copy");
        copy.append(
          createElement("strong", undefined, result.name),
          createElement("small", undefined, result.path ?? result.qualifiedName ?? `node ${result.id}`),
        );
        button.append(
          nodeGlyph(result.kind, "mini-glyph"),
          copy,
          createElement("span", "search-result-kind", formatKind(result.kind)),
        );
        button.addEventListener("click", () => {
          const index = this.#dataset?.nodeIndexById.get(result.id.toString());
          this.#hideSearchResults();
          if (index !== undefined) void this.#selectNode(index, true);
        });
        this.#searchResults.append(button);
      }
    }
    this.#searchResults.hidden = false;
    this.#searchInput.setAttribute("aria-expanded", "true");
  }

  #hideSearchResults(): void {
    this.#searchResults.hidden = true;
    this.#searchInput.setAttribute("aria-expanded", "false");
  }
}

const app = new ConstellationApp();
void app.openSeed();
