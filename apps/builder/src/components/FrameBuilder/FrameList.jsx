/**
 * FrameList.jsx — Left Panel Frame Group and Frame Selector
 *
 * Displays all frame groups and frames with:
 * - Collapsible group headers
 * - Frame selection
 * - Add frame / add group buttons
 * - Group context menu (rename, delete)
 */

import React, { useState } from 'react'
import useFrameBuilderStore from '../../store/useFrameBuilderStore'

export default function FrameList() {
  const {
    frames,
    groups,
    activeFrameId,
    setActiveFrame,
    addFrame,
    addGroup,
    removeGroup,
    updateGroup,
  } = useFrameBuilderStore()

  const [expandedGroups, setExpandedGroups] = useState({})
  const [openMenuGroupId, setOpenMenuGroupId] = useState(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [showAddGroupForm, setShowAddGroupForm] = useState(false)

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  const handleAddFrame = () => {
    if (groups.length === 0) {
      alert('Create a group first')
      return
    }
    addFrame(groups[0].groupId)
  }

  const handleAddGroup = () => {
    if (newGroupName.trim()) {
      addGroup(newGroupName, 'sf-450', 'kawneer-451t')
      setNewGroupName('')
      setShowAddGroupForm(false)
    }
  }

  const handleDeleteGroup = (groupId) => {
    if (window.confirm('Delete this group and all its frames?')) {
      removeGroup(groupId)
      setOpenMenuGroupId(null)
    }
  }

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #27272a',
    background: '#0f1117',
  }

  const headerTitleStyle = {
    fontSize: '12px',
    fontWeight: 600,
    color: '#a1a1aa',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  }

  const addButtonStyle = {
    padding: '4px 8px',
    background: '#0ea5e9',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  }

  const groupHeaderStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    background: '#0f1117',
    borderBottom: '1px solid #27272a',
    cursor: 'pointer',
    userSelect: 'none',
  }

  const groupNameStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#e4e4e7',
    flex: 1,
  }

  const groupBadgeStyle = {
    fontSize: '10px',
    color: '#52525b',
    background: '#1a1a1f',
    padding: '2px 6px',
    borderRadius: '3px',
  }

  const frameRowStyle = (isActive) => ({
    padding: '10px 12px',
    marginLeft: '12px',
    borderLeft: isActive ? '3px solid #0ea5e9' : '3px solid transparent',
    background: isActive ? 'rgba(14, 165, 233, 0.08)' : 'transparent',
    cursor: 'pointer',
    fontSize: '12px',
    color: isActive ? '#0ea5e9' : '#e4e4e7',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'background 0.15s',
  })

  const frameTextStyle = {
    flex: 1,
  }

  const frameDimensionsStyle = {
    fontSize: '11px',
    color: '#a1a1aa',
    marginLeft: '8px',
  }

  const bomDotStyle = {
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#10b981',
    marginLeft: '8px',
  }

  const mockupBadgeStyle = {
    fontSize: '9px',
    background: '#fb923c',
    color: '#fff',
    padding: '2px 4px',
    borderRadius: '2px',
    marginLeft: '6px',
  }

  const menuStyle = {
    position: 'absolute',
    right: '8px',
    top: '28px',
    background: '#1a1a1f',
    border: '1px solid #27272a',
    borderRadius: '4px',
    overflow: 'hidden',
    zIndex: 100,
  }

  const menuItemStyle = {
    padding: '8px 16px',
    fontSize: '12px',
    color: '#e4e4e7',
    cursor: 'pointer',
    borderBottom: '1px solid #27272a',
    whiteSpace: 'nowrap',
  }

  const menuItemHoverStyle = {
    ...menuItemStyle,
    background: '#27272a',
  }

  const emptyStateStyle = {
    padding: '24px',
    textAlign: 'center',
  }

  const emptyStateIconStyle = {
    fontSize: '28px',
    marginBottom: '8px',
  }

  const emptyStateTextStyle = {
    color: '#52525b',
    fontSize: '13px',
    marginBottom: '16px',
  }

  const emptyStateButtonStyle = {
    padding: '8px 16px',
    background: '#0ea5e9',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#111113' }}>
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div style={headerStyle}>
        <span style={headerTitleStyle}>FRAMES</span>
        <button onClick={handleAddFrame} style={addButtonStyle}>
          + ADD
        </button>
      </div>

      {/* ─── Frame List (Scrollable) ────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {groups.length === 0 ? (
          <div style={emptyStateStyle}>
            <div style={emptyStateIconStyle}>⬡</div>
            <div style={emptyStateTextStyle}>No frames yet</div>
            <button
              onClick={() => setShowAddGroupForm(true)}
              style={emptyStateButtonStyle}
            >
              + Create First Group
            </button>
          </div>
        ) : (
          groups.map(group => {
            const groupFrames = frames.filter(f => f.groupId === group.groupId)
            const isExpanded = expandedGroups[group.groupId] !== false

            return (
              <div key={group.groupId}>
                {/* ─── Group Header ──────────────────────────────────────── */}
                <div
                  onClick={() => toggleGroup(group.groupId)}
                  style={{ ...groupHeaderStyle, position: 'relative' }}
                >
                  <div style={groupNameStyle}>
                    <span>{isExpanded ? '▼' : '▶'}</span>
                    <span>{group.name}</span>
                    <span style={groupBadgeStyle}>{groupFrames.length}</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenMenuGroupId(openMenuGroupId === group.groupId ? null : group.groupId)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#a1a1aa',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '0 4px',
                    }}
                  >
                    ⋯
                  </button>

                  {openMenuGroupId === group.groupId && (
                    <div style={menuStyle}>
                      <div
                        onClick={() => {
                          addFrame(group.groupId)
                          setOpenMenuGroupId(null)
                        }}
                        onMouseOver={(e) => e.target.style.background = '#27272a'}
                        onMouseOut={(e) => e.target.style.background = 'transparent'}
                        style={menuItemStyle}
                      >
                        Add Frame
                      </div>
                      <div
                        onClick={() => {
                          const newName = prompt('Rename group:', group.name)
                          if (newName) {
                            updateGroup(group.groupId, { name: newName })
                          }
                          setOpenMenuGroupId(null)
                        }}
                        onMouseOver={(e) => e.target.style.background = '#27272a'}
                        onMouseOut={(e) => e.target.style.background = 'transparent'}
                        style={menuItemStyle}
                      >
                        Rename
                      </div>
                      <div
                        onClick={() => handleDeleteGroup(group.groupId)}
                        onMouseOver={(e) => e.target.style.background = '#ef4444'}
                        onMouseOut={(e) => e.target.style.background = 'transparent'}
                        style={{ ...menuItemStyle, color: '#ef4444' }}
                      >
                        Delete
                      </div>
                    </div>
                  )}
                </div>

                {/* ─── Frame Rows ────────────────────────────────────────── */}
                {isExpanded && (
                  <div>
                    {groupFrames.length === 0 ? (
                      <div style={{
                        padding: '8px 12px',
                        marginLeft: '12px',
                        fontSize: '11px',
                        color: '#52525b',
                        fontStyle: 'italic',
                      }}>
                        No frames
                      </div>
                    ) : (
                      groupFrames.map(frame => {
                        const isActive = activeFrameId === frame.frameId
                        return (
                          <div
                            key={frame.frameId}
                            onClick={() => setActiveFrame(frame.frameId)}
                            style={frameRowStyle(isActive)}
                            onMouseOver={(e) => {
                              if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                            }}
                            onMouseOut={(e) => {
                              if (!isActive) e.currentTarget.style.background = 'transparent'
                            }}
                          >
                            <div style={frameTextStyle}>
                              <span>{frame.mark}</span>
                              <span style={frameDimensionsStyle}>
                                {frame.widthInches}" × {frame.heightInches}"
                              </span>
                              {frame.scopeTag !== 'BASE_BID' && (
                                <span style={{
                                  fontSize: '9px',
                                  background: '#f59e0b',
                                  color: '#fff',
                                  padding: '2px 6px',
                                  borderRadius: '2px',
                                  marginLeft: '8px',
                                }}>
                                  {frame.scopeTag}
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {frame.lastBOM && <div style={bomDotStyle} title="BOM resolved" />}
                              {frame.isMockup && <span style={mockupBadgeStyle}>M</span>}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ─── Add Group Button / Form ────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #27272a', padding: '12px 16px', background: '#0f1117' }}>
        {!showAddGroupForm ? (
          <button
            onClick={() => setShowAddGroupForm(true)}
            style={{
              width: '100%',
              padding: '8px',
              background: 'transparent',
              border: '1px solid #27272a',
              borderRadius: '4px',
              color: '#a1a1aa',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            + Add Group
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="text"
              placeholder="Group name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
              autoFocus
              style={{
                padding: '6px 8px',
                background: '#1a1a1f',
                border: '1px solid #27272a',
                borderRadius: '4px',
                color: '#e4e4e7',
                fontSize: '12px',
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleAddGroup}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: '#0ea5e9',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowAddGroupForm(false)
                  setNewGroupName('')
                }}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: '#27272a',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#a1a1aa',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
