// AutoLayout is a port (§7). v1 implements it with `gridPack`; `elkjs` behind
// this interface is the deferred upgrade, and swapping it touches nothing else.

import type { Size } from '../geometry.ts';

export interface PackItem {
  id: string;
  size: Size;
}

export interface PackResult {
  /** Top-left offset of each item, relative to the content origin. */
  offsets: ReadonlyMap<string, { x: number; y: number }>;
  /** Extent of the packed content. */
  width: number;
  height: number;
}

export interface AutoLayout {
  readonly id: string;
  /** Deterministic: the same items in the same order always pack the same way. */
  pack(items: readonly PackItem[]): PackResult;
}
