/**
 * pdfTileManager.ts
 *
 * Manages high-resolution PDF page tiles rendered via PDF.js.
 *
 * ── Why tiles? ────────────────────────────────────────────────────────────────
 * At 10 000% zoom a page pixel maps to 100 screen pixels.  Rendering the PDF
 * at its native 72 DPI would produce a blurry upscaled image.  Instead, we
 * re-render the PDF at a higher "bucket" scale factor so the tile has more
 * source pixels, keeping text and lines crisp.
 *
 * ── Quality buckets ───────────────────────────────────────────────────────────
 * Bucket 1  → PDF scale 1   (  72 DPI) — zoom ≤ 1.5 × DPR
 * Bucket 2  → PDF scale 2   ( 144 DPI) — zoom ≤   3 × DPR
 * Bucket 4  → PDF scale 4   ( 288 DPI) — zoom ≤   6 × DPR
 * Bucket 8  → PDF scale 8   ( 576 DPI) — zoom ≤  12 × DPR
 * Bucket 16 → PDF scale 16  (1152 DPI) — zoom  >  12 × DPR
 *
 * ── Coordinate contract ───────────────────────────────────────────────────────
 * The caller (renderEngine.ts) always draws the tile as:
 *   ctx.drawImage(tile, 0, 0, page.widthPx, page.heightPx)
 * i.e. stretched back to PAGE-SPACE dimensions.  The camera transform then
 * maps page → screen.  This means the caller never needs to know the bucket.
 *
 * ── Thread safety ────────────────────────────────────────────────────────────
 * renderTile() is async but safe: `rendering` tracks in-flight keys so we
 * never double-render the same bucket.  The onTileReady callback triggers a
 * canvas redraw when the background render completes.
 */

import type { PDFPageProxy } from 'pdfjs-dist';

// ── Shared constants ──────────────────────────────────────────────────────────

/** Maximum pixel dimension for any single canvas axis (GPU safety limit). */
const MAX_TILE_DIM = 16_384;

// ── TileResult ────────────────────────────────────────────────────────────────

/**
 * Result of getTile().  Full-page tiles have no `region`; viewport tiles
 * carry the page-space rectangle they cover so renderEngine draws them at the
 * exact right position.
 */
export interface TileResult {
  bitmap: ImageBitmap;
  /**
   * For viewport tiles: the page-space rect this bitmap covers.
   *   ctx.drawImage(bitmap, region.x, region.y, region.w, region.h)
   * Absent for full-page tiles (drawn as 0, 0, pageW, pageH).
   */
  region?: Readonly<{ x: number; y: number; w: number; h: number }>;
}

// ── Quality bucket lookup ─────────────────────────────────────────────────────

/**
 * Return the render scale (bucket) needed to keep the PDF sharp at the given
 * camera zoom × device pixel ratio.
 */
function getTileBucket(cameraScale: number, dpr: number): number {
  const needed = cameraScale * dpr;
  if (needed <= 1.5) return 1;
  if (needed <= 3)   return 2;
  if (needed <= 6)   return 4;
  if (needed <= 12)  return 8;
  return 16;
}

// ── PdfTileManager ────────────────────────────────────────────────────────────

export class PdfTileManager {
  // ── Full-page tiles (low / medium zoom) ─────────────────────────────────
  private tiles     = new Map<string, ImageBitmap>();
  private rendering = new Set<string>();
  /** Permanently-failed full-page keys — prevents infinite OOM retry loops. */
  private failed    = new Set<string>();

  // ── Viewport tiles (high zoom) ───────────────────────────────────────────
  // At high zoom the full page would exceed GPU texture limits, so we render
  // only the visible screen region at the exact camera scale instead.
  private vpTiles     = new Map<string, TileResult>();
  private vpRendering = new Set<string>();
  private vpFailed    = new Set<string>();
  /** Native 1× page dimensions, populated when each proxy is registered. */
  private pageDimensions = new Map<string, { w: number; h: number }>();

  /** Maximum viewport-tile cache entries (LRU by Map insertion order). */
  private static readonly VP_CACHE_MAX = 12;

  /** PDFPageProxy per pageId. */
  private proxies = new Map<string, PDFPageProxy>();
  /** Called after any background render completes. */
  private onReady: (() => void) | null = null;

  setOnTileReady(cb: () => void): void {
    this.onReady = cb;
  }

  /** Register a page proxy so getTile() can render on demand. */
  setPageProxy(pageId: string, proxy: PDFPageProxy): void {
    this.proxies.set(pageId, proxy);
    // Cache 1× dimensions for viewport-tile threshold calculation.
    const vp = proxy.getViewport({ scale: 1 });
    this.pageDimensions.set(pageId, { w: vp.width, h: vp.height });
  }

