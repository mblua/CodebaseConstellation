// A deterministic row pack in canonical child order.
//
// The trade-off, plainly (§7): a grid pack produces more edge crossings than a
// layered layout. It is chosen because it is deterministic, instant, diffable and
// predictable — and because the user moves nodes, and an engine that re-optimises
// on every change fights them.

import { CHILD_GAP, MAX_ROW_WIDTH } from '../geometry.ts';
import type { AutoLayout, PackItem, PackResult } from './port.ts';

export class GridPack implements AutoLayout {
  readonly id = 'grid-pack';
  private readonly gap: number;
  private readonly maxRowWidth: number;

  constructor(gap: number = CHILD_GAP, maxRowWidth: number = MAX_ROW_WIDTH) {
    this.gap = gap;
    this.maxRowWidth = maxRowWidth;
  }

  pack(items: readonly PackItem[]): PackResult {
    const offsets = new Map<string, { x: number; y: number }>();
    if (items.length === 0) return { offsets, width: 0, height: 0 };

    // Aim for a roughly square block, then wrap on width. Both bounds are fixed
    // constants, so the result depends only on the items and their order.
    const targetColumns = Math.max(1, Math.ceil(Math.sqrt(items.length)));

    let rowStart = 0;
    let cursorX = 0;
    let cursorY = 0;
    let rowHeight = 0;
    let width = 0;
    let columnsInRow = 0;

    const endRow = (): void => {
      width = Math.max(width, cursorX - (columnsInRow > 0 ? this.gap : 0));
      cursorY += rowHeight + this.gap;
      cursorX = 0;
      rowHeight = 0;
      columnsInRow = 0;
      rowStart += 1;
    };

    for (const item of items) {
      const wouldExceedWidth = columnsInRow > 0 && cursorX + item.size.w > this.maxRowWidth;
      const wouldExceedColumns = columnsInRow >= targetColumns;
      if (wouldExceedWidth || wouldExceedColumns) endRow();

      offsets.set(item.id, { x: cursorX, y: cursorY });
      cursorX += item.size.w + this.gap;
      columnsInRow += 1;
      rowHeight = Math.max(rowHeight, item.size.h);
    }

    width = Math.max(width, cursorX - (columnsInRow > 0 ? this.gap : 0));
    const height = cursorY + rowHeight;

    void rowStart;
    return { offsets, width: Math.max(0, width), height: Math.max(0, height) };
  }
}
