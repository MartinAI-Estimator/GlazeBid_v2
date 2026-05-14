import React, { useState, useRef } from 'react'
import { useQuote } from '../context/QuoteContext'

export default function TabBar({ activeTab, setActiveTab }) {
  const { scopeTotals, sheetNames, updateSheetName } = useQuote()
  const [editingIdx, setEditingIdx] = useState(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef(null)

  function startEdit(i, e) {
    e.stopPropagation()
    setEditingIdx(i)
    setEditValue(sheetNames[i])
    // Focus input after render
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitEdit(i) {
    updateSheetName(i, editValue.trim())
    setEditingIdx(null)
  }

  function onKeyDown(e, i) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(i) }
    if (e.key === 'Escape') { setEditingIdx(null) }
  }

  return (
    <nav className="tab-bar">
      <button
        className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
        onClick={() => setActiveTab('summary')}
      >
        📋 Summary
      </button>
      {sheetNames.map((name, i) => {
        const hasData = scopeTotals[i].total > 0
        const isActive = activeTab === `scope-${i}`
        const isEditing = editingIdx === i

        return (
          <button
            key={i}
            className={`tab-btn ${isActive ? 'active' : ''} ${hasData ? 'has-data' : ''}`}
            onClick={() => !isEditing && setActiveTab(`scope-${i}`)}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                className="tab-name-input"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => commitEdit(i)}
                onKeyDown={e => onKeyDown(e, i)}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span
                className="tab-name"
                onDoubleClick={e => startEdit(i, e)}
                title="Double-click to rename"
              >
                {name}
              </span>
            )}
            {hasData && <span className="tab-dot" />}
          </button>
        )
      })}
    </nav>
  )
}
