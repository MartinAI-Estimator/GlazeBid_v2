import React, { useState } from 'react';
import { GLAZING_CLASSES, TOOL_CATEGORIES, TOOL_MODES, KEYBOARD_SHORTCUTS } from './constants';
import AIAutomationButton from './AIAutomationButton';
import { HelpCircle, Plus } from 'lucide-react';

// Predefined colors for custom types (auto-rotate through these)
const CUSTOM_COLORS = [
  'rgba(156, 39, 176, 0.7)',   // Purple
  'rgba(233, 30, 99, 0.7)',    // Pink
  'rgba(0, 188, 212, 0.7)',    // Cyan
  'rgba(255, 87, 34, 0.7)',    // Deep Orange
  'rgba(76, 175, 80, 0.7)',    // Green
  'rgba(63, 81, 181, 0.7)',    // Indigo
  'rgba(255, 193, 7, 0.7)',    // Amber
  'rgba(121, 85, 72, 0.7)',    // Brown
  'rgba(0, 150, 136, 0.7)',    // Teal
  'rgba(244, 67, 54, 0.7)',    // Red
];

/**
 * ToolPalette Component
 * Replicates the PyQt6 toolbox with organized categories
 * Provides quick access to markup tools with keyboard shortcuts
 */
const ToolPalette = ({ 
  currentMode, 
  currentClass, 
  onModeChange, 
  onClassChange, 
  onCalibrate, 
  scale,
  customMarkupTypes = [],
  onAddCustomType,
  projectName,
  currentSheet,
  currentPageNum = 1,
  entities = [],
  onGhostsDetected,
  onAutonomousComplete,
  onAddMarkups,  // Callback to add AI-generated markups to PDFViewer
  onFocusGhost,  // Callback to focus/zoom to a ghost detection on the drawing
  frameDesignation = '',  // Current frame designation (e.g., "A", "F")
  onFrameDesignationChange  // Callback when frame designation changes
}) => {
  const [expandedCategory, setExpandedCategory] = useState('HIGHLIGHT');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  
  // Adapter for legacy prop names
  const onToolSelect = (mode, className) => {
    if (onModeChange) onModeChange(mode);
    if (onClassChange) onClassChange(className);
  };
  
  const activeToolMode = currentMode;
  const activeClass = currentClass;
  const onStartCalibration = onCalibrate;

  const getShortcutText = (mode, className) => {
    const modePrefixes = {
      'Highlight': '',
      'Polyline': 'Shift+',
      'Area': 'Ctrl+',
      'Count': 'Alt+'
    };
    
    const baseShortcut = GLAZING_CLASSES[className]?.shortcut;
    return baseShortcut ? `${modePrefixes[mode]}${baseShortcut}` : '';
  };

  const isActive = (mode, className) => {
    return activeToolMode === mode && activeClass === className;
  };

  // Handle adding a custom type for a specific mode
  const handleAddCustomForMode = (mode) => {
    const name = prompt(`Enter custom ${mode.toLowerCase()} name:`);
    if (name && name.trim()) {
      // Auto-assign a color based on how many custom types exist
      const colorIndex = customMarkupTypes.length % CUSTOM_COLORS.length;
      const autoColor = CUSTOM_COLORS[colorIndex];
      
      // Add the custom type with the parent mode
      if (onAddCustomType) {
        onAddCustomType(name.trim(), mode, autoColor);
      }
      
      // Immediately select the new custom type
      onToolSelect(mode, name.trim());
    }
  };

  const renderCategoryItems = (mode, items) => {
    // Get custom types for this specific mode
    const customsForMode = customMarkupTypes.filter(c => c.baseMode === mode);
    
    return (
      <>
        {items.map(className => {
          const config = GLAZING_CLASSES[className];
          if (!config) return null;

          const shortcut = getShortcutText(mode, className);
          const active = isActive(mode, className);

          return (
            <div
              key={`${mode}-${className}`}
              onClick={() => onToolSelect(mode, className)}
              className={`tool-item ${active ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                cursor: 'pointer',
                backgroundColor: active ? '#4a6785' : 'transparent',
                borderLeft: active ? `4px solid ${config.color}` : '4px solid transparent',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = '#3a5871';
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    backgroundColor: config.color,
                    borderRadius: '2px',
                    border: '1px solid rgba(255,255,255,0.3)'
                  }}
                />
                <span style={{ color: 'white', fontSize: '11px', fontWeight: active ? 'bold' : 'normal' }}>
                  {className}
                </span>
              </div>
              {shortcut && (
                <span style={{ color: '#95a5a6', fontSize: '9px', fontFamily: 'monospace' }}>
                  {shortcut}
                </span>
              )}
            </div>
          );
        })}
        
        {/* Render custom types for this mode */}
        {customsForMode.map(custom => {
          const active = isActive(mode, custom.name);
          return (
            <div
              key={`custom-${custom.id}`}
              onClick={() => onToolSelect(mode, custom.name)}
              className="tool-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                cursor: 'pointer',
                backgroundColor: active ? '#4a6785' : 'transparent',
                borderLeft: active ? `4px solid ${custom.color}` : '4px solid transparent',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = '#3a5871';
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    backgroundColor: custom.color,
                    borderRadius: '2px',
                    border: '1px solid rgba(255,255,255,0.3)'
                  }}
                />
                <span style={{ color: 'white', fontSize: '11px', fontWeight: active ? 'bold' : 'normal' }}>
                  ⭐ {custom.name}
                </span>
              </div>
            </div>
          );
        })}
        
        {/* + Custom button at end of each category */}
        <div
          onClick={() => handleAddCustomForMode(mode)}
          className="tool-item add-custom"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 10px',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            borderLeft: '4px solid transparent',
            borderTop: '1px dashed #4a5568',
            marginTop: '4px',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#27ae6033'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <Plus size={14} color="#27ae60" />
          <span style={{ color: '#27ae60', fontSize: '11px', fontWeight: '500' }}>
            + Custom {mode}
          </span>
        </div>
      </>
    );
  };

  const categoryIcons = {
    'HIGHLIGHT': '🖍',
    'POLYLINE': '📏',
    'AREA': '📐',
    'COUNT': '🔢'
  };

  if (isCollapsed) {
    return (
      <div style={{
        width: '40px',
        backgroundColor: '#2c3e50',
        borderLeft: '1px solid #1a252f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '10px 0'
      }}>
        <button
          onClick={() => setIsCollapsed(false)}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '10px'
          }}
        >
          ☰
        </button>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      backgroundColor: '#2c3e50',
      borderLeft: '1px solid #1a252f',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header with Collapse Button */}
      {/* Calibration Button */}
      <button
        onClick={onStartCalibration}
        style={{
          backgroundColor: '#e67e22',
          color: 'white',
          fontWeight: 'bold',
          padding: '12px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '13px',
          margin: '10px',
          borderRadius: '4px',
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d35400'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#e67e22'}
      >
        📏 CALIBRATE SCALE
      </button>

      {/* Frame Designation Input */}
      <div style={{
        margin: '0 10px 10px 10px',
        padding: '10px',
        backgroundColor: '#1a252f',
        borderRadius: '4px'
      }}>
        <label style={{ 
          color: '#95a5a6', 
          fontSize: '11px', 
          display: 'block', 
          marginBottom: '6px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Frame Designation
        </label>
        <input
          type="text"
          value={frameDesignation}
          onChange={(e) => onFrameDesignationChange && onFrameDesignationChange(e.target.value.toUpperCase())}
          placeholder="e.g., A, F, B1"
          style={{
            width: '100%',
            padding: '8px 10px',
            backgroundColor: '#2c3e50',
            border: '1px solid #34495e',
            borderRadius: '4px',
            color: '#ecf0f1',
            fontSize: '14px',
            fontWeight: '600',
            textAlign: 'center',
            textTransform: 'uppercase',
            boxSizing: 'border-box'
          }}
        />
        <span style={{ 
          color: '#7f8c8d', 
          fontSize: '10px', 
          display: 'block', 
          marginTop: '4px' 
        }}>
          Tag markups with Frame A, Frame F, etc.
        </span>
      </div>

      {/* Scale Display */}
      <div style={{
        color: '#bdc3c7',
        textAlign: 'center',
        fontSize: '11px',
        padding: '0 10px 10px 10px'
      }}>
        {scale ? `Scale: ${scale.toFixed(2)} px/ft` : 'Scale: Not Set'}
      </div>

      {/* AI Automation Button */}
      <AIAutomationButton 
        projectName={projectName}
        currentSheet={currentSheet}
        currentPageNum={currentPageNum}
        entities={entities}
        onGhostsDetected={onGhostsDetected}
        onAutonomousComplete={onAutonomousComplete}
        onAddMarkups={onAddMarkups}
        onFocusGhost={onFocusGhost}
      />

      {/* Tool Categories Accordion */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {Object.entries(TOOL_CATEGORIES).map(([categoryMode, items]) => {
          const isExpanded = expandedCategory === categoryMode;
          const mode = TOOL_MODES[categoryMode];

          return (
            <div key={categoryMode} style={{ borderBottom: '1px solid #1a252f' }}>
              {/* Category Header */}
              <div
                onClick={() => setExpandedCategory(isExpanded ? null : categoryMode)}
                style={{
                  backgroundColor: '#34495e',
                  color: 'white',
                  fontWeight: 'bold',
                  padding: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '12px'
                }}
              >
                <span>{categoryIcons[categoryMode]} {mode}</span>
                <span style={{ fontSize: '10px' }}>{isExpanded ? '▼' : '▶'}</span>
              </div>

              {/* Category Items */}
              {isExpanded && (
                <div style={{ backgroundColor: '#3e5871', maxHeight: '400px', overflowY: 'auto' }}>
                  {renderCategoryItems(mode, items)}
                </div>
              )}
            </div>
          );
        })}
        
        {/* Custom Markup Types Section */}
        {customMarkupTypes.length > 0 && (
          <div style={{ borderBottom: '1px solid #1a252f' }}>
            <div
              onClick={() => setExpandedCategory(expandedCategory === 'CUSTOM' ? null : 'CUSTOM')}
              style={{
                backgroundColor: '#8e44ad',
                color: 'white',
                fontWeight: 'bold',
                padding: '12px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '12px'
              }}
            >
              <span>⭐ CUSTOM</span>
              <span style={{ fontSize: '10px' }}>{expandedCategory === 'CUSTOM' ? '▼' : '▶'}</span>
            </div>
            
            {expandedCategory === 'CUSTOM' && (
              <div style={{ backgroundColor: '#3e5871', maxHeight: '400px', overflowY: 'auto' }}>
                {customMarkupTypes.map(custom => (
                  <div
                    key={custom.id}
                    onClick={() => onToolSelect(custom.baseMode, custom.name)}
                    className="tool-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      backgroundColor: activeClass === custom.name ? '#4a6785' : 'transparent',
                      borderLeft: activeClass === custom.name ? `4px solid ${custom.color}` : '4px solid transparent',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (activeClass !== custom.name) e.currentTarget.style.backgroundColor = '#3a5871';
                    }}
                    onMouseLeave={(e) => {
                      if (activeClass !== custom.name) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '16px',
                          height: '16px',
                          backgroundColor: custom.color,
                          borderRadius: '2px',
                          border: '1px solid rgba(255,255,255,0.3)'
                        }}
                      />
                      <span style={{ color: 'white', fontSize: '11px', fontWeight: activeClass === custom.name ? 'bold' : 'normal' }}>
                        {custom.name}
                      </span>
                    </div>
                    <span style={{ color: '#95a5a6', fontSize: '9px' }}>
                      {custom.baseMode}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolPalette;