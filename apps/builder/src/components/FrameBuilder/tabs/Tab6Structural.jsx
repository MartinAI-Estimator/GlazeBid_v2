/**
 * Tab6Structural.jsx — ASCE 7-22 Structural Advisor
 *
 * Production-quality wind load and deflection analysis with decision ladder.
 * Uses @glazebid/frame-engine/structural for real ASCE 7-22 math.
 *
 * Decision Ladder:
 *   PASS → aluminum alone is sufficient
 *   ADD_STEEL → HSS reinforcement recommended
 *   UPGRADE_PROFILE → deeper profile recommended
 *   ENGINEER_REQUIRED → PE review mandatory
 */

import React, { useState } from 'react'
import { analyzeStructural, ARCHETYPE_CATALOG } from '@glazebid/frame-engine'
import useFrameBuilderStore from '../../../store/useFrameBuilderStore'

// ─── Utility: Format numbers for display ──────────────────────────────────

function fmtDeflection(inches) {
  return `${inches.toFixed(4)}"`
}

function fmtPressure(psf) {
  return `${psf.toFixed(2)} psf`
}

function fmtRatio(num) {
  return Math.round(num).toString()
}

// ─── Component: Status Badge ──────────────────────────────────────────────

function StatusBadge({ status }) {
  const statusConfig = {
    PASS: { bg: '#10b981', fg: '#ecfdf5', label: 'PASS' },
    ADD_STEEL: { bg: '#f59e0b', fg: '#fef3c7', label: 'ADD STEEL' },
    UPGRADE_PROFILE: { bg: '#fb923c', fg: '#fef3e2', label: 'UPGRADE PROFILE' },
    ENGINEER_REQUIRED: { bg: '#ef4444', fg: '#fee2e2', label: 'ENGINEER REQUIRED' },
  }

  const config = statusConfig[status] || statusConfig.PASS

  return (
    <span style={{
      background: config.bg,
      color: config.fg,
      padding: '6px 12px',
      borderRadius: '6px',
      fontSize: '11px',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    }}>
      {config.label}
    </span>
  )
}

// ─── Component: Decision Ladder Step ──────────────────────────────────────

function DecisionLadderStep({ step, isActive, label, description }) {
  const stepNumber = step + 1
  const opacity = isActive ? 1.0 : (step < step + 1 ? 0.5 : 0.25)
  const bgColor = isActive ? ['#10b981', '#f59e0b', '#fb923c', '#ef4444'][step] : '#27272a'
  const textColor = isActive ? '#fff' : '#71717a'

  return (
    <div style={{
      flex: 1,
      padding: '12px',
      background: bgColor,
      borderRadius: '8px',
      opacity,
      transition: 'all 0.2s',
    }}>
      <div style={{
        fontSize: '10px',
        color: textColor,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '4px',
      }}>
        Step {stepNumber}
      </div>
      <div style={{
        fontSize: '12px',
        color: textColor,
        fontWeight: 600,
        marginBottom: '4px',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '11px',
        color: textColor,
        opacity: 0.85,
        lineHeight: '1.3',
      }}>
        {description}
      </div>
    </div>
  )
}

// ─── Component: Data Row ──────────────────────────────────────────────────

