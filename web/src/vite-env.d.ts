/// <reference types="vite/client" />

declare module "troika-three-text" {
  import type { ColorRepresentation, Material, Mesh, Object3D, Vector3 } from "three";

  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    anchorX: number | string;
    anchorY: number | string;
    color: ColorRepresentation;
    fillOpacity: number;
    maxWidth: number;
    outlineWidth: number | string;
    outlineColor: ColorRepresentation;
    outlineOpacity: number;
    position: Vector3;
    sync(callback?: () => void): void;
    dispose(): void;
  }

  export class BatchedText extends Text {
    material: Material;
    frustumCulled: boolean;
    renderOrder: number;
    addText(text: Text): void;
    removeText(text: Text): void;
    add(...objects: Object3D[]): this;
    remove(...objects: Object3D[]): this;
  }
}