  /**
   * Return the best available tile for (pageId, cameraScale).
   *
   * - If the ideal-quality tile is cached, return it immediately.
   * - If not, schedule an async render and return the best lower-quality
   *   tile we have (or `null` if nothing is cached yet).
   *
   * The caller should pass the result to renderEngine as `pdfTile`.
   */
  /**
   * Return the best available tile for (pageId, camera).
   *
   * ─ Full-page mode (low/medium zoom) ────────────────────────────
   * Renders the entire PDF page at a quality bucket (1×, 2×, 4×, 8×).
   * TileResult.region is absent; renderEngine stretches it to full page dims.
   *
   * ─ Viewport tile mode (high zoom) ──────────────────────────
   * When cameraScale×DPR exceeds MAX_TILE_DIM/pageWidth (the point where a
   * full-page tile would exceed GPU limits), we render only the visible screen
   * region at the exact render scale.  The canvas is always ≈screen-sized.
   * TileResult.region carries the page-space rect; renderEngine draws:
   *   ctx.drawImage(bitmap, region.x, region.y, region.w, region.h)
   * With the camera transform applied this maps tile pixels 1:1 to screen.
   */
  getTile(
    pageId:      string,
    cameraScale: number,
    dpr:         number,
    viewport?:   { x: number; y: number; w: number; h: number },
  ): TileResult | null {
    // Switch to viewport tiles when a full-page tile would exceed GPU limits.
    const dims         = this.pageDimensions.get(pageId);
    const maxFullScale = dims ? MAX_TILE_DIM / Math.max(dims.w, dims.h) : Infinity;

    if (cameraScale * dpr > maxFullScale && viewport) {
      return this.getViewportTileResult(pageId, cameraScale, dpr, viewport);
    }

    // ── Full-page tile path ─────────────────────────────────────────
    const bucket   = getTileBucket(cameraScale, dpr);
    const idealKey = `${pageId}:${bucket}`;

    if (this.tiles.has(idealKey)) return { bitmap: this.tiles.get(idealKey)! };

    if (!this.rendering.has(idealKey) && !this.failed.has(idealKey)) {
      console.log('[TileManager] cache miss — scheduling render:', idealKey,
        '| proxies registered:', this.proxies.size,
        '| has proxy:', this.proxies.has(pageId));
      void this.renderTile(pageId, bucket);
    }

    for (const b of [1, 2, 4, 8] as const) {
      if (b >= bucket) break;
      const bm = this.tiles.get(`${pageId}:${b}`);
      if (bm) return { bitmap: bm };
    }
    for (const b of [16, 8, 4, 2, 1] as const) {
      if (b <= bucket) break;
      const bm = this.tiles.get(`${pageId}:${b}`);
      if (bm) return { bitmap: bm };
    }
    return null;
  }

  /** Pre-warm the 1× tile for a page immediately (used when PDF first loads). */
  async preWarm(pageId: string): Promise<void> {
    return this.renderTile(pageId, 1);
  }

  // ── Viewport tile helpers (high zoom) ────────────────────────────────

  /**
   * Return a viewport tile for the visible page region at the exact render
   * scale.  The tile canvas is always ≈screen-sized regardless of zoom level.
   */
  private getViewportTileResult(
    pageId:      string,
    cameraScale: number,
    dpr:         number,
    viewport:    { x: number; y: number; w: number; h: number },
  ): TileResult | null {
    const { x: visX, y: visY, w: visW, h: visH } = viewport;
    const dims = this.pageDimensions.get(pageId) ?? { w: 612, h: 792 };

    // Quantise to half-screen steps so panning < 50 % reuses the cached tile.
    const stepW  = Math.max(visW * 0.5, 1);
    const stepH  = Math.max(visH * 0.5, 1);
    const qX     = Math.floor(visX / stepW) * stepW;
    const qY     = Math.floor(visY / stepH) * stepH;
    // Nearest 0.25 prevents spurious cache-busting from float rounding.
    const qScale = Math.round(cameraScale * 4) / 4;
    const key    = `${pageId}:vp:${qX.toFixed(2)}:${qY.toFixed(2)}:${qScale}`;

    if (this.vpTiles.has(key)) return this.vpTiles.get(key)!;

    if (!this.vpRendering.has(key) && !this.vpFailed.has(key)) {
      // Tile region = quantised origin − one padding step, spanning 2× visible.
      // Panning up to ½ screen never needs a re-render.
      const tileX = Math.max(0, qX - stepW);
      const tileY = Math.max(0, qY - stepH);
      const tileW = Math.min(dims.w - tileX, visW * 2);
      const tileH = Math.min(dims.h - tileY, visH * 2);
      void this.renderViewportTile(
        pageId, key,
        { x: tileX, y: tileY, w: tileW, h: tileH },
        cameraScale, dpr,
      );
    }

    // While rendering: return best available full-page tile as fallback.
    for (const b of [8, 4, 2, 1, 16] as const) {
      const bm = this.tiles.get(`${pageId}:${b}`);
      if (bm) return { bitmap: bm };
    }
    // Or any stale viewport tile (better than a blank).
    for (const [k, t] of this.vpTiles) {
      if (k.startsWith(`${pageId}:vp:`)) return t;
    }
    return null;
  }

