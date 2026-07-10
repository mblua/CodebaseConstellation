import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  BlendFunction,
  EffectComposer,
  EffectPass,
  RenderPass,
  SelectiveBloomEffect,
} from "postprocessing";
import type { ComputedRenderState, FilterState } from "../filterState";
import {
  clippingPlanesForSphere,
  fitDistanceForSphere,
  selectFocusNeighbors,
} from "../cameraMath";
import {
  EDGE_LAYER_COLOR,
  layerForEdgeCategory,
  NODE_STYLE,
  type GraphDataset,
  type LabelCandidate,
} from "../model";
import { LabelManager } from "./LabelManager";

const NODE_VERTEX_SHADER = `
  attribute float aRadius;
  attribute vec3 aColor;
  attribute float aShape;
  attribute float aAlpha;
  attribute float aState;
  attribute float aDiagnostic;
  uniform float uPointScale;
  varying vec3 vColor;
  varying float vShape;
  varying float vAlpha;
  varying float vState;
  varying float vDiagnostic;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float emphasis = aState > 2.5 ? 1.65 : (aState > 1.5 ? 1.28 : (aDiagnostic > 0.5 ? 1.38 : 1.0));
    float minimumSize = aState > 2.5 ? 11.0 : (aState > 1.5 ? 7.0 : (aDiagnostic > 0.5 ? 8.0 : 3.0));
    gl_PointSize = aAlpha <= 0.0
      ? 0.0
      : clamp(aRadius * uPointScale * emphasis / max(0.1, -viewPosition.z), minimumSize, 46.0);
    gl_Position = projectionMatrix * viewPosition;
    vColor = aColor;
    vShape = aShape;
    vAlpha = aAlpha;
    vState = aState;
    vDiagnostic = aDiagnostic;
  }
`;

const SHAPE_GLSL = `
  float shapeMask(float shape, vec2 point) {
    float softness = 0.075;
    if (shape < 1.5) {
      return 1.0 - smoothstep(0.86, 1.0, length(point));
    }
    if (shape < 2.5) {
      float distance = max(abs(point.x), abs(point.y));
      return 1.0 - smoothstep(0.84, 1.0, distance);
    }
    if (shape < 3.5) {
      float edge = (0.82 - point.y) * 0.64;
      float inside = step(-0.78, point.y) * step(abs(point.x), edge);
      float border = smoothstep(0.0, softness, edge - abs(point.x));
      return inside * border;
    }
    if (shape < 4.5) {
      float distance = abs(point.x) + abs(point.y);
      return 1.0 - smoothstep(0.88, 1.02, distance);
    }
    if (shape < 5.5) {
      vec2 p = abs(point);
      float distance = max(p.y, p.x * 0.866025 + p.y * 0.5);
      return 1.0 - smoothstep(0.84, 0.98, distance);
    }
    if (shape < 6.5) {
      float radius = length(point);
      float outer = 1.0 - smoothstep(0.88, 1.0, radius);
      float inner = smoothstep(0.43, 0.58, radius);
      return outer * inner;
    }
    if (shape < 7.5) {
      float square = 1.0 - smoothstep(0.84, 0.98, max(abs(point.x), abs(point.y)));
      float fold = step(0.35, point.x) * step(0.35, point.y) * step(1.02, point.x + point.y);
      return square * (1.0 - fold);
    }
    float body = 1.0 - smoothstep(0.84, 1.0, max(abs(point.x) * 0.82, abs(point.y)));
    float band = 0.78 + 0.22 * step(0.14, abs(point.y));
    return body * band;
  }
`;

