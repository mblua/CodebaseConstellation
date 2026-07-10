import * as THREE from "three";
import { BatchedText, Text } from "troika-three-text";
import fontUrl from "@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff?url";
import type { GraphDataset, LabelCandidate } from "../model";

interface LabelRecord {
  candidate: LabelCandidate;
  text: Text;
  worldPosition: THREE.Vector3;
  baseScore: number;
}

interface ScreenRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const MAX_LABELS = 200;

function overlaps(left: ScreenRect, right: ScreenRect): boolean {
  return !(
    left.right < right.left ||
    left.left > right.right ||
    left.bottom < right.top ||
    left.top > right.bottom
  );
}

function kindPriority(kind: string): number {
  switch (kind) {
    case "repository":
      return 12;
    case "package":
      return 9;
    case "directory":
      return 7;
    case "actor":
    case "action":
    case "concept":
      return 6;
    case "file":
      return 4;
    case "symbol":
      return 3;
    default:
      return 2;
  }
}

export class LabelManager {
  readonly batch = new BatchedText();
  #dataset: GraphDataset;
  #records: LabelRecord[];
  #selectionText: Text;
  #selectionNodeIndex: number | null = null;
  #selectionWorldPosition = new THREE.Vector3();
  #projection = new THREE.Vector3();

