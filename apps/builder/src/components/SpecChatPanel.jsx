/**
 * SpecChatPanel.jsx
 *
 * Floating chat drawer for the Spec Sorter page.
 * Sends the scan results (extracted spec text) as system context to
 * Anthropic claude-haiku-3-5 via the ai:chat IPC handler.
 *
 * Props:
 *   scanResults   — { [sectionNumber]: { sectionTitle, categories, findings } }
 *   sections      — full sections array (for names)
 *   onJumpToPage  — (pageNumber) => void — called when AI cites a page
 *   onClose       — () => void
 */
import React, { useState, useEffect, useRef } from 'react';

// ── Build the system prompt from scan results ─────────────────────────────────
function buildSystemPrompt(scanResults, sections) {
  const lines = [
    'You are a commercial glazing estimator assistant with 15 years of field and office experience.',
    'You specialize in Division 08 (Openings) — storefront, curtain wall, entrances, windows, and specialty glazing systems.',
    'Answer questions about the specification concisely and cite page numbers when known.',
    'When you reference specific language, quote it briefly and note the page number.',
    '',
    '## Your Glazing Estimating Playbook',
    'When reviewing specs, always look for and flag these items:',
    '',
    '### HIGH RISK — Verify before bidding',
    '- NO SUBSTITUTIONS / Sole Source / Proprietary: Must quote named system exactly.',
    '- Delegated Design: PE-stamped engineering required from contractor. Budget $2,000–$8,000.',
    '- Fire-Rated Glazing (45/60/90-min): Only UL-listed assemblies qualify. Cost 3–8x standard.',
    '- Blast Resistance (GSA / UFC 4-010): Specialty laminated glass + structural anchors.',
    '- HVHZ / Impact Glazing (Miami-Dade NOA): Certified hardware + interlayer glass required.',
    '',
    '### WATCH — Price these accurately',
    '- AAMA 2605 (Kynar 500 / PVDF): 20–25% cost premium over AAMA 2604. Confirm finish class.',
    '- Warranty > 15 years: May require premium-tier framing system.',
    '- Mock-Up required: Full-size prototype before production. Budget 80–160 MH + material.',
    '- Field Testing (AAMA 501.2 / ASTM E1105): Owner-witnessed water test. Budget $3,000–$10,000.',
    '- Acoustic / STC requirements: STC 35+ needs laminated glass — verify glass makeup.',
    '- Installer Qualifications: Manufacturer-certified crew required.',
    '',
    '### KEY NUMBERS TO EXTRACT',
    '- Design Pressure (DP rating): Required for framing selection',
    '- U-value and SHGC: Thermal + solar performance targets',
    '- Glass makeup: Monolithic / insulating / laminated / triple-pane',
    '- AAMA finish class: 2603 / 2604 / 2605',
    '- Warranty duration: years covered',
    '',
    '### CONTRACT & GENERAL CONDITIONS — Flag these immediately',
    '- Liquidated damages: Extract $/day amount. $2,000+/day is HIGH RISK for glazing timeline — glass lead times and shop drawing delays are common LD triggers.',
    '- Retainage: 10% retainage on a $500K glazing contract = $50K held until closeout. Affects cash flow — note the percentage.',
    '- Performance/payment bond: Add 1–3% of contract value to bid price. Confirm whether bond is required for the sub-contract or just the prime.',
    '- Pay-if-paid: GC can withhold payment indefinitely if owner defaults. Higher risk than pay-when-paid. Flag clearly.',
    '- Working hours restrictions: Occupied buildings, downtown cores, noise ordinances — may require night/weekend glazing installs at premium labor rates.',
    '- LEED/Sustainability: Requires recycled content tracking, regional material documentation, and EPD/HPD submittals for each glazing product.',
    '- Owner-furnished items: Owner-supplied glass, hardware, or allowances change your scope boundary — clarify delivery, storage, and damage responsibility.',
    '- Phasing: Occupied building = protection barriers, sequencing constraints, restricted staging. Add to your cost and schedule.',
    '- Close-out: O&M manuals, as-built drawings, owner training — these must be submitted before final payment. Budget PM time.',
    '',
    '## Scanned Spec Sections',
  ];

  sections.forEach(s => { void s; }); // sectionMap not needed here but keep sections in scope

  Object.values(scanResults).forEach(r => {
    if (!r.sectionNumber) return;
    lines.push(`\n### Section ${r.sectionNumber} — ${r.sectionTitle || ''}`);

    // From specReader (categories)
    const cats = r.categories || {};
    const catKeys = ['basisOfDesign', 'finish', 'performance', 'substitution', 'submittals', 'warranty'];
    catKeys.forEach(key => {
      const cat = cats[key];
      if (!cat || cat.status !== 'found') return;
      (cat.items || []).slice(0, 3).forEach(item => {
        const parts = [];
        if (item.manufacturer) parts.push(`Manufacturer: ${item.manufacturer}`);
        if (item.product)      parts.push(`Product: ${item.product}`);
        if (item.value)        parts.push(`Value: ${item.value}`);
        if (item.excerpt)      parts.push(`"${item.excerpt.slice(0, 200)}"`);
        if (item.page)         parts.push(`(p.${item.page})`);
        if (parts.length)      lines.push(`  [${key}] ${parts.join(' | ')}`);
      });
    });

    // From specScanner (findings — all categories including extended ones)
    const findings = r.findings || {};
    Object.entries(findings).forEach(([key, f]) => {
      if (!f?.found) return;
      const parts = [];
      if (f.excerpt) parts.push(`"${f.excerpt.slice(0, 200)}"`);
      if (f.page)    parts.push(`(p.${f.page})`);
      if (parts.length) lines.push(`  [${key}] ${parts.join(' ')}`);
    });
  });

  lines.push('');
  lines.push('Answer based on the extracted text and your glazing expertise. If something is not in the spec, say so and note the estimator should verify manually.');
  return lines.join('\n');
}

