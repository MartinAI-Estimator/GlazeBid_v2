import { type FC } from 'react';
import { useAISessionStore } from '../store/useAISessionStore';

const AISessionStatus: FC = () => {
  const { savedSession, clearSession } = useAISessionStore();

  if (!savedSession) return null;

  const anchorLabel = savedSession.anchor ? '✓ Anchor set' : '— No anchor';
  const savedTime = new Date(savedSession.savedAt).toLocaleTimeString();

  return (
    <div style={{
      padding: '6px 10px', background: '#0c1a0c', border: '1px solid #14532d',
      borderRadius: 4, fontSize: 11, color: '#10b981', marginTop: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Session saved {savedTime}</span>
        <button onClick={clearSession} style={{
          background: 'none', border: 'none', color: '#71717a',
          cursor: 'pointer', fontSize: 10,
        }}>Clear</button>
      </div>
      <div style={{ color: '#6ee7b7', marginTop: 2 }}>
        {anchorLabel} · {savedSession.positiveExamples.length} pos · {savedSession.hardNegatives.length} neg · threshold {savedSession.threshold.toFixed(3)}
      </div>
    </div>
  );
};

export default AISessionStatus;
