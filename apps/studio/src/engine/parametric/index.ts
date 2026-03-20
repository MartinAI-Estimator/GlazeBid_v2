/**
 * index.ts  —  Public surface of the parametric engine.
 *
 * All sub-modules (gridMath, rakeMath, edgeDetect, countMath) are re-exported
 * from here so consumers can import from a single path:
 *
 *   import { computeGridAssembly, buildEvenGrid } from '../engine/parametric';
 */

export * from './gridMath';
export * from './rakeMath';
export * from './edgeDetect';
export * from './countMath';
export * from './doorMath';
export * from './systemEngine';
export * from './archetypes';
export * from './bomGenerator';