function DataRow({ label, value, valueColor }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '10px',
      fontSize: '12px',
      paddingBottom: '8px',
      borderBottom: '1px solid #27272a',
    }}>
      <span style={{ color: '#a1a1aa', fontWeight: 500 }}>{label}</span>
      <span style={{ color: valueColor || '#e4e4e7', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────

const Tab6Structural = ({ frameId }) => {
  const frames = useFrameBuilderStore((s) => s.frames)
  const updateFrame = useFrameBuilderStore((s) => s.updateFrame)
  const groups = useFrameBuilderStore((s) => s.groups)

  // Hooks must be declared before any conditional returns (Rules of Hooks)
  const [showAnchor, setShowAnchor] = useState(false)
  const [anchorSubstrate, setAnchorSubstrate] = useState('CMU')
  const [anchorSpacing, setAnchorSpacing] = useState(16)
  const [anchorEmbed, setAnchorEmbed] = useState(2.5)

  const frame = frames.find((f) => f.frameId === frameId)
  if (!frame) return <div style={{ padding: '16px', color: '#ef4444' }}>Frame not found</div>

  const group = groups.find((g) => g.groupId === frame.groupId)
  const archetypeId = group?.archetypeId || 'sf-450'
  const archetype = ARCHETYPE_CATALOG[archetypeId] || {}

  // Resolve effective attributes
  const windSpeedMph = frame.windSpeedMph || 90
  const exposureCategory = frame.exposureCategory || 'C'
  const buildingHeightFt = frame.buildingHeightFt || 30
  const systemClass = frame.systemClass || 'ext-storefront'

  // Compute tributary width (bay width)
  const bayCount = frame.bays || 1
  const tributaryWidthIn = frame.widthInches && bayCount > 0 ? frame.widthInches / bayCount : 12
  const mullionSpanIn = frame.heightInches || 96
  const profileDepthIn = archetype.profileDepth || 4.5

  // Run structural analysis
  const result = analyzeStructural({
    windSpeedMph,
    exposureCategory,
    buildingHeightFt,
    mullionSpanIn,
    tributaryWidthIn,
    profileDepthIn,
    systemClass,
  })

  // Sync anchor substrate from frame data (post-hook, safe to read frame here)
  const effectiveAnchorSubstrate = frame.wallSubstrate || anchorSubstrate

  // Compute anchor count
  const perimeterLF = (frame.widthInches + frame.heightInches) * 2 / 12
  const anchorCount = Math.ceil(perimeterLF * 12 / anchorSpacing) + 4

  const ANCHOR_REC = {
    CMU: 'Hilti KB-TZ2 3/8"×3.5" or equal masonry anchor',
    Concrete: 'Hilti KB-TZ2 3/8"×3.5" or Rawl Power-Bolt',
    Steel: '3/8" A325 bolt w/ nut and washer',
    Drywall: 'Remove gyp and anchor to steel stud or blocking',
  }

  // Style constants
  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    color: '#a1a1aa',
    marginBottom: '6px',
    textTransform: 'uppercase',
    fontWeight: 600,
    letterSpacing: '0.5px',
  }

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    background: '#1a1a1f',
    border: '1px solid #27272a',
    borderRadius: '4px',
    color: '#e4e4e7',
    fontSize: '12px',
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

  const quickButtonStyle = (isActive) => ({
    padding: '6px 10px',
    background: isActive ? '#0ea5e9' : '#1a1a1f',
    border: `1px solid ${isActive ? '#0ea5e9' : '#27272a'}`,
    borderRadius: '4px',
    color: isActive ? '#fff' : '#a1a1aa',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  })

  const cardStyle = (statusColor) => ({
    background: '#0f1117',
    border: `1px solid ${statusColor}`,
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px',
  })

  return (
    <div style={{ padding: '16px', background: '#111113', minHeight: '100%' }}>
      {/* ─── Wind Design Parameters ─────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Wind Design Parameters</div>

        <label style={labelStyle}>Wind Speed (MPH)</label>
        <input
          type="number"
          min="85"
          max="200"
          step="5"
          value={windSpeedMph}
          onChange={(e) => updateFrame(frameId, { windSpeedMph: parseInt(e.target.value) || 90 })}
          style={inputStyle}
        />

        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }}>
          {[90, 100, 110, 115, 130, 150].map(speed => (
            <button
              key={speed}
              onClick={() => updateFrame(frameId, { windSpeedMph: speed })}
              style={quickButtonStyle(windSpeedMph === speed)}
            >
              {speed}
            </button>
          ))}
        </div>

        <label style={{ ...labelStyle, marginTop: '12px' }}>Exposure Category</label>
        <select
          value={exposureCategory}
          onChange={(e) => updateFrame(frameId, { exposureCategory: e.target.value })}
          style={selectStyle}
        >
          <option value="B">B — Urban/Suburban</option>
          <option value="C">C — Open Terrain</option>
          <option value="D">D — Exposed Coastal</option>
        </select>

        <label style={{ ...labelStyle, marginTop: '12px' }}>Building Height (ft)</label>
        <input
          type="number"
          min="10"
          max="1000"
          step="5"
          value={buildingHeightFt}
          onChange={(e) => updateFrame(frameId, { buildingHeightFt: parseInt(e.target.value) || 30 })}
          style={inputStyle}
        />
      </div>

      {/* ─── Decision Ladder ────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Structural Decision Ladder</div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <DecisionLadderStep
            step={0}
            isActive={result.status === 'PASS'}
            label="PASS"
            description="Aluminum alone is sufficient"
          />
          <DecisionLadderStep
            step={1}
            isActive={result.status === 'ADD_STEEL'}
            label="Add Steel"
            description={result.steelRec ? `HSS ${result.steelRec.size} recommended` : 'Reinforcement needed'}
          />
          <DecisionLadderStep
            step={2}
            isActive={result.status === 'UPGRADE_PROFILE'}
            label="Upgrade Profile"
            description="Deeper profile recommended"
          />
          <DecisionLadderStep
            step={3}
            isActive={result.status === 'ENGINEER_REQUIRED'}
            label="Engineer Required"
            description="PE review mandatory"
          />
        </div>
      </div>

      {/* ─── Analysis Results ───────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Analysis Results</div>

        <div style={cardStyle(
          result.status === 'PASS' ? '#10b981' :
          result.status === 'ADD_STEEL' ? '#f59e0b' :
          result.status === 'UPGRADE_PROFILE' ? '#fb923c' :
          '#ef4444'
        )}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <span style={{ fontSize: '18px' }}>
              {result.status === 'PASS' ? '✓' :
               result.status === 'ADD_STEEL' ? '⚡' :
               result.status === 'UPGRADE_PROFILE' ? '↑' :
               '⚠'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: result.status === 'PASS' ? '#10b981' :
                       result.status === 'ADD_STEEL' ? '#f59e0b' :
                       result.status === 'UPGRADE_PROFILE' ? '#fb923c' :
                       '#ef4444',
                marginBottom: '2px',
              }}>
                Status: {result.status}
              </div>
              <div style={{ fontSize: '12px', color: '#a1a1aa' }}>
                {result.noteForShops}
              </div>
            </div>
          </div>

          <DataRow label="Design Wind Pressure" value={fmtPressure(result.windPressurePsf)} />
          <DataRow label="Velocity Pressure (qz)" value={fmtPressure(result.qz)} />
          <DataRow label="Height Factor (Kz)" value={result.Kz.toFixed(3)} />
          <DataRow label="Mullion Span" value={`${mullionSpanIn.toFixed(1)}\"`} />
          <DataRow label="Tributary Width" value={`${tributaryWidthIn.toFixed(2)}\"`} />
          <DataRow label="Calculated Deflection" value={fmtDeflection(result.mullionDeflectionIn)} />
          <DataRow label={`Deflection Limit (L/${fmtRatio(result.deflectionRatio)})`} value={fmtDeflection(result.deflectionLimitIn)} />
        </div>
      </div>

      {/* ─── Steel Reinforcement (if needed) ─────────────────────────────── */}
      {result.status === 'ADD_STEEL' && result.steelRec && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>Steel Reinforcement</div>

          <div style={{
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: '8px',
            padding: '12px',
          }}>
            <div style={{
              fontSize: '12px',
              color: '#f59e0b',
              fontWeight: 600,
              marginBottom: '8px',
            }}>
              ⬡ Recommended HSS Section
            </div>
            <div style={{
              fontSize: '13px',
              color: '#e4e4e7',
              fontWeight: 600,
              marginBottom: '4px',
            }}>
              HSS {result.steelRec.size}
            </div>
            <div style={{
              fontSize: '11px',
              color: '#a1a1aa',
              marginBottom: '10px',
              lineHeight: '1.4',
            }}>
              Moment of Inertia: {result.steelRec.I.toFixed(3)} in⁴<br />
              Weight: {result.steelRec.weight.toFixed(2)} lbs/ft
            </div>

            <button
              onClick={() => {
                updateFrame(frameId, {
                  structuralSteel: [
                    {
                      spec: `HSS ${result.steelRec.size}`,
                      lbsPerFt: result.steelRec.weight,
                      lf: mullionSpanIn / 12,
                    }
                  ],
                  structuralStatus: result.status,
                })
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#f59e0b',
                color: '#09090b',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.target.style.background = '#fbbf24'}
              onMouseLeave={(e) => e.target.style.background = '#f59e0b'}
            >
              Add Steel to Frame Notes
            </button>
          </div>
        </div>
      )}

      {/* ─── Upgrade Profile (if needed) ────────────────────────────────── */}
      {result.status === 'UPGRADE_PROFILE' && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>Profile Upgrade</div>

          <div style={{
            background: 'rgba(251,146,60,0.08)',
            border: '1px solid rgba(251,146,60,0.3)',
            borderRadius: '8px',
            padding: '12px',
          }}>
            <div style={{
              fontSize: '12px',
              color: '#fb923c',
              fontWeight: 600,
              marginBottom: '8px',
            }}>
              ↑ Profile Recommendation
            </div>
            <div style={{
              fontSize: '12px',
              color: '#a1a1aa',
              lineHeight: '1.4',
            }}>
              {result.upgradeNote || 'Consider upgrading to a deeper profile to reduce deflection.'}
            </div>
          </div>
        </div>
      )}

      {/* ─── Engineer Required ──────────────────────────────────────────── */}
      {result.status === 'ENGINEER_REQUIRED' && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>Engineer Required</div>

          <div style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '8px',
            padding: '12px',
          }}>
            <div style={{
              fontSize: '12px',
              color: '#ef4444',
              fontWeight: 600,
              marginBottom: '8px',
            }}>
              ⚠ Structural Engineer Review Required
            </div>
            <div style={{
              fontSize: '12px',
              color: '#a1a1aa',
              lineHeight: '1.4',
            }}>
              {result.engineerNote || 'This design exceeds standard library limits. Consult a structural engineer of record (PE).'}
            </div>
          </div>
        </div>
      )}

      {/* ─── Building Envelope ──────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Building Envelope</div>

        <label style={labelStyle}>Wall Substrate</label>
        <select
          value={frame.wallSubstrate || 'CMU'}
          onChange={(e) => updateFrame(frameId, { wallSubstrate: e.target.value })}
          style={selectStyle}
        >
          <option value="CMU">CMU / Masonry</option>
          <option value="Concrete">Concrete</option>
          <option value="Steel">Steel Frame</option>
          <option value="Drywall">Drywall</option>
        </select>

        <label style={{ ...labelStyle, marginTop: '12px' }}>Head Condition</label>
        <select
          value={frame.headCondition || 'soffit'}
          onChange={(e) => updateFrame(frameId, { headCondition: e.target.value })}
          style={selectStyle}
        >
          <option value="soffit">Soffit (Enclosed overhead)</option>
          <option value="open">Open Frame (Above floor deck)</option>
          <option value="flush">Flush Mounted</option>
        </select>
      </div>

      {/* ─── Anchor Calculator (Collapsible) ────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Anchor Calculator</div>

        <button
          onClick={() => setShowAnchor(!showAnchor)}
          style={{
            width: '100%',
            padding: '10px',
            background: '#0f1117',
            border: '1px solid #27272a',
            borderRadius: '4px',
            color: '#e4e4e7',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Anchor Configuration</span>
          <span style={{ transition: 'transform 0.2s' }}>
            {showAnchor ? '▼' : '▶'}
          </span>
        </button>

        {showAnchor && (
          <div style={{ marginTop: '12px' }}>
            <label style={labelStyle}>Substrate Type</label>
            <select
              value={effectiveAnchorSubstrate}
              onChange={(e) => setAnchorSubstrate(e.target.value)}
              style={selectStyle}
            >
              <option value="CMU">CMU / Masonry</option>
              <option value="Concrete">Concrete</option>
              <option value="Steel">Steel</option>
              <option value="Drywall">Drywall</option>
            </select>

            <label style={{ ...labelStyle, marginTop: '12px' }}>Anchor Spacing (inches)</label>
            <input
              type="number"
              min="6"
              max="48"
              step="2"
              value={anchorSpacing}
              onChange={(e) => setAnchorSpacing(parseInt(e.target.value) || 16)}
              style={inputStyle}
            />

            <label style={{ ...labelStyle, marginTop: '12px' }}>Embed Depth (inches)</label>
            <input
              type="number"
              min="1"
              max="6"
              step="0.25"
              value={anchorEmbed}
              onChange={(e) => setAnchorEmbed(parseFloat(e.target.value) || 2.5)}
              style={inputStyle}
            />

            <div style={{
              background: '#0f1117',
              border: '1px solid #27272a',
              borderRadius: '4px',
              padding: '12px',
              marginTop: '12px',
            }}>
              <div style={{
                fontSize: '11px',
                color: '#52525b',
                marginBottom: '8px',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}>
                Anchor Count & Recommendation
              </div>
              <div style={{ fontSize: '12px', color: '#e4e4e7', marginBottom: '6px', fontWeight: 600 }}>
                Qty: {anchorCount} anchors @ {anchorSpacing}" O.C.
              </div>
              <div style={{ fontSize: '12px', color: '#a1a1aa', lineHeight: '1.4' }}>
                {ANCHOR_REC[effectiveAnchorSubstrate] || 'Verify anchor type with structural engineer.'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Engineering Disclaimer ─────────────────────────────────────── */}
      <div style={{
        background: 'rgba(107,114,128,0.1)',
        border: '1px solid rgba(107,114,128,0.3)',
        borderRadius: '8px',
        padding: '12px',
        marginTop: '12px',
      }}>
        <div style={{
          fontSize: '11px',
          color: '#9ca3af',
          lineHeight: '1.5',
          fontStyle: 'italic',
        }}>
          Analysis per ASCE 7-22 Chapter 26-30 (2022 Edition). Kz values from ASCE 7-22 Table 26.10-1 with linear interpolation.
          This analysis is preliminary — a licensed Professional Engineer must review and stamp final designs. Deflection limits
          apply to components and cladding. All recommendations are subject to structural engineer approval and applicable building codes.
        </div>
      </div>
    </div>
  )
}

export default Tab6Structural
