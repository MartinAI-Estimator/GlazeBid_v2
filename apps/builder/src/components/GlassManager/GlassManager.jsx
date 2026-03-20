import React, { useState } from 'react';
import { useProject } from '../../context/ProjectContext';

/**
 * GlassManager Component
 * The "Glass Library" - Define project-specific glass types with vendor quotes
 * Replaces generic "$12/SF" with penny-perfect pricing
 */

// Glass Makeup Types
const GLASS_MAKEUPS = {
  MONOLITHIC: { label: 'Monolithic', icon: '▢', description: 'Single pane' },
  INSULATED: { label: 'Insulated', icon: '▢▢', description: 'IG unit (dual pane)' },
  LAMINATED: { label: 'Laminated', icon: '▢≡', description: 'Laminated safety glass' },
  TRIPLE: { label: 'Triple IG', icon: '▢▢▢', description: 'Triple pane insulated' }
};

// Common thickness options
const THICKNESS_OPTIONS = [
  '1/4 inch',
  '3/8 inch',
  '1/2 inch',
  '9/16 inch',
  '5/8 inch',
  '3/4 inch',
  '1 inch',
  '1-1/4 inch',
  '1-3/8 inch'
];

const GlassManager = ({ isModal = false, onClose = null }) => {
  const { glassTypes, setGlassTypes } = useProject();
  const [selectedGlassId, setSelectedGlassId] = useState(glassTypes[0]?.id || null);
  const [showAddForm, setShowAddForm] = useState(false);

  const selectedGlass = glassTypes.find(g => g.id === selectedGlassId);

  // Add new glass type
  const handleAddGlass = () => {
    const newGlass = {
      id: Date.now(),
      code: `GL-${glassTypes.length + 1}`,
      description: 'New Glass Type',
      costPerSF: 12.00,
      vendor: 'TBD',
      quoteRef: '',
      makeup: 'INSULATED',
      thickness: '1 inch',
      color: '#58a6ff'
    };
    
    setGlassTypes(prev => [...prev, newGlass]);
    setSelectedGlassId(newGlass.id);
    setShowAddForm(false);
  };

  // Duplicate glass type
  const handleDuplicateGlass = (glassId) => {
    const glass = glassTypes.find(g => g.id === glassId);
    if (!glass) return;
    
    const duplicated = {
      ...glass,
      id: Date.now(),
      code: `${glass.code}-Copy`,
      description: `${glass.description} (Copy)`
    };
    
    setGlassTypes(prev => [...prev, duplicated]);
    setSelectedGlassId(duplicated.id);
  };

  // Delete glass type
  const handleDeleteGlass = (glassId) => {
    if (glassTypes.length <= 1) {
      alert('Cannot delete the last glass type');
      return;
    }
    
    if (window.confirm('Are you sure you want to delete this glass type?')) {
      setGlassTypes(prev => prev.filter(g => g.id !== glassId));
      if (selectedGlassId === glassId) {
        setSelectedGlassId(glassTypes[0]?.id || null);
      }
    }
  };

  // Update glass field
  const updateGlass = (field, value) => {
    if (!selectedGlass) return;
    
    setGlassTypes(prev => prev.map(glass =>
      glass.id === selectedGlassId
        ? { ...glass, [field]: value }
        : glass
    ));
  };

  return (
    <div style={{
      width: isModal ? '90vw' : '100%',
      maxWidth: isModal ? '1200px' : 'none',
      height: isModal ? '85vh' : '100%',
      backgroundColor: '#0d1117',
      borderRadius: isModal ? '12px' : '0',
      display: 'flex',
      flexDirection: 'column',
      border: isModal ? '1px solid #30363d' : 'none',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid #30363d',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#161b22'
      }}>
        <div>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '700',
            color: '#c9d1d9',
            marginBottom: '4px'
          }}>
            🪟 Glass Library
          </h2>
          <p style={{ fontSize: '13px', color: '#8b949e', margin: 0 }}>
            Define project-specific glass types with vendor quotes for penny-perfect pricing
          </p>
        </div>
        
        {isModal && onClose && (
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#21262d',
              border: '1px solid #30363d',
              borderRadius: '6px',
              color: '#c9d1d9',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            Close
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Panel - Glass Type List */}
        <div style={{
          width: '280px',
          minWidth: '280px',
          backgroundColor: '#161b22',
          borderRight: '1px solid #30363d',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Add Glass Button */}
          <div style={{ padding: '16px', borderBottom: '1px solid #30363d' }}>
            <button
              onClick={handleAddGlass}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#238636',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <span style={{ fontSize: '16px' }}>+</span>
              New Glass Type
            </button>
          </div>

          {/* Glass Cards */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            {glassTypes.map(glass => {
              const makeupInfo = GLASS_MAKEUPS[glass.makeup] || GLASS_MAKEUPS.INSULATED;
              
              return (
                <div
                  key={glass.id}
                  onClick={() => setSelectedGlassId(glass.id)}
                  style={{
                    padding: '14px',
                    backgroundColor: selectedGlassId === glass.id ? '#1c2128' : '#0d1117',
                    border: `2px solid ${selectedGlassId === glass.id ? glass.color : '#30363d'}`,
                    borderRadius: '8px',
                    marginBottom: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {/* Header with Code and Makeup Icon */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px'
                  }}>
                    <div style={{
                      padding: '4px 10px',
                      backgroundColor: glass.color,
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '700',
                      color: 'white',
                      letterSpacing: '0.5px'
                    }}>
                      {glass.code}
                    </div>
                    <div style={{
                      fontSize: '18px',
                      color: '#8b949e'
                    }}>
                      {makeupInfo.icon}
                    </div>
                  </div>

                  {/* Description */}
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#c9d1d9',
                    marginBottom: '6px',
                    lineHeight: '1.3'
                  }}>
                    {glass.description}
                  </div>

                  {/* Cost - Prominent */}
                  <div style={{
                    fontSize: '20px',
                    fontWeight: '700',
                    color: '#4CAF50',
                    marginBottom: '8px'
                  }}>
                    ${glass.costPerSF.toFixed(2)}/SF
                  </div>

                  {/* Vendor and Quote */}
                  <div style={{
                    fontSize: '11px',
                    color: '#6e7681',
                    marginBottom: '4px'
                  }}>
                    Vendor: <span style={{ color: '#8b949e', fontWeight: '600' }}>{glass.vendor}</span>
                  </div>
                  {glass.quoteRef && (
                    <div style={{
                      fontSize: '11px',
                      color: '#6e7681'
                    }}>
                      Quote: <span style={{ color: '#8b949e', fontWeight: '600' }}>{glass.quoteRef}</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div style={{
                    marginTop: '12px',
                    display: 'flex',
                    gap: '6px'
                  }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateGlass(glass.id);
                      }}
                      style={{
                        flex: 1,
                        padding: '6px',
                        backgroundColor: '#21262d',
                        border: '1px solid #30363d',
                        borderRadius: '4px',
                        color: '#58a6ff',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteGlass(glass.id);
                      }}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#21262d',
                        border: '1px solid #30363d',
                        borderRadius: '4px',
                        color: '#f85149',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel - Editor */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          backgroundColor: '#0d1117'
        }}>
          {!selectedGlass ? (
            <div style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8b949e'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🪟</div>
              <div style={{ fontSize: '16px', fontWeight: '600' }}>No Glass Type Selected</div>
              <div style={{ fontSize: '13px', marginTop: '8px' }}>Select a glass type from the list to edit</div>
            </div>
          ) : (
            <div>
              {/* Basic Information */}
              <Section title="Glass Identification">
                <FormRow label="Code (GL-1, GL-2, etc.)">
                  <input
                    type="text"
                    value={selectedGlass.code}
                    onChange={(e) => updateGlass('code', e.target.value)}
                    style={inputStyle}
                    placeholder="GL-1"
                  />
                </FormRow>

                <FormRow label="Description">
                  <input
                    type="text"
                    value={selectedGlass.description}
                    onChange={(e) => updateGlass('description', e.target.value)}
                    style={inputStyle}
                    placeholder="e.g., 1-inch Insulated Solarban 60"
                  />
                </FormRow>

                <FormRow label="Color Tag">
                  <input
                    type="color"
                    value={selectedGlass.color}
                    onChange={(e) => updateGlass('color', e.target.value)}
                    style={{
                      width: '60px',
                      height: '40px',
                      border: '1px solid #30363d',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      backgroundColor: 'transparent'
                    }}
                  />
                </FormRow>
              </Section>

              {/* Glass Specifications */}
              <Section title="Glass Specifications" icon="🔬">
                <FormRow label="Makeup Type">
                  <select
                    value={selectedGlass.makeup}
                    onChange={(e) => updateGlass('makeup', e.target.value)}
                    style={inputStyle}
                  >
                    {Object.entries(GLASS_MAKEUPS).map(([key, data]) => (
                      <option key={key} value={key}>
                        {data.icon} {data.label} - {data.description}
                      </option>
                    ))}
                  </select>
                </FormRow>

                <FormRow label="Thickness">
                  <select
                    value={selectedGlass.thickness}
                    onChange={(e) => updateGlass('thickness', e.target.value)}
                    style={inputStyle}
                  >
                    {THICKNESS_OPTIONS.map(thickness => (
                      <option key={thickness} value={thickness}>
                        {thickness}
                      </option>
                    ))}
                  </select>
                </FormRow>
              </Section>

              {/* Vendor Information */}
              <Section title="Vendor Quote Information" icon="📋">
                <FormRow label="Vendor Name">
                  <input
                    type="text"
                    value={selectedGlass.vendor}
                    onChange={(e) => updateGlass('vendor', e.target.value)}
                    style={inputStyle}
                    placeholder="e.g., Oldcastle, Trulite, Viracon"
                  />
                </FormRow>

                <FormRow label="Quote Reference">
                  <input
                    type="text"
                    value={selectedGlass.quoteRef}
                    onChange={(e) => updateGlass('quoteRef', e.target.value)}
                    style={inputStyle}
                    placeholder="e.g., Quote #2024-559"
                  />
                </FormRow>
              </Section>

              {/* Pricing */}
              <Section title="Pricing" icon="💰">
                <FormRow label="Cost per Square Foot" help="Exact price from vendor quote">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px', fontWeight: '700', color: '#8b949e' }}>$</span>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={selectedGlass.costPerSF}
                      onChange={(e) => updateGlass('costPerSF', parseFloat(e.target.value) || 0)}
                      style={{
                        ...inputStyle,
                        fontSize: '18px',
                        fontWeight: '600',
                        color: '#4CAF50',
                        textAlign: 'right'
                      }}
                    />
                    <span style={{ fontSize: '14px', color: '#8b949e', minWidth: '60px' }}>per SF</span>
                  </div>
                </FormRow>

                {/* Cost Preview */}
                <div style={{
                  marginTop: '16px',
                  padding: '16px',
                  backgroundColor: '#161b22',
                  border: '2px solid #238636',
                  borderRadius: '8px'
                }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#238636',
                    marginBottom: '12px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Cost Examples
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '10px'
                  }}>
                    {[
                      { sf: 10, label: '10 SF' },
                      { sf: 50, label: '50 SF' },
                      { sf: 100, label: '100 SF' }
                    ].map(example => (
                      <div
                        key={example.sf}
                        style={{
                          padding: '10px',
                          backgroundColor: '#0d1117',
                          borderRadius: '6px',
                          border: '1px solid #30363d'
                        }}
                      >
                        <div style={{
                          fontSize: '10px',
                          color: '#6e7681',
                          marginBottom: '4px',
                          textTransform: 'uppercase'
                        }}>
                          {example.label}
                        </div>
                        <div style={{
                          fontSize: '15px',
                          fontWeight: '700',
                          color: '#58a6ff'
                        }}>
                          ${(selectedGlass.costPerSF * example.sf).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const Section = ({ title, icon = null, children }) => (
  <div style={{ marginBottom: '28px' }}>
    <div style={{
      fontSize: '15px',
      fontWeight: '700',
      color: '#c9d1d9',
      marginBottom: '14px',
      paddingBottom: '8px',
      borderBottom: '1px solid #30363d',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }}>
      {icon && <span>{icon}</span>}
      {title}
    </div>
    {children}
  </div>
);

const FormRow = ({ label, help = null, children }) => (
  <div style={{ marginBottom: '16px' }}>
    <label style={{
      display: 'block',
      fontSize: '13px',
      fontWeight: '600',
      color: '#8b949e',
      marginBottom: '8px'
    }}>
      {label}
      {help && (
        <span style={{
          marginLeft: '8px',
          fontSize: '11px',
          color: '#6e7681',
          fontWeight: '400'
        }}>
          ({help})
        </span>
      )}
    </label>
    {children}
  </div>
);

// ============================================================================
// STYLES
// ============================================================================

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  backgroundColor: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: '6px',
  color: '#c9d1d9',
  fontSize: '13px',
  fontWeight: '500',
  outline: 'none',
  transition: 'border 0.2s'
};

export default GlassManager;