const NODE_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vShape;
  varying float vAlpha;
  varying float vState;
  varying float vDiagnostic;
  ${SHAPE_GLSL}

  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float bodyMask = shapeMask(vShape, vDiagnostic > 0.5 ? point * 1.18 : point);
    float diagnosticMask = 0.0;
    vec3 diagnosticColor = vec3(1.0);
    if (vDiagnostic > 0.5 && vDiagnostic < 1.5) {
      float radius = length(point);
      diagnosticMask = smoothstep(0.60, 0.70, radius) * (1.0 - smoothstep(0.86, 0.96, radius));
      diagnosticColor = vec3(1.0, 0.35, 0.58);
    } else if (vDiagnostic >= 1.5 && vDiagnostic < 2.5) {
      float cross = max(
        1.0 - smoothstep(0.10, 0.19, abs(point.x)),
        1.0 - smoothstep(0.10, 0.19, abs(point.y))
      );
      diagnosticMask = cross * (1.0 - smoothstep(0.78, 0.96, length(point)));
      diagnosticColor = vec3(0.26, 0.83, 0.95);
    } else if (vDiagnostic >= 2.5) {
      float diamond = abs(point.x) + abs(point.y);
      diagnosticMask = smoothstep(0.69, 0.79, diamond) * (1.0 - smoothstep(0.94, 1.06, diamond));
      diagnosticColor = vec3(1.0, 0.72, 0.28);
    }
    float mask = max(bodyMask, diagnosticMask);
    if (mask < 0.02 || vAlpha <= 0.0) discard;
    float dimming = vState < 0.8 ? max(0.25, vState) : 1.0;
    float energy = vState > 2.5 ? 2.5 : (vState > 1.5 ? 1.55 : 1.0);
    float diagnosticMix = vDiagnostic > 0.5 ? (diagnosticMask > bodyMask ? 0.98 : 0.72) : 0.0;
    vec3 participantColor = mix(vColor, diagnosticColor, diagnosticMix);
    vec3 color = mix(participantColor, vec3(1.0), vState > 2.5 ? 0.38 : 0.0);
    gl_FragColor = vec4(color * energy, mask * vAlpha * dimming);
  }
`;

const PICK_VERTEX_SHADER = `
  attribute float aRadius;
  attribute float aShape;
  attribute float aAlpha;
  attribute vec3 aPickColor;
  uniform float uPointScale;
  varying float vShape;
  varying float vAlpha;
  varying vec3 vPickColor;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aAlpha <= 0.0
      ? 0.0
      : clamp(aRadius * uPointScale * 1.45 / max(0.1, -viewPosition.z), 5.0, 52.0);
    gl_Position = projectionMatrix * viewPosition;
    vShape = aShape;
    vAlpha = aAlpha;
    vPickColor = aPickColor;
  }
`;

const PICK_FRAGMENT_SHADER = `
  varying float vShape;
  varying float vAlpha;
  varying vec3 vPickColor;
  ${SHAPE_GLSL}

  void main() {
    if (vAlpha <= 0.0 || shapeMask(vShape, gl_PointCoord * 2.0 - 1.0) < 0.02) discard;
    gl_FragColor = vec4(vPickColor, 1.0);
  }
`;

const EDGE_VERTEX_SHADER = `
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EDGE_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.0) discard;
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

export interface RendererStats {
  visibleNodes: number;
  visibleEdges: number;
}

export class GraphRenderer {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  #container: HTMLElement;
  #dataset: GraphDataset;
  #scene = new THREE.Scene();
  #pickingScene = new THREE.Scene();
  #renderer: THREE.WebGLRenderer;
  #composer: EffectComposer;
  #nodeGeometry: THREE.BufferGeometry;
  #edgeGeometry: THREE.BufferGeometry;
  #nodeMaterial: THREE.ShaderMaterial;
  #edgeMaterial: THREE.ShaderMaterial;
  #pickMaterial: THREE.ShaderMaterial;
  #nodes: THREE.Points;
  #edges: THREE.LineSegments;
  #pickingNodes: THREE.Points;
  #pickingTarget: THREE.WebGLRenderTarget;
  #labelManager: LabelManager;
  #resizeObserver: ResizeObserver;
  #animationFrame = 0;
  #lastFrameTime = performance.now();
  #frame = 0;
  #renderState: ComputedRenderState;
  #filterState: FilterState;
  #onSelection: (nodeIndex: number | null) => void;
  #pointerStart: { x: number; y: number } | null = null;
  #pixel = new Uint8Array(4);
  #drawingSize = new THREE.Vector2();
  #disposed = false;

