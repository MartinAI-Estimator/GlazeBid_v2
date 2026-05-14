/**
 * clipboard.ts — Module-level clipboard for shape copy/paste.
 * Shared between useCanvasEngine (keyboard shortcuts) and ShapeContextMenu (right-click).
 */
import type { DrawnShape } from '../types/shapes';

let _clipboard: DrawnShape | null = null;

export function getClipboard(): DrawnShape | null { return _clipboard; }
export function setClipboard(shape: DrawnShape | null): void { _clipboard = shape; }
export function hasClipboard(): boolean { return _clipboard !== null; }