// ── Page citation detection ───────────────────────────────────────────────────
function extractPageCitations(text) {
  const matches = [];
  const re = /\bp\.?\s*(\d{1,4})\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const page = parseInt(m[1], 10);
    if (page > 0 && page < 5000) matches.push(page);
  }
  return [...new Set(matches)];
}

// ── Starter questions ─────────────────────────────────────────────────────────
const STARTERS = [
  'What manufacturer is specified as the basis of design?',
  'Are substitutions allowed? What is the approval process?',
  'What are the design pressure and thermal performance requirements?',
  'Is delegated design required? What does it say?',
  'Is a mock-up required? What size and where?',
  'What finish class is specified — AAMA 2603, 2604, or 2605?',
  'Is fire-rated or impact-resistant glazing required?',
  'Are there acoustic or STC requirements?',
  'What is the warranty duration and what does it cover?',
  'Are there liquidated damages? What is the daily rate?',
  'What is the retainage percentage and when is it released?',
  'Is a performance or payment bond required?',
  'Is there pay-if-paid or pay-when-paid language?',
  'Summarize the key bid risks in this spec.',
];

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ msg, onJumpToPage }) {
  const isUser = msg.role === 'user';
  const pages  = isUser ? [] : extractPageCitations(msg.content);

  // Render assistant text with inline page-jump links
  function renderContent(text) {
    const parts = text.split(/(\bp\.?\s*\d{1,4}\b)/gi);
    return parts.map((part, i) => {
      const m = part.match(/^p\.?\s*(\d{1,4})$/i);
      if (m && onJumpToPage) {
        const page = parseInt(m[1], 10);
        return (
          <button
            key={i}
            onClick={() => onJumpToPage(page)}
            style={{
              color: '#58a6ff', background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, fontSize: 'inherit',
              textDecoration: 'underline', fontFamily: 'inherit',
            }}
          >
            {part}
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 10, padding: '0 12px',
    }}>
      <div style={{
        maxWidth: '88%',
        padding: '8px 12px',
        borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        background: isUser ? '#1d3a6e' : '#161b22',
        border: `1px solid ${isUser ? '#1e4080' : '#21262d'}`,
        fontSize: '0.78rem', color: '#c9d1d9', lineHeight: 1.6,
      }}>
        {isUser ? msg.content : renderContent(msg.content)}
        {msg.error && (
          <div style={{ color: '#f85149', marginTop: 4, fontSize: '0.72rem' }}>
            ⚠ {msg.error}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SpecChatPanel({ scanResults, sections, onJumpToPage, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [hasKey, setHasKey]     = useState(null); // null = checking
  const bottomRef               = useRef(null);
  const inputRef                = useRef(null);
  const noResults               = !scanResults || !Object.keys(scanResults).length;

  // Check key on mount
  useEffect(() => {
    window.electronAPI?.aiKeyCheck?.()
      .then(r => setHasKey(!!r?.hasKey))
      .catch(() => setHasKey(false));
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  async function sendMessage(text) {
    const userText = (text || input).trim();
    if (!userText || loading) return;
    setInput('');

    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setLoading(true);

    const systemPrompt = buildSystemPrompt(scanResults || {}, sections || []);
    const result = await window.electronAPI?.aiChat?.(
      newMessages.map(m => ({ role: m.role, content: m.content })),
      systemPrompt,
    );

    setLoading(false);
    if (result?.ok) {
      setMessages(prev => [...prev, { role: 'assistant', content: result.text }]);
    } else {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '',
        error: result?.error || 'Unexpected error — check your API key in Settings → AI.',
      }]);
    }
  }

  // ── No key state ──────────────────────────────────────────────────────────
  if (hasKey === false) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: '#0d1117', borderLeft: '1px solid #21262d',
      }}>
        <Header onClose={onClose} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }}>
          <div style={{ fontSize: 36 }}>🔑</div>
          <p style={{ fontSize: '0.82rem', color: '#8b949e', textAlign: 'center', lineHeight: 1.6 }}>
            No Anthropic API key found.
          </p>
          <p style={{ fontSize: '0.75rem', color: '#484f58', textAlign: 'center', lineHeight: 1.55 }}>
            Add your key in <strong style={{ color: '#c9d1d9' }}>Settings → 🤖 AI Settings</strong> to enable Spec Chat.
            Uses <code style={{ background: '#161b22', padding: '1px 4px', borderRadius: 3, fontSize: '0.7rem', color: '#79c0ff' }}>claude-haiku-3-5</code> (~$0.09/session).
          </p>
        </div>
      </div>
    );
  }

  // ── No scan results ───────────────────────────────────────────────────────
  if (noResults) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: '#0d1117', borderLeft: '1px solid #21262d',
      }}>
        <Header onClose={onClose} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 }}>
          <div style={{ fontSize: 36 }}>🔬</div>
          <p style={{ fontSize: '0.82rem', color: '#8b949e', textAlign: 'center', lineHeight: 1.6 }}>
            Scan some spec sections first — the AI reads your extracted spec text to answer questions.
          </p>
        </div>
      </div>
    );
  }

  const sectionCount = Object.keys(scanResults).length;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#0d1117', borderLeft: '1px solid #21262d',
    }}>
      <Header onClose={onClose} sectionCount={sectionCount} loading={loading} />

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 12 }}>
        {messages.length === 0 && (
          <div style={{ padding: '0 12px 12px' }}>
            <p style={{ fontSize: '0.72rem', color: '#484f58', textAlign: 'center', marginBottom: 12 }}>
              Ask anything about your spec. AI is reading {sectionCount} scanned section{sectionCount !== 1 ? 's' : ''}.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {STARTERS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  style={{
                    textAlign: 'left', padding: '6px 10px',
                    background: 'rgba(88,166,255,0.04)', border: '1px solid #21262d',
                    borderRadius: 6, color: '#8b949e', fontSize: '0.72rem',
                    cursor: 'pointer', lineHeight: 1.4,
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#388bfd'; e.currentTarget.style.background = 'rgba(88,166,255,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#21262d'; e.currentTarget.style.background = 'rgba(88,166,255,0.04)'; }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <Bubble key={i} msg={msg} onJumpToPage={onJumpToPage} />
        ))}

        {loading && (
          <div style={{ padding: '0 12px', display: 'flex', gap: 4, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: '50%', background: '#388bfd',
                  animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
            <span style={{ fontSize: '0.7rem', color: '#484f58', marginLeft: 4 }}>Haiku is thinking…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        flexShrink: 0, padding: '8px 10px',
        borderTop: '1px solid #21262d', background: '#161b22',
      }}>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            style={{ fontSize: '0.65rem', color: '#484f58', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 6, padding: 0 }}
          >
            ↺ New conversation
          </button>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Ask about the spec…"
            disabled={loading}
            style={{
              flex: 1, padding: '7px 10px', fontSize: '0.78rem',
              background: 'rgba(255,255,255,0.05)', border: '1px solid #30363d',
              borderRadius: 6, color: '#e6edf3', outline: 'none',
              opacity: loading ? 0.5 : 1,
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            style={{
              padding: '7px 14px', fontSize: '0.78rem', fontWeight: 700,
              background: input.trim() && !loading ? '#238636' : '#21262d',
              border: 'none', borderRadius: 6, color: '#fff',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            }}
          >
            ↑
          </button>
        </div>
        <p style={{ fontSize: '0.62rem', color: '#30363d', margin: '4px 0 0', textAlign: 'right' }}>
          claude-haiku-3-5 · Enter to send
        </p>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}

function Header({ onClose, sectionCount, loading }) {
  return (
    <div style={{
      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
      padding: '0 12px', height: 44,
      background: '#161b22', borderBottom: '1px solid #21262d',
    }}>
      <span style={{ fontSize: '0.88rem' }}>🤖</span>
      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e6edf3', flex: 1 }}>
        Spec Chat
      </span>
      {sectionCount != null && (
        <span style={{ fontSize: '0.65rem', color: '#484f58' }}>
          {loading ? '⏳' : `${sectionCount} sec.`}
        </span>
      )}
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '1rem', padding: '0 2px', lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  );
}