  constructor(
    container: HTMLElement,
    dataset: GraphDataset,
    labels: LabelCandidate[],
    filterState: FilterState,
    renderState: ComputedRenderState,
    onSelection: (nodeIndex: number | null) => void,
  ) {
    this.#container = container;
    this.#dataset = dataset;
    this.#filterState = filterState;
    this.#renderState = renderState;
    this.#onSelection = onSelection;
    this.#scene.background = new THREE.Color(0x071019);
    this.#pickingScene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.02, 5000);
    this.camera.position.set(0, -26, 24);
    this.camera.up.set(0, 0, 1);

    try {
      this.#renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch (error) {
      throw new Error(
        `WebGL renderer could not start: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 0.95;
    this.#renderer.domElement.className = "graph-canvas";
    this.#renderer.domElement.setAttribute("aria-label", "Interactive 3D architecture graph");
    this.#renderer.domElement.tabIndex = 0;
    container.prepend(this.#renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.#renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 800;

    this.#nodeGeometry = this.#createNodeGeometry();
    this.#nodeMaterial = new THREE.ShaderMaterial({
      uniforms: { uPointScale: { value: 1 } },
      vertexShader: NODE_VERTEX_SHADER,
      fragmentShader: NODE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.#nodes = new THREE.Points(this.#nodeGeometry, this.#nodeMaterial);
    this.#nodes.frustumCulled = false;
    this.#nodes.renderOrder = 2;
    this.#scene.add(this.#nodes);

    this.#edgeGeometry = this.#createEdgeGeometry();
    this.#edgeMaterial = new THREE.ShaderMaterial({
      vertexShader: EDGE_VERTEX_SHADER,
      fragmentShader: EDGE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.#edges = new THREE.LineSegments(this.#edgeGeometry, this.#edgeMaterial);
    this.#edges.frustumCulled = false;
    this.#edges.renderOrder = 1;
    this.#scene.add(this.#edges);

    this.#pickMaterial = new THREE.ShaderMaterial({
      uniforms: { uPointScale: { value: 1 } },
      vertexShader: PICK_VERTEX_SHADER,
      fragmentShader: PICK_FRAGMENT_SHADER,
      depthWrite: true,
      depthTest: true,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    this.#pickingNodes = new THREE.Points(this.#nodeGeometry, this.#pickMaterial);
    this.#pickingNodes.frustumCulled = false;
    this.#pickingScene.add(this.#pickingNodes);

    this.#pickingTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.#pickingTarget.texture.colorSpace = THREE.NoColorSpace;

    this.#composer = new EffectComposer(this.#renderer, {
      frameBufferType: THREE.HalfFloatType,
    });
    this.#composer.addPass(new RenderPass(this.#scene, this.camera));
    const bloom = new SelectiveBloomEffect(this.#scene, this.camera, {
      blendFunction: BlendFunction.ADD,
      intensity: 0.72,
      luminanceThreshold: 0.72,
      luminanceSmoothing: 0.22,
      mipmapBlur: true,
      radius: 0.58,
    });
    bloom.ignoreBackground = true;
    bloom.selection.add(this.#nodes);
    this.#composer.addPass(new EffectPass(this.camera, bloom));

    this.#labelManager = new LabelManager(this.#scene, dataset, labels);
    this.applyRenderState(filterState, renderState);
    this.#resizeObserver = new ResizeObserver(() => this.#resize());
    this.#resizeObserver.observe(container);
    this.#renderer.domElement.addEventListener("pointerdown", this.#handlePointerDown);
    this.#renderer.domElement.addEventListener("pointerup", this.#handlePointerUp);
    this.#resize();
    this.fitVisible();
    this.#animate();
  }

  #createNodeGeometry(): THREE.BufferGeometry {
    const nodeCount = this.#dataset.positions.nodeIds.length;
    const colors = new Float32Array(nodeCount * 3);
    const shapes = new Float32Array(nodeCount);
    const pickColors = new Float32Array(nodeCount * 3);
    const alpha = new Float32Array(nodeCount);
    const state = new Float32Array(nodeCount);
    const diagnostic = new Float32Array(nodeCount);
    const kindByCode = new Map(this.#dataset.nodeKinds.map((kind) => [kind.renderCode, kind.key]));
    const color = new THREE.Color();

    for (let index = 0; index < nodeCount; index += 1) {
      const kind = kindByCode.get(this.#dataset.positions.kindCodes[index] ?? 0) ?? "symbol";
      const style = NODE_STYLE[kind] ?? NODE_STYLE.symbol;
      color.set(style?.color ?? "#b8a1ff");
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
      shapes[index] = style?.shape ?? 1;

      const pickId = index + 1;
      pickColors[index * 3] = (pickId & 0xff) / 255;
      pickColors[index * 3 + 1] = ((pickId >> 8) & 0xff) / 255;
      pickColors[index * 3 + 2] = ((pickId >> 16) & 0xff) / 255;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.#dataset.positions.coordinates, 3));
    geometry.setAttribute("aRadius", new THREE.BufferAttribute(this.#dataset.positions.radii, 1));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aShape", new THREE.BufferAttribute(shapes, 1));
    geometry.setAttribute("aPickColor", new THREE.BufferAttribute(pickColors, 3));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aState", new THREE.BufferAttribute(state, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aDiagnostic", new THREE.BufferAttribute(diagnostic, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.computeBoundingSphere();
    return geometry;
  }

  #createEdgeGeometry(): THREE.BufferGeometry {
    const edgeCount = this.#dataset.edges.edgeIds.length;
    const positions = new Float32Array(edgeCount * 6);
    const colors = new Float32Array(edgeCount * 6);
    const alpha = new Float32Array(edgeCount * 2);
    const kindByCode = new Map(this.#dataset.edgeKinds.map((kind) => [kind.renderCode, kind]));
    const color = new THREE.Color();

    for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
      const sourceIndex = this.#dataset.edges.sourceIndices[edgeIndex] ?? 0;
      const targetIndex = this.#dataset.edges.targetIndices[edgeIndex] ?? 0;
      const sourceOffset = sourceIndex * 3;
      const targetOffset = targetIndex * 3;
      const edgeOffset = edgeIndex * 6;
      positions[edgeOffset] = this.#dataset.positions.coordinates[sourceOffset] ?? 0;
      positions[edgeOffset + 1] = this.#dataset.positions.coordinates[sourceOffset + 1] ?? 0;
      positions[edgeOffset + 2] = this.#dataset.positions.coordinates[sourceOffset + 2] ?? 0;
      positions[edgeOffset + 3] = this.#dataset.positions.coordinates[targetOffset] ?? 0;
      positions[edgeOffset + 4] = this.#dataset.positions.coordinates[targetOffset + 1] ?? 0;
      positions[edgeOffset + 5] = this.#dataset.positions.coordinates[targetOffset + 2] ?? 0;

      const kind = kindByCode.get(this.#dataset.edges.kindCodes[edgeIndex] ?? 0);
      const layer = kind ? layerForEdgeCategory(kind.category) : null;
      color.set(layer ? EDGE_LAYER_COLOR[layer] : "#637083");
      colors[edgeOffset] = color.r;
      colors[edgeOffset + 1] = color.g;
      colors[edgeOffset + 2] = color.b;
      colors[edgeOffset + 3] = color.r;
      colors[edgeOffset + 4] = color.g;
      colors[edgeOffset + 5] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.computeBoundingSphere();
    return geometry;
  }

  applyRenderState(filterState: FilterState, renderState: ComputedRenderState): RendererStats {
    this.#filterState = filterState;
    this.#renderState = renderState;
    const nodeAlpha = this.#nodeGeometry.getAttribute("aAlpha") as THREE.BufferAttribute;
    const nodeState = this.#nodeGeometry.getAttribute("aState") as THREE.BufferAttribute;
    const nodeDiagnostic = this.#nodeGeometry.getAttribute("aDiagnostic") as THREE.BufferAttribute;
    (nodeAlpha.array as Float32Array).set(renderState.nodeAlpha);
    (nodeState.array as Float32Array).set(renderState.nodeState);
    (nodeDiagnostic.array as Float32Array).set(renderState.nodeDiagnostic);
    nodeAlpha.needsUpdate = true;
    nodeState.needsUpdate = true;
    nodeDiagnostic.needsUpdate = true;

    const edgeAlpha = this.#edgeGeometry.getAttribute("aAlpha") as THREE.BufferAttribute;
    const edgeArray = edgeAlpha.array as Float32Array;
    for (let edgeIndex = 0; edgeIndex < renderState.edgeAlpha.length; edgeIndex += 1) {
      const value = renderState.edgeAlpha[edgeIndex] ?? 0;
      edgeArray[edgeIndex * 2] = value;
      edgeArray[edgeIndex * 2 + 1] = value;
    }
    edgeAlpha.needsUpdate = true;
    return {
      visibleNodes: renderState.visibleNodeCount,
      visibleEdges: renderState.visibleEdgeCount,
    };
  }

  setSelectionLabel(nodeIndex: number | null, name = ""): void {
    this.#labelManager.setSelection(nodeIndex, name);
  }

  fitVisible(): void {
    const box = new THREE.Box3();
    const point = new THREE.Vector3();
    let included = 0;
    for (let index = 0; index < this.#dataset.positions.nodeIds.length; index += 1) {
      if ((this.#renderState.nodeAlpha[index] ?? 0) <= 0) continue;
      const offset = index * 3;
      point.set(
        this.#dataset.positions.coordinates[offset] ?? 0,
        this.#dataset.positions.coordinates[offset + 1] ?? 0,
        this.#dataset.positions.coordinates[offset + 2] ?? 0,
      );
      box.expandByPoint(point);
      included += 1;
    }
    if (included === 0) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center;
    const radius = Math.max(sphere.radius, 0.5);
    const distance = fitDistanceForSphere(radius, this.camera.fov, this.camera.aspect, 1.15);
    const direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < 0.001) direction.set(0.45, -0.75, 0.48);
    direction.normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.#setCameraRange(distance, radius);
    this.controls.update();
    this.#publishCameraDiagnostics("fit", null);
  }

  focusNode(nodeIndex: number): void {
    if (nodeIndex < 0 || nodeIndex >= this.#dataset.positions.nodeIds.length) return;
    const offset = nodeIndex * 3;
    const target = new THREE.Vector3(
      this.#dataset.positions.coordinates[offset] ?? 0,
      this.#dataset.positions.coordinates[offset + 1] ?? 0,
      this.#dataset.positions.coordinates[offset + 2] ?? 0,
    );
    const direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < 0.001) direction.set(0.45, -0.75, 0.48);
    direction.normalize();
    const nodeRadius = this.#dataset.positions.radii[nodeIndex] ?? 0.5;
    const candidates = [...this.#renderState.neighbors].flatMap((neighborIndex) => {
      if ((this.#renderState.nodeAlpha[neighborIndex] ?? 0) <= 0) return [];
      const neighborOffset = neighborIndex * 3;
      const neighborPosition = new THREE.Vector3(
        this.#dataset.positions.coordinates[neighborOffset] ?? 0,
        this.#dataset.positions.coordinates[neighborOffset + 1] ?? 0,
        this.#dataset.positions.coordinates[neighborOffset + 2] ?? 0,
      );
      return [{
        index: neighborIndex,
        distance: target.distanceTo(neighborPosition),
      }];
    });
    const focusNeighbors = selectFocusNeighbors(candidates);
    let focusRadius = Math.max(0.5, nodeRadius * 2);
    for (const neighbor of focusNeighbors) {
      focusRadius = Math.max(
        focusRadius,
        neighbor.distance + (this.#dataset.positions.radii[neighbor.index] ?? 0.5),
      );
    }
    const distance = Math.max(
      4.5,
      fitDistanceForSphere(focusRadius, this.camera.fov, this.camera.aspect, 1.18),
    );
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(direction, distance);
    this.#setCameraRange(distance, focusRadius);
    this.controls.update();
    this.#publishCameraDiagnostics(
      "focus",
      nodeIndex,
      [nodeIndex, ...focusNeighbors.map((neighbor) => neighbor.index)],
      focusNeighbors.length,
    );
  }

  #setCameraRange(distance: number, radius: number): void {
    const planes = clippingPlanesForSphere(distance, radius);
    this.camera.near = planes.near;
    this.camera.far = planes.far;
    this.controls.maxDistance = Math.max(800, distance * 4);
    this.camera.updateProjectionMatrix();
  }

  #publishCameraDiagnostics(
    mode: "fit" | "focus",
    selectedNodeIndex: number | null,
    framedIndices?: readonly number[],
    focusNeighborCount = 0,
  ): void {
    this.camera.updateMatrixWorld(true);
    const canvas = this.#renderer.domElement;
    const indexes = framedIndices ?? Array.from(
      { length: this.#dataset.positions.nodeIds.length },
      (_, index) => index,
    ).filter((index) => (this.#renderState.nodeAlpha[index] ?? 0) > 0);
    const projected = new THREE.Vector3();
    let minimumX = Number.POSITIVE_INFINITY;
    let maximumX = Number.NEGATIVE_INFINITY;
    let minimumY = Number.POSITIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;
    let inView = 0;
    for (const index of indexes) {
      const offset = index * 3;
      projected.set(
        this.#dataset.positions.coordinates[offset] ?? 0,
        this.#dataset.positions.coordinates[offset + 1] ?? 0,
        this.#dataset.positions.coordinates[offset + 2] ?? 0,
      ).project(this.camera);
      if (![projected.x, projected.y, projected.z].every(Number.isFinite)) continue;
      minimumX = Math.min(minimumX, projected.x);
      maximumX = Math.max(maximumX, projected.x);
      minimumY = Math.min(minimumY, projected.y);
      maximumY = Math.max(maximumY, projected.y);
      if (
        projected.x >= -1 && projected.x <= 1 &&
        projected.y >= -1 && projected.y <= 1 &&
        projected.z >= -1 && projected.z <= 1
      ) inView += 1;
    }
    const cameraDistance = this.camera.position.distanceTo(this.controls.target);
    canvas.dataset.cameraMode = mode;
    canvas.dataset.cameraNear = this.camera.near.toFixed(6);
    canvas.dataset.cameraFar = this.camera.far.toFixed(6);
    canvas.dataset.cameraDistance = cameraDistance.toFixed(6);
    canvas.dataset.framedNodeCount = String(indexes.length);
    canvas.dataset.framedInViewCount = String(inView);
    canvas.dataset.frameWidth = Number.isFinite(minimumX) ? (maximumX - minimumX).toFixed(6) : "0";
    canvas.dataset.frameHeight = Number.isFinite(minimumY) ? (maximumY - minimumY).toFixed(6) : "0";
    canvas.dataset.focusNeighborCount = String(focusNeighborCount);

    if (selectedNodeIndex === null) {
      delete canvas.dataset.selectedNdcX;
      delete canvas.dataset.selectedNdcY;
      delete canvas.dataset.selectedNdcZ;
      delete canvas.dataset.selectedDistance;
      return;
    }
    const selectedOffset = selectedNodeIndex * 3;
    const selectedPosition = new THREE.Vector3(
      this.#dataset.positions.coordinates[selectedOffset] ?? 0,
      this.#dataset.positions.coordinates[selectedOffset + 1] ?? 0,
      this.#dataset.positions.coordinates[selectedOffset + 2] ?? 0,
    );
    projected.copy(selectedPosition).project(this.camera);
    canvas.dataset.selectedNdcX = projected.x.toFixed(6);
    canvas.dataset.selectedNdcY = projected.y.toFixed(6);
    canvas.dataset.selectedNdcZ = projected.z.toFixed(6);
    canvas.dataset.selectedDistance = this.camera.position.distanceTo(selectedPosition).toFixed(6);
  }

  #resize(): void {
    if (this.#disposed) return;
    const width = Math.max(1, this.#container.clientWidth);
    const height = Math.max(1, this.#container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.#renderer.setSize(width, height, false);
    this.#composer.setSize(width, height);
    this.#renderer.getDrawingBufferSize(this.#drawingSize);
    this.#pickingTarget.setSize(this.#drawingSize.x, this.#drawingSize.y);
    const pointScale = this.#drawingSize.y / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)));
    this.#nodeMaterial.uniforms.uPointScale!.value = pointScale;
    this.#pickMaterial.uniforms.uPointScale!.value = pointScale;
  }

  #handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.#pointerStart = { x: event.clientX, y: event.clientY };
  };

  #handlePointerUp = (event: PointerEvent): void => {
    if (!this.#pointerStart || event.button !== 0) return;
    const distance = Math.hypot(
      event.clientX - this.#pointerStart.x,
      event.clientY - this.#pointerStart.y,
    );
    this.#pointerStart = null;
    if (distance > 4) return;
    this.#onSelection(this.#pick(event.clientX, event.clientY));
  };

  #pick(clientX: number, clientY: number): number | null {
    const rectangle = this.#renderer.domElement.getBoundingClientRect();
    if (
      clientX < rectangle.left ||
      clientX > rectangle.right ||
      clientY < rectangle.top ||
      clientY > rectangle.bottom
    ) return null;
    this.#renderer.getDrawingBufferSize(this.#drawingSize);
    const x = Math.min(
      this.#drawingSize.x - 1,
      Math.max(0, Math.floor(((clientX - rectangle.left) / rectangle.width) * this.#drawingSize.x)),
    );
    const y = Math.min(
      this.#drawingSize.y - 1,
      Math.max(0, Math.floor(((rectangle.bottom - clientY) / rectangle.height) * this.#drawingSize.y)),
    );
    const previousTarget = this.#renderer.getRenderTarget();
    this.#renderer.setRenderTarget(this.#pickingTarget);
    this.#renderer.setClearColor(0x000000, 1);
    this.#renderer.clear();
    this.#renderer.render(this.#pickingScene, this.camera);
    this.#renderer.readRenderTargetPixels(this.#pickingTarget, x, y, 1, 1, this.#pixel);
    this.#renderer.setRenderTarget(previousTarget);
    const pickId = (this.#pixel[0] ?? 0) + ((this.#pixel[1] ?? 0) << 8) + ((this.#pixel[2] ?? 0) << 16);
    if (pickId === 0 || pickId > this.#dataset.positions.nodeIds.length) return null;
    return pickId - 1;
  }

  #animate = (): void => {
    if (this.#disposed) return;
    this.#animationFrame = requestAnimationFrame(this.#animate);
    this.controls.update();
    this.#frame += 1;
    if (this.#frame % 4 === 0) {
      this.#labelManager.update(
        this.camera,
        this.#container.clientWidth,
        this.#container.clientHeight,
        this.#renderState.nodeAlpha,
        this.#filterState.selectedNodeIndex,
      );
    }
    const frameTime = performance.now();
    const deltaSeconds = Math.min(0.1, Math.max(0, (frameTime - this.#lastFrameTime) / 1000));
    this.#lastFrameTime = frameTime;
    this.#composer.render(deltaSeconds);
  };

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    cancelAnimationFrame(this.#animationFrame);
    this.#resizeObserver.disconnect();
    this.#renderer.domElement.removeEventListener("pointerdown", this.#handlePointerDown);
    this.#renderer.domElement.removeEventListener("pointerup", this.#handlePointerUp);
    this.controls.dispose();
    this.#labelManager.dispose(this.#scene);
    this.#nodeGeometry.dispose();
    this.#edgeGeometry.dispose();
    this.#nodeMaterial.dispose();
    this.#edgeMaterial.dispose();
    this.#pickMaterial.dispose();
    this.#pickingTarget.dispose();
    this.#composer.dispose();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }
}
