/**
 * TextEditor — type into a text box / callout in place (Bluebeam-style).
 * Opens when a text box is drawn or double-clicked.  Click away or Ctrl+Enter
 * to finish; Esc cancels; an empty new box is removed.
 */
import { useEffect, useRef, useState } from 'react';
import type { CanvasEngineAPI } from '../../hooks/useCanvasEngine';
import { useStudioStore } from '../../store/useStudioStore';
import type { TextShape } from '../../types/shapes';

export default function TextEditor({ engine }: { engine: CanvasEngineAPI }) {
  const id     = useStudioStore(s => s.pendingTextEdit);
  const shape  = useStudioStore(s => s.shapes.find(x => x.id === s.pendingTextEdit)) as TextShape | undefined;
  const scale  = useStudioStore(s => s.cameraScale);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const original = useRef('');

  useEffect(() => {
    if (!shape) return;
    original.current = shape.text;
    setDraft(shape.text);
    setTimeout(() => ref.current?.focus(), 0);
  }, [id]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!id || !shape || shape.type !== 'text') return null;

  const st = useStudioStore.getState();
  const close = () => st.setPendingTextEdit(null);
  function commit() {
    if (!draft.trim()) { st.removeShape(shape!.id); close(); return; }
    if (draft !== original.current) st.updateShape(shape!.id, { text: draft } as Partial<TextShape>);
    close();
  }
  function cancel() {
    if (!original.current) st.removeShape(shape!.id);
    close();
  }

  const a = engine.pageToScreen(shape.origin.x, shape.origin.y);
  const b = engine.pageToScreen(shape.origin.x + shape.widthPx, shape.origin.y + shape.heightPx);
  const fs = Math.max(8, shape.fontSize * scale);
  return (
    <textarea
      ref={ref}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') cancel();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit();
      }}
      className="absolute z-30 resize-none outline-none border-2 border-sky-500 bg-white/95 text-red-600 p-1 leading-tight"
      style={{ left: a.x, top: a.y, width: Math.max(80, b.x - a.x), height: Math.max(28, b.y - a.y), fontSize: fs, fontFamily: 'Arial, Helvetica, sans-serif' }}
    />
  );
}