  private async renderViewportTile(
    pageId:      string,
    key:         string,
    region:      { x: number; y: number; w: number; h: number },
    cameraScale: number,
    dpr:         number,
  ): Promise<void> {
    const proxy = this.proxies.get(pageId);
    if (!proxy) return;

    this.vpRendering.add(key);
    try {
      const renderScale = cameraScale * dpr;
      const { x, y, w, h } = region;
      const canvasW = Math.ceil(w * renderScale);
      const canvasH = Math.ceil(h * renderScale);

      if (canvasW <= 0 || canvasH <= 0 || canvasW > MAX_TILE_DIM || canvasH > MAX_TILE_DIM) {
        throw new Error(`Viewport canvas out of range: ${canvasW}×${canvasH}`);
      }

      const vp     = proxy.getViewport({ scale: renderScale });
      const canvas = document.createElement('canvas');
      canvas.width  = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d')!;

      // Shift PDF render so the desired page region starts at (0, 0) in our
      // canvas.  PDF.js renders the whole page conceptually; the 2D context
      // clips anything outside [0, canvasW] × [0, canvasH] automatically.
      ctx.translate(-x * renderScale, -y * renderScale);

      await proxy.render({ canvasContext: ctx, viewport: vp }).promise;

      // LRU eviction: Map preserves insertion order.
      if (this.vpTiles.size >= PdfTileManager.VP_CACHE_MAX) {
        const oldest = this.vpTiles.keys().next().value as string | undefined;
        if (oldest) {
          this.vpTiles.get(oldest)!.bitmap.close();
          this.vpTiles.delete(oldest);
        }
      }

      const old = this.vpTiles.get(key);
      if (old) old.bitmap.close();

      const bitmap = await createImageBitmap(canvas);
      this.vpTiles.set(key, { bitmap, region });
      this.onReady?.();
    } catch (err) {
      this.vpFailed.add(key);
      console.error(`[PdfTileManager] renderViewportTile failed "${pageId}":`, err);
    } finally {
      this.vpRendering.delete(key);
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async renderTile(pageId: string, bucket: number): Promise<void> {
    const proxy = this.proxies.get(pageId);
    if (!proxy) return;

    const key = `${pageId}:${bucket}`;
    this.rendering.add(key);

    try {
      // ── Clamp canvas dimensions so we never exceed GPU / allocator limits. ──
      // At low/medium zoom, full-page tiles are used.  For very large pages,
      // bucket=8 (576 DPI) can still produce a canvas wider than 16 384 px,
      // so we cap proportionally and store under the original bucket key.
      // At high zoom (scale > maxFullScale) getTile() routes to viewport tiles
      // instead, so this path is never reached for extreme zoom levels.
      const MAX_DIM  = MAX_TILE_DIM;
      const rawVp    = proxy.getViewport({ scale: bucket });
      const rawW     = Math.round(rawVp.width);
      const rawH     = Math.round(rawVp.height);
      const dimClamp = Math.min(1, MAX_DIM / Math.max(rawW, rawH));
      const vp       = dimClamp < 1
        ? proxy.getViewport({ scale: bucket * dimClamp })
        : rawVp;

      // Task 4.3: Math.round avoids float-truncation dimension mismatches
      const w  = Math.round(vp.width);
      const h  = Math.round(vp.height);

      // Off-DOM canvas: never appended to document, GC'd after createImageBitmap.
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;

      await proxy.render({ canvasContext: ctx, viewport: vp }).promise;

      // Close stale same-bucket tile before replacing it
      const old = this.tiles.get(key);
      if (old) old.close();

      const bitmap = await createImageBitmap(canvas);
      this.tiles.set(key, bitmap);
      this.onReady?.();
    } catch (err) {
      // Mark as permanently failed so getTile() does not retry every frame.
      // The key is cleared when the next PDF is loaded (clearAll).
      this.failed.add(key);
      console.error(`[PdfTileManager] renderTile failed for "${pageId}" bucket=${bucket}:`, err);
    } finally {
      this.rendering.delete(key);
    }
  }

  /** Evict all tiles for a page (e.g., when navigating pages). */
  clearPage(pageId: string): void {
    for (const [key, bitmap] of this.tiles) {
      if (key.startsWith(`${pageId}:`)) {
        bitmap.close();
        this.tiles.delete(key);
      }
    }
    for (const [key, tile] of this.vpTiles) {
      if (key.startsWith(`${pageId}:`)) {
        tile.bitmap.close();
        this.vpTiles.delete(key);
      }
    }
  }

  /** Evict everything and release GPU resources. Preserves the onReady callback. */
  clearAll(): void {
    for (const bitmap of this.tiles.values()) bitmap.close();
    this.tiles.clear();
    this.rendering.clear();
    this.failed.clear();

    for (const tile of this.vpTiles.values()) tile.bitmap.close();
    this.vpTiles.clear();
    this.vpRendering.clear();
    this.vpFailed.clear();
    this.pageDimensions.clear();

    this.proxies.clear();
    // onReady intentionally preserved — it is set once by useCanvasEngine on
    // mount and must survive PDF reloads.
  }
}