  constructor(scene: THREE.Scene, dataset: GraphDataset, candidates: LabelCandidate[]) {
    this.#dataset = dataset;
    this.batch.frustumCulled = false;
    this.batch.renderOrder = 10;
    const material = this.batch.material;
    material.depthTest = false;
    material.depthWrite = false;
    material.transparent = true;

    this.#records = candidates.slice(0, MAX_LABELS - 1).map((candidate) => {
      const index = candidate.nodeIndex;
      const coordinateOffset = index * 3;
      const radius = dataset.positions.radii[index] ?? 0.5;
      const text = new Text();
      text.text = candidate.name;
      text.font = fontUrl;
      text.fontSize = Math.min(0.34, Math.max(0.17, radius * 0.27));
      text.anchorX = "center";
      text.anchorY = "bottom";
      text.color = 0xdce9f7;
      text.fillOpacity = 0;
      text.maxWidth = 5.5;
      const worldPosition = new THREE.Vector3(
        dataset.positions.coordinates[coordinateOffset] ?? 0,
        (dataset.positions.coordinates[coordinateOffset + 1] ?? 0) + radius * 0.72,
        dataset.positions.coordinates[coordinateOffset + 2] ?? 0,
      );
      text.position.copy(worldPosition);
      this.batch.addText(text);
      return {
        candidate,
        text,
        worldPosition,
        baseScore: candidate.pageRank > 0
          ? 100 + candidate.pageRank * 1000
          : kindPriority(candidate.kind) + radius,
      };
    });
    this.#selectionText = new Text();
    this.#selectionText.text = "";
    this.#selectionText.font = fontUrl;
    this.#selectionText.fontSize = 0.28;
    this.#selectionText.anchorX = "center";
    this.#selectionText.anchorY = "bottom";
    this.#selectionText.color = 0xffffff;
    this.#selectionText.fillOpacity = 0;
    this.#selectionText.maxWidth = 18;
    this.batch.addText(this.#selectionText);
    this.batch.sync();
    scene.add(this.batch);
  }

  setSelection(nodeIndex: number | null, name = ""): void {
    this.#selectionNodeIndex = nodeIndex;
    this.#selectionText.text = nodeIndex === null ? "" : name;
    this.#selectionText.fillOpacity = 0;
    if (nodeIndex !== null) {
      const offset = nodeIndex * 3;
      const radius = this.#dataset.positions.radii[nodeIndex] ?? 0.5;
      this.#selectionWorldPosition.set(
        this.#dataset.positions.coordinates[offset] ?? 0,
        (this.#dataset.positions.coordinates[offset + 1] ?? 0) + radius * 0.72,
        this.#dataset.positions.coordinates[offset + 2] ?? 0,
      );
      this.#selectionText.fontSize = Math.min(0.34, Math.max(0.22, radius * 0.27));
      this.#selectionText.position.copy(this.#selectionWorldPosition);
    }
    this.batch.sync();
  }

  update(
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
    nodeAlpha: Float32Array,
    selectedNodeIndex: number | null,
  ): void {
    const selectionSlotActive =
      selectedNodeIndex !== null && this.#selectionNodeIndex === selectedNodeIndex;
    const occupied: ScreenRect[] = [];
    if (selectionSlotActive) {
      this.#projection.copy(this.#selectionWorldPosition).project(camera);
      const inView =
        this.#projection.z > -1 &&
        this.#projection.z < 1 &&
        this.#projection.x > -0.94 &&
        this.#projection.x < 0.94 &&
        this.#projection.y > -0.94 &&
        this.#projection.y < 0.94;
      const nodeVisible = (nodeAlpha[selectedNodeIndex] ?? 0) > 0;
      const show = inView && nodeVisible;
      const screenX = (this.#projection.x * 0.5 + 0.5) * width;
      const screenY = (-this.#projection.y * 0.5 + 0.5) * height;
      const widthPixels = Math.min(280, Math.max(42, this.#selectionText.text.length * 9.2));
      if (show) {
        occupied.push({
          left: screenX - widthPixels / 2 - 4,
          right: screenX + widthPixels / 2 + 4,
          top: screenY - 22,
          bottom: screenY + 5,
        });
      }
      const distance = camera.position.distanceTo(this.#selectionWorldPosition);
      this.#selectionText.fillOpacity = show ? 1 : 0;
      this.#selectionText.position.copy(this.#selectionWorldPosition);
      this.#selectionText.quaternion.copy(camera.quaternion);
      this.#selectionText.scale.setScalar(THREE.MathUtils.clamp(distance / 12, 1, 80));
      this.#selectionText.updateMatrix();
    } else {
      this.#selectionText.fillOpacity = 0;
    }

    const ranked = this.#records
      .map((record) => {
        this.#projection.copy(record.worldPosition).project(camera);
        const inView =
          this.#projection.z > -1 &&
          this.#projection.z < 1 &&
          this.#projection.x > -0.94 &&
          this.#projection.x < 0.94 &&
          this.#projection.y > -0.94 &&
          this.#projection.y < 0.94;
        const distance = camera.position.distanceTo(record.worldPosition);
        return {
          record,
          inView,
          screenX: (this.#projection.x * 0.5 + 0.5) * width,
          screenY: (-this.#projection.y * 0.5 + 0.5) * height,
          distance,
          score: !selectionSlotActive && record.candidate.nodeIndex === selectedNodeIndex
            ? Number.POSITIVE_INFINITY
            : record.baseScore / Math.max(distance, 0.25),
        };
      })
      .sort((left, right) => right.score - left.score);

    for (const entry of ranked) {
      const { record } = entry;
      const nodeVisible = (nodeAlpha[record.candidate.nodeIndex] ?? 0) > 0;
      const duplicateSelection =
        selectionSlotActive && record.candidate.nodeIndex === selectedNodeIndex;
      let show = entry.inView && nodeVisible && !duplicateSelection;
      const widthPixels = Math.min(280, Math.max(42, record.candidate.name.length * 9.2));
      const rectangle: ScreenRect = {
        left: entry.screenX - widthPixels / 2 - 4,
        right: entry.screenX + widthPixels / 2 + 4,
        top: entry.screenY - 20,
        bottom: entry.screenY + 5,
      };
      const selected = record.candidate.nodeIndex === selectedNodeIndex;
      if (show && !selected && occupied.some((candidate) => overlaps(rectangle, candidate))) {
        show = false;
      }
      if (show) occupied.push(rectangle);
      record.text.fillOpacity = show ? (selected ? 1 : 0.78) : 0;
      record.text.color = selected ? 0xffffff : 0xdce9f7;
      record.text.position.copy(record.worldPosition);
      record.text.quaternion.copy(camera.quaternion);
      record.text.scale.setScalar(selected ? THREE.MathUtils.clamp(entry.distance / 12, 1, 80) : 1);
      record.text.updateMatrix();
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.batch);
    for (const record of this.#records) record.text.dispose();
    this.#selectionText.dispose();
    this.batch.dispose();
    this.#records = [];
  }
}
