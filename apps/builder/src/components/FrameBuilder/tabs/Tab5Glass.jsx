/**
 * Tab5Glass.jsx — Glass Specification & Tempering Analysis
 *
 * Displays:
 * - Primary glass spec selector
 * - Glass spec details card
 * - Spandrel zone toggle + vision/spandrel glass selectors
 * - Tempering auto-flag analysis (IBC 2406.4)
 * - Glass area ratio calculation
 */

import React from 'react'
import useFrameBuilderStore from '../../../store/useFrameBuilderStore'

function TemperingFlag({ required, reason }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
      <span style={{ color: required ? '#ef4444' : '#10b981', fontSize: '12px', fontWeight: 600 }}>
        {required ? '⚠ TEMPERED' : '✓ Not required'}
      </span>
      <span style={{ fontSize: '11px', color: '#52525b' }}>{reason}</span>
    </div>
  )
}

function GlassSpecCard({ spec }) {
  if (!spec) return null

  return (
    <div style={{
      background: '#0f1117',
      border: '1px solid #27272a',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '16px',
      fontSize: '12px',
    }}>
      <div style={{ color: '#e4e4e7', fontWeight: 600, marginBottom: '8px' }}>
        {spec.specId} — {spec.name}
      </div>
      <div style={{ color: '#52525b', marginBottom: '8px', lineHeight: '1.4' }}>
        Makeup: {spec.makeup}
      </div>
      <div style={{ display: 'flex', gap: '16px', color: '#a1a1aa', fontSize: '11px' }}>
        <span>U-Value: {spec.uValue?.toFixed(2) || 'N/A'}</span>
        <span>|</span>
        <span>SHGC: {spec.shgc?.toFixed(2) || 'N/A'}</span>
        <span>|</span>
        <span>Thickness: {spec.thickness}″</span>
      </div>
    </div>
  )
}

export default function Tab5Glass() {
  const { frames, activeFrameId, glassSpecs, updateFrame } = useFrameBuilderStore()
  const frame = frames.find(f => f.frameId === activeFrameId)

  if (!frame) {
    return (
      <div style={{
        padding: '24px',
        textAlign: 'center',
        color: '#52525b',
      }}>
        No frame selected
      </div>
    )
  }

  const selectedSpec = glassSpecs.find(s => s.specId === frame.glassSpecId)

  // ─── Glass Area Ratio Calculation ───────────────────────────────────────
  // Glass SF = estimate based on frame dimensions (simplified)
  // For now: assume typical lite layout
  const estimatedGlassSF = Math.max(0, (frame.widthInches * frame.heightInches) / 144)
  const roughOpeningSF = Math.max(1, (frame.widthInches * frame.heightInches) / 144)
  const glassAreaRatio = roughOpeningSF > 0 ? (estimatedGlassSF / roughOpeningSF) * 100 : 0

  const getRatioColor = () => {
    if (glassAreaRatio >= 70) return '#10b981'
    if (glassAreaRatio >= 50) return '#f59e0b'
    return '#ef4444'
  }

  // ─── Tempering Requirements ────────────────────────────────────────────
  const needsTemperingForAFF = frame.sillAFF < 18
  const adjacentToDoor = frame.bayConfigs?.some(b => b.type !== 'glazing') || false

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    color: '#a1a1aa',
    marginBottom: '6px',
    textTransform: 'uppercase',
    fontWeight: 600,
  }

  const selectStyle = {
    width: '100%',
    padding: '8px 10px',
    background: '#1a1a1f',
    border: '1px solid #27272a',
    borderRadius: '4px',
    color: '#e4e4e7',
    fontSize: '12px',
    cursor: 'pointer',
  }

  const sectionStyle = {
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '1px solid #27272a',
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
      {/* ─── Primary Glass Spec ─────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Primary Glass Spec</label>
        <select
          value={frame.glassSpecId || ''}
          onChange={(e) => updateFrame(frame.frameId, { glassSpecId: e.target.value })}
          style={selectStyle}
        >
          <option value="">Select glass spec...</option>
          {glassSpecs.map(spec => (
            <option key={spec.specId} value={spec.specId}>
              {spec.specId} — {spec.name}
            </option>
          ))}
        </select>

        {selectedSpec && <GlassSpecCard spec={selectedSpec} />}
      </div>

      {/* ─── Spandrel Zones ────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={frame.hasSpandrelZones || false}
            onChange={(e) => updateFrame(frame.frameId, { hasSpandrelZones: e.target.checked })}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 500 }}>Has Spandrel Zones</span>
        </label>

        {frame.hasSpandrelZones && (
          <div style={{ marginTop: '12px', paddingLeft: '24px' }}>
            <label style={labelStyle}>Vision Glass Spec</label>
            <select
              value={frame.visionGlassSpecId || ''}
              onChange={(e) => updateFrame(frame.frameId, { visionGlassSpecId: e.target.value })}
              style={selectStyle}
            >
              <option value="">Select vision glass...</option>
              {glassSpecs.map(spec => (
                <option key={spec.specId} value={spec.specId}>
                  {spec.specId} — {spec.name}
                </option>
              ))}
            </select>

            <label style={{ ...labelStyle, marginTop: '12px' }}>Spandrel Glass Spec</label>
            <select
              value={frame.spandrelGlassSpecId || ''}
              onChange={(e) => updateFrame(frame.frameId, { spandrelGlassSpecId: e.target.value })}
              style={selectStyle}
            >
              <option value="">Select spandrel glass...</option>
              {glassSpecs.map(spec => (
                <option key={spec.specId} value={spec.specId}>
                  {spec.specId} — {spec.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ─── Tempering Analysis ────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Tempering Analysis</div>
        <div style={{
          background: '#0f1117',
          border: '1px solid #27272a',
          borderRadius: '8px',
          padding: '12px',
        }}>
          <TemperingFlag
            required={needsTemperingForAFF}
            reason={'Bottom edge within 18" AFF (IBC 2406.4)'}
          />
          {adjacentToDoor && (
            <TemperingFlag
              required={true}
              reason="Adjacent to door opening"
            />
          )}

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '12px',
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={frame.temperingOverride || false}
              onChange={(e) => updateFrame(frame.frameId, { temperingOverride: e.target.checked })}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: '12px', color: '#a1a1aa' }}>
              Override — manually set tempering requirement
            </span>
          </label>
        </div>
      </div>

      {/* ─── Glass Area Ratio ───────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Glass Area Analysis</div>
        <div style={{
          background: '#0f1117',
          border: '1px solid #27272a',
          borderRadius: '8px',
          padding: '12px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#a1a1aa' }}>Glass Area Ratio</span>
            <span style={{
              fontSize: '14px',
              fontWeight: 600,
              color: getRatioColor(),
            }}>
              {glassAreaRatio.toFixed(1)}%
            </span>
          </div>
          <div style={{
            fontSize: '11px',
            color: '#52525b',
            lineHeight: '1.6',
          }}>
            <div>Glass SF: {estimatedGlassSF.toFixed(2)}</div>
            <div>Rough Opening: {roughOpeningSF.toFixed(2)} SF</div>
          </div>
        </div>
      </div>
    </div>
  )
}
