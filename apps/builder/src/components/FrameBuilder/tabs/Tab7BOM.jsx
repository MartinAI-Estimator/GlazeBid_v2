/**
 * Tab7BOM.jsx — Bill of Materials Display
 *
 * READ-ONLY tab showing the resolved BOM with:
 * - Aluminum cut list
 * - Glass schedule
 * - Accessories & hardware
 * - Sealant
 * - Labor summary
 * - Push to Bid Sheet button
 */

import React, { useState } from 'react'
import useFrameBuilderStore from '../../../store/useFrameBuilderStore'

const Tab7BOM = ({ frameId, onNavigate }) => {
  const frames = useFrameBuilderStore((s) => s.frames)
  const resolveBOM = useFrameBuilderStore((s) => s.resolveBOM)
  const pushToBidStore = useFrameBuilderStore((s) => s.pushToBidStore)

  // Hooks must be declared before any conditional returns (Rules of Hooks)
  const [expandedSections, setExpandedSections] = useState({
    aluminum: true,
    glass: true,
    accessories: true,
    sealant: true,
    labor: true,
  })
  const [toast, setToast] = useState(null)

  const frame = frames.find((f) => f.frameId === frameId)
  if (!frame) return <div>Frame not found</div>

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handlePush = () => {
    try {
      pushToBidStore(frame.frameId)
      const mark = frame.mark ?? 'Frame'
      setToast({ message: `✓ ${mark} added to Bid — click "Bid Cart" to see pricing`, type: 'success' })
      setTimeout(() => setToast(null), 5000)
    } catch (err) {
      console.error('Push failed:', err)
      setToast({ message: 'Push failed — check frame dimensions', type: 'error' })
      setTimeout(() => setToast(null), 4000)
    }
  }

  const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '8px' }
  const thStyle = { textAlign: 'left', padding: '6px 8px', fontSize: '10px', color: '#52525b', textTransform: 'uppercase', borderBottom: '1px solid #27272a', background: '#0f1117' }
  const tdStyle = { padding: '5px 8px', borderBottom: '1px solid #1a1a1f', color: '#e4e4e7' }

  const expandableHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px',
    background: '#0f1117',
    border: '1px solid #27272a',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    color: '#e4e4e7',
    marginBottom: '8px',
  }

  const sectionHeaderStyle = {
    fontSize: '10px',
    color: '#52525b',
    textTransform: 'uppercase',
    marginBottom: '12px',
    fontWeight: 600,
    letterSpacing: '0.5px',
  }

  return (
    <div style={{ padding: '16px', background: '#111113', minHeight: '100%' }}>
      {!frame.lastBOM ? (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          background: '#0f1117',
          border: '1px solid #27272a',
          borderRadius: '8px',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⬡</div>
          <div style={{ color: '#e4e4e7', fontSize: '14px', marginBottom: '12px', fontWeight: 600 }}>
            BOM Not Calculated
          </div>
          <div style={{ color: '#52525b', fontSize: '12px', marginBottom: '16px' }}>
            BOM will calculate automatically as you fill in the frame details.
          </div>
          <button
            onClick={() => resolveBOM(frame.frameId)}
            style={{
              padding: '10px 16px',
              background: '#0ea5e9',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Calculate BOM
          </button>
        </div>
      ) : (
        <>
          {/* ─── Aluminum Cut List ────────────────────────────────────────────── */}
          <div style={{ marginBottom: '20px' }}>
            <div
              onClick={() => toggleSection('aluminum')}
              style={expandableHeaderStyle}
            >
              <span>1. Aluminum Cut List</span>
              <span>{expandedSections.aluminum ? '▼' : '▶'}</span>
            </div>

            {expandedSections.aluminum && (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Role</th>
                    <th style={thStyle}>Part#</th>
                    <th style={thStyle}>Description</th>
                    <th style={thStyle}>Cut Length</th>
                    <th style={thStyle}>Qty</th>
                    <th style={thStyle}>Lbs/LF</th>
                    <th style={thStyle}>Total Lbs</th>
                    <th style={thStyle}>Ext Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {frame.lastBOM.bomLines && frame.lastBOM.bomLines.length > 0 ? (
                    frame.lastBOM.bomLines.map((line, idx) => (
                      <tr key={idx}>
                        <td style={tdStyle}>{line.role || '—'}</td>
                        <td style={tdStyle}>{line.partNumber || '—'}</td>
                        <td style={tdStyle}>{line.description || '—'}</td>
                        <td style={tdStyle}>{line.totalLF?.toFixed(2) || '—'}</td>
                        <td style={tdStyle}>{line.barsRequired || 0}</td>
                        <td style={tdStyle}>{line.lbsPerFt?.toFixed(2) || '—'}</td>
                        <td style={tdStyle}>{(line.totalLbs || 0).toFixed(1)}</td>
                        <td style={tdStyle}>${(line.extCost || 0).toFixed(2)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td style={{ ...tdStyle, color: '#52525b' }} colSpan="8">No aluminum data</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* ─── Glass Schedule ────────────────────────────────────────────────── */}
          <div style={{ marginBottom: '20px' }}>
            <div
              onClick={() => toggleSection('glass')}
              style={expandableHeaderStyle}
            >
              <span>2. Glass Schedule</span>
              <span>{expandedSections.glass ? '▼' : '▶'}</span>
            </div>

            {expandedSections.glass && (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Mark</th>
                    <th style={thStyle}>W × H</th>
                    <th style={thStyle}>Shape</th>
                    <th style={thStyle}>Spec</th>
                    <th style={thStyle}>Qty</th>
                    <th style={thStyle}>SF</th>
                    <th style={thStyle}>Tempered</th>
                    <th style={thStyle}>Est Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {frame.lastBOM.glassSchedule && frame.lastBOM.glassSchedule.length > 0 ? (
                    frame.lastBOM.glassSchedule.map((glass, idx) => (
                      <tr key={idx}>
                        <td style={tdStyle}>{glass.mark || '—'}</td>
                        <td style={tdStyle}>{glass.widthInches?.toFixed(1)} × {glass.heightInches?.toFixed(1)}</td>
                        <td style={tdStyle}>{glass.shape || '—'}</td>
                        <td style={tdStyle}>{glass.glassSpecId || '—'}</td>
                        <td style={tdStyle}>{glass.quantity || 0}</td>
                        <td style={tdStyle}>{glass.sqft?.toFixed(2) || '—'}</td>
                        <td style={tdStyle}>{glass.isTempered ? 'Yes' : 'No'}</td>
                        <td style={tdStyle}><span style={{ color: '#52525b', fontStyle: 'italic' }}>Pending quote</span></td>
                      </tr>
                    ))
                  ) : (
                    <tr><td style={{ ...tdStyle, color: '#52525b' }} colSpan="8">No glass data</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* ─── Accessories & Hardware ────────────────────────────────────────── */}
          <div style={{ marginBottom: '20px' }}>
            <div
              onClick={() => toggleSection('accessories')}
              style={expandableHeaderStyle}
            >
              <span>3. Accessories & Hardware</span>
              <span>{expandedSections.accessories ? '▼' : '▶'}</span>
            </div>

            {expandedSections.accessories && (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Part#</th>
                    <th style={thStyle}>Description</th>
                    <th style={thStyle}>Unit</th>
                    <th style={thStyle}>Qty</th>
                    <th style={thStyle}>Unit Cost</th>
                    <th style={thStyle}>Ext Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {frame.lastBOM.accessories && frame.lastBOM.accessories.length > 0 ? (
                    frame.lastBOM.accessories.map((acc, idx) => (
                      <tr key={idx}>
                        <td style={tdStyle}>{acc.partNumber || '—'}</td>
                        <td style={tdStyle}>{acc.description || '—'}</td>
                        <td style={tdStyle}>{acc.unit || 'EA'}</td>
                        <td style={tdStyle}>{acc.quantity || 0}</td>
                        <td style={tdStyle}>${acc.unitCost?.toFixed(2) || '0.00'}</td>
                        <td style={tdStyle}>${(acc.extCost || 0).toFixed(2)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td style={{ ...tdStyle, color: '#52525b' }} colSpan="6">No accessories data</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* ─── Sealant ───────────────────────────────────────────────────────── */}
          <div style={{ marginBottom: '20px' }}>
            <div
              onClick={() => toggleSection('sealant')}
              style={expandableHeaderStyle}
            >
              <span>4. Sealant</span>
              <span>{expandedSections.sealant ? '▼' : '▶'}</span>
            </div>

            {expandedSections.sealant && (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Joint LF</th>
                    <th style={thStyle}>Sausages (20oz)</th>
                    <th style={thStyle}>Unit Cost</th>
                    <th style={thStyle}>Ext Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {frame.lastBOM.sealant && frame.lastBOM.sealant.length > 0 ? (
                    frame.lastBOM.sealant.map((seal, idx) => (
                      <tr key={idx}>
                        <td style={tdStyle}>{seal.type || '—'}</td>
                        <td style={tdStyle}>{seal.jointLF?.toFixed(1) || '—'}</td>
                        <td style={tdStyle}>{seal.sausageCount || 0}</td>
                        <td style={tdStyle}>${seal.unitCost?.toFixed(2) || '0.00'}</td>
                        <td style={tdStyle}>${((seal.sausageCount || 0) * (seal.unitCost || 0)).toFixed(2)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td style={{ ...tdStyle, color: '#52525b' }} colSpan="5">No sealant data</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* ─── Labor ───────────────────────────────────────────────────────────── */}
          <div style={{ marginBottom: '20px' }}>
            <div
              onClick={() => toggleSection('labor')}
              style={expandableHeaderStyle}
            >
              <span>5. Labor Summary</span>
              <span>{expandedSections.labor ? '▼' : '▶'}</span>
            </div>

            {expandedSections.labor && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#0f1117', border: '1px solid #27272a', borderRadius: '4px', padding: '12px' }}>
                  <div style={{ fontSize: '10px', color: '#52525b', textTransform: 'uppercase', marginBottom: '8px' }}>Shop Hours</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#0ea5e9' }}>
                    {frame.lastBOM.labor?.shopHours?.toFixed(1) || 0} hrs
                  </div>
                </div>
                <div style={{ background: '#0f1117', border: '1px solid #27272a', borderRadius: '4px', padding: '12px' }}>
                  <div style={{ fontSize: '10px', color: '#52525b', textTransform: 'uppercase', marginBottom: '8px' }}>Distribution</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#0ea5e9' }}>
                    {frame.lastBOM.labor?.distHours?.toFixed(1) || 0} hrs
                  </div>
                </div>
                <div style={{ background: '#0f1117', border: '1px solid #27272a', borderRadius: '4px', padding: '12px' }}>
                  <div style={{ fontSize: '10px', color: '#52525b', textTransform: 'uppercase', marginBottom: '8px' }}>Field</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#0ea5e9' }}>
                    {frame.lastBOM.labor?.fieldHours?.toFixed(1) || 0} hrs
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── Cost Summary ──────────────────────────────────────────────────── */}
          <div style={{
            background: '#0f1117',
            border: '1px solid #27272a',
            borderRadius: '4px',
            padding: '14px',
            marginBottom: '20px',
          }}>
            <div style={sectionHeaderStyle}>Cost Summary</div>
            <div style={{ fontSize: '12px', color: '#e4e4e7', lineHeight: '1.8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Total Aluminum:</span>
                <span>${(frame.lastBOM.bomLines || []).reduce((s, l) => s + (l.extCost || 0), 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Total Glass:</span>
                <span style={{ color: '#52525b', fontStyle: 'italic' }}>TBD (pending quote)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Total Accessories:</span>
                <span>${(frame.lastBOM.accessories || []).reduce((s, a) => s + (a.extCost || 0), 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span>Total Sealant:</span>
                <span>${(frame.lastBOM.sealant || []).reduce((s, sl) => s + (sl.extCost || 0), 0).toFixed(2)}</span>
              </div>
              <div style={{ borderTop: '1px solid #27272a', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                <span>Material Subtotal:</span>
                <span>${(
                  (frame.lastBOM.bomLines || []).reduce((s, l) => s + (l.extCost || 0), 0) +
                  (frame.lastBOM.accessories || []).reduce((s, a) => s + (a.extCost || 0), 0) +
                  (frame.lastBOM.sealant || []).reduce((s, sl) => s + (sl.extCost || 0), 0)
                ).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* ─── Push to Bid Sheet Button ──────────────────────────────────────── */}
          <button
            onClick={handlePush}
            style={{
              width: '100%',
              padding: '12px',
              background: '#0ea5e9',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Push to Bid Sheet →
          </button>
          <div style={{ fontSize: '11px', color: '#52525b', marginTop: '8px', textAlign: 'center' }}>
            Adds this frame's BOM to the active bid as a new line group
          </div>

          {/* ─── Toast Notification ──────────────────────────────────────────── */}
          {toast && (
            <div style={{
              position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
              background: toast.type === 'success' ? '#052e16' : '#3b0a0a',
              border: `1px solid ${toast.type === 'success' ? '#10b981' : '#ef4444'}`,
              borderRadius: 8, padding: '12px 16px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', gap: 12, maxWidth: 340,
            }}>
              <span style={{ color: toast.type === 'success' ? '#10b981' : '#ef4444', fontSize: 13, flex: 1 }}>
                {toast.message}
              </span>
              <button
                onClick={() => setToast(null)}
                style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}
              >✕</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Tab7BOM
