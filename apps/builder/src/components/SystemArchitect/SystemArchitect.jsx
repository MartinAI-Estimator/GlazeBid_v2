import React, { useState } from 'react';
import { useProject } from '../../context/ProjectContext';
import {
  SYSTEM_TYPES,
  PROFILE_SIZES,
  CONNECTION_TYPES,
  FINISH_TYPES,
  DOOR_TYPES,
  HARDWARE_SETS,
  SCOPE_TAGS,
  FORMULA_BASE_VARS
} from '../../utils/pricingLogic';

/**
 * SystemArchitect Component
 * Layer 23: Enhanced with Labor Triad & Formula Builder
 * The "Brain Transplant" - Captures Excel drop-down logic
 * Manages framing DNA, door intelligence, alternates, and advanced labor
 */
const SystemArchitect = ({ isModal = false, onClose = null }) => {
  const { systemDefinitions, setSystemDefinitions, adminSettings = {} } = useProject();
  const [selectedSystemId, setSelectedSystemId] = useState(systemDefinitions[0]?.id || null);

  const selectedSystem = systemDefinitions.find(s => s.id === selectedSystemId);

  // Get breakout categories from admin settings
  const breakoutCategories = adminSettings.breakoutCategories || [
    "Exterior Storefront",
    "Curtain Wall",
    "Interior Storefront",
    "All Glass Entrances",
    "Mirrors"
  ];

  // Debug logging
  React.useEffect(() => {
    console.log('🔧 SystemArchitect mounted', {
      systemCount: systemDefinitions?.length,
      categoryCount: breakoutCategories?.length,
      selectedSystemId
    });
  }, []);

  // Safety check
  if (!setSystemDefinitions) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        color: '#f85149',
        fontSize: '14px'
      }}>
        ⚠️ Error: Project context not available. Please reload the application.
      </div>
    );
  }

  // Add new system
  const handleAddSystem = () => {
    const newSystem = {
      id: Date.now(),
      name: `New System ${systemDefinitions.length + 1}`,
      type: 'STOREFRONT',
      
      // Layer 26: Proposal Breakout Assignment
      breakoutCategory: breakoutCategories[0] || 'Exterior Storefront',
      
      // Basic profile
      profileWidth: 2.0,
      profileDepth: 4.5,
      
      // Framing DNA
      scopeTag: 'BASE_BID',
      profileSize: '2x4.5',
      connectionType: 'SCREW_SPLINE',
      finish: 'CLEAR_ANOD',
      
      // Assembly DNA
      anchorSpacing: 18,
      caulkJoints: 2,
      steelReinforcement: false,
      
      // Layer 23: Labor Triad
      laborRates: {
        shopHours: 0.11,
        distHours: 0.05,
        fieldHours: 0.26
      },
      
      // Layer 23: Formula Builder
      formulas: [
        {
          target: 'Caulk',
          baseVar: 'PERIMETER',
          factor: 2.0,
          constant: 0,
          unit: 'LF'
        }
      ],
      
      // Material specs
      glassType: 'insulated_1inch',
      gasketType: 'standard_epdm',
      
      // Features
      shearBlocks: false,
      thermalBreak: false,
      structuralSilicone: false,
      
      // Door intelligence
      doorType: 'MEDIUM_STILE',
      hardwareSet: 'HINGE_DEADBOLT',
      
      // Visual
      color: '#58a6ff'
    };
    
    setSystemDefinitions(prev => [...prev, newSystem]);
    setSelectedSystemId(newSystem.id);
  };

  // Duplicate system
  const handleDuplicateSystem = (systemId) => {
    const system = systemDefinitions.find(s => s.id === systemId);
    if (!system) return;
    
    const duplicated = {
      ...system,
      id: Date.now(),
      name: `${system.name} (Copy)`
    };
    
    setSystemDefinitions(prev => [...prev, duplicated]);
    setSelectedSystemId(duplicated.id);
  };

  // Delete system
  const handleDeleteSystem = (systemId) => {
    if (systemDefinitions.length <= 1) {
      alert('Cannot delete the last system');
      return;
    }
    
    if (window.confirm('Are you sure you want to delete this system?')) {
      setSystemDefinitions(prev => prev.filter(s => s.id !== systemId));
      if (selectedSystemId === systemId) {
        setSelectedSystemId(systemDefinitions[0]?.id);
      }
    }
  };

  // Update system field
  const updateSystem = (field, value) => {
    if (!selectedSystem) return;
    
    setSystemDefinitions(prev => prev.map(system =>
      system.id === selectedSystemId
        ? { ...system, [field]: value }
        : system
    ));
  };

  // Calculate live preview factors
  const getLivePreview = () => {
    if (!selectedSystem) return null;
    
    const profileData = PROFILE_SIZES[selectedSystem.profileSize] || PROFILE_SIZES['2x4.5'];
    const connectionData = CONNECTION_TYPES[selectedSystem.connectionType] || CONNECTION_TYPES.SCREW_SPLINE;
    const finishData = FINISH_TYPES[selectedSystem.finish] || FINISH_TYPES.CLEAR_ANOD;
    const hardwareData = HARDWARE_SETS[selectedSystem.hardwareSet] || HARDWARE_SETS.HINGE_DEADBOLT;
    
    return {
      metalLbsPerFt: profileData.metalLbsPerFt,
      laborRates: selectedSystem.laborRates || { shopHours: 0.11, distHours: 0.05, fieldHours: 0.26 },
      finishMultiplier: finishData.costMultiplier,
      hardwareCost: hardwareData.cost,
      hardwareLaborHours: hardwareData.laborHours
    };
  };

  const preview = getLivePreview();

  return (
    <div style={{
      width: isModal ? '90vw' : '100%',
      maxWidth: isModal ? '1400px' : 'none',
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
            🏗️ System Architect
          </h2>
          <p style={{ fontSize: '13px', color: '#8b949e', margin: 0 }}>
            Define detailed system specifications (Framing DNA, Door Hardware, Alternates)
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

      {/* Content - Split Panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Panel - System List */}
        <div style={{
          width: '280px',
          minWidth: '280px',
          backgroundColor: '#161b22',
          borderRight: '1px solid #30363d',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Add System Button */}
          <div style={{ padding: '16px', borderBottom: '1px solid #30363d' }}>
            <button
              onClick={handleAddSystem}
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
              New System
            </button>
          </div>

          {/* System Cards - Grouped by Breakout Category */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            {/* Group systems by breakout category */}
            {breakoutCategories.map(category => {
              const systemsInCategory = systemDefinitions.filter(
                sys => (sys.breakoutCategory || breakoutCategories[0]) === category
              );
              
              if (systemsInCategory.length === 0) return null;
              
              return (
                <div key={category} style={{ marginBottom: '20px' }}>
                  {/* Category Header */}
                  <div style={{
                    padding: '8px 12px',
                    backgroundColor: '#0d1117',
                    borderLeft: '3px solid #3fb950',
                    marginBottom: '8px',
                    borderRadius: '4px'
                  }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: '700',
                      color: '#3fb950',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      {category}
                    </div>
                    <div style={{
                      fontSize: '10px',
                      color: '#6e7681',
                      marginTop: '2px'
                    }}>
                      {systemsInCategory.length} system{systemsInCategory.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  
                  {/* Systems in this category */}
                  {systemsInCategory.map(system => {
                    const scopeTagData = SCOPE_TAGS[system.scopeTag] || SCOPE_TAGS.BASE_BID;
              
              return (
                <div
                  key={system.id}
                  onClick={() => setSelectedSystemId(system.id)}
                  style={{
                    padding: '12px',
                    backgroundColor: selectedSystemId === system.id ? '#1c2128' : '#0d1117',
                    border: `2px solid ${selectedSystemId === system.id ? system.color : '#30363d'}`,
                    borderRadius: '8px',
                    marginBottom: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {/* Color Tag & Scope Tag */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        backgroundColor: system.color
                      }}
                    />
                    <div style={{
                      padding: '2px 8px',
                      backgroundColor: scopeTagData.color,
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: '700',
                      color: 'white',
                      textTransform: 'uppercase'
                    }}>
                      {scopeTagData.label}
                    </div>
                  </div>

                  {/* System Name */}
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#c9d1d9',
                    marginBottom: '4px'
                  }}>
                    {system.name}
                  </div>

                  {/* System Type */}
                  <div style={{
                    fontSize: '12px',
                    color: '#8b949e',
                    marginBottom: '8px'
                  }}>
                    {system.type.replace('_', ' ')}
                  </div>

                  {/* Quick Specs */}
                  <div style={{ fontSize: '11px', color: '#6e7681', lineHeight: '1.5' }}>
                    Profile: {PROFILE_SIZES[system.profileSize]?.label || 'N/A'}<br />
                    Connection: {CONNECTION_TYPES[system.connectionType]?.label.split(' ')[0] || 'N/A'}<br />
                    Finish: {FINISH_TYPES[system.finish]?.label.split(' ')[0] || 'N/A'}
                  </div>

                  {/* Action Buttons */}
                  <div style={{
                    marginTop: '10px',
                    display: 'flex',
                    gap: '6px'
                  }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateSystem(system.id);
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
                        handleDeleteSystem(system.id);
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
          {!selectedSystem ? (
            <div style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8b949e'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔧</div>
              <div style={{ fontSize: '16px', fontWeight: '600' }}>No System Selected</div>
              <div style={{ fontSize: '13px', marginTop: '8px' }}>Select a system from the list to edit</div>
            </div>
          ) : (
            <div>
              {/* Basic Information */}
              <Section title="Basic Information">
                <FormRow label="System Name">
                  <input
                    type="text"
                    value={selectedSystem.name}
                    onChange={(e) => updateSystem('name', e.target.value)}
                    style={inputStyle}
                    placeholder="e.g., Ext SF 1 - Standard 2x4.5"
                  />
                </FormRow>

                <FormRow label="System Type">
                  <select
                    value={selectedSystem.type}
                    onChange={(e) => updateSystem('type', e.target.value)}
                    style={inputStyle}
                  >
                    {Object.entries(SYSTEM_TYPES).map(([key, value]) => (
                      <option key={key} value={value}>
                        {value.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </FormRow>

                <FormRow label="Scope Tag (Alternates)">
                  <select
                    value={selectedSystem.scopeTag || 'BASE_BID'}
                    onChange={(e) => updateSystem('scopeTag', e.target.value)}
                    style={{
                      ...inputStyle,
                      color: selectedSystem.scopeTag === 'ALTERNATE' ? '#f0883e' : '#c9d1d9'
                    }}
                  >
                    {Object.entries(SCOPE_TAGS).map(([key, data]) => (
                      <option key={key} value={key}>
                        {data.label}
                      </option>
                    ))}
                  </select>
                </FormRow>

                <FormRow label="Proposal Category 📋">
                  <select
                    value={selectedSystem.breakoutCategory || breakoutCategories[0]}
                    onChange={(e) => updateSystem('breakoutCategory', e.target.value)}
                    style={{
                      ...inputStyle,
                      fontWeight: '600',
                      color: '#3fb950'
                    }}
                  >
                    {breakoutCategories.map(category => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <div style={{
                    marginTop: '4px',
                    fontSize: '11px',
                    color: '#8b949e'
                  }}>
                    💡 This groups systems in your proposal (e.g., "Exterior Storefront: $150k")
                  </div>
                </FormRow>

                <FormRow label="Color Tag">
                  <input
                    type="color"
                    value={selectedSystem.color}
                    onChange={(e) => updateSystem('color', e.target.value)}
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

              {/* Framing DNA */}
              <Section title="Framing DNA (Pricing Logic)" icon="🔩">
                <FormRow label="Profile Size" help="Drives metal weight calculation">
                  <select
                    value={selectedSystem.profileSize || '2x4.5'}
                    onChange={(e) => updateSystem('profileSize', e.target.value)}
                    style={inputStyle}
                  >
                    {Object.entries(PROFILE_SIZES).map(([key, data]) => (
                      <option key={key} value={key}>
                        {data.label} - {data.metalLbsPerFt} lbs/ft
                      </option>
                    ))}
                  </select>
                </FormRow>

                <FormRow label="Connection Type" help="Impacts labor hours">
                  <select
                    value={selectedSystem.connectionType || 'SCREW_SPLINE'}
                    onChange={(e) => updateSystem('connectionType', e.target.value)}
                    style={inputStyle}
                  >
                    {Object.entries(CONNECTION_TYPES).map(([key, data]) => (
                      <option key={key} value={key}>
                        {data.label} - {data.laborMultiplier}x labor
                      </option>
                    ))}
                  </select>
                </FormRow>

                <FormRow label="Finish Type" help="Adds cost premium to metal">
                  <select
                    value={selectedSystem.finish || 'CLEAR_ANOD'}
                    onChange={(e) => updateSystem('finish', e.target.value)}
                    style={inputStyle}
                  >
                    {Object.entries(FINISH_TYPES).map(([key, data]) => (
                      <option key={key} value={key}>
                        {data.label} - {((data.costMultiplier - 1) * 100).toFixed(0)}% premium
                      </option>
                    ))}
                  </select>
                </FormRow>
              </Section>

              {/* Door Intelligence */}
              <Section title="Door Hardware Intelligence" icon="🚪">
                <FormRow label="Door Stile Type">
                  <select
                    value={selectedSystem.doorType || 'MEDIUM_STILE'}
                    onChange={(e) => updateSystem('doorType', e.target.value)}
                    style={inputStyle}
                  >
                    {Object.entries(DOOR_TYPES).map(([key, data]) => (
                      <option key={key} value={key}>
                        {data.label}
                      </option>
                    ))}
                  </select>
                </FormRow>

                <FormRow label="Hardware Set" help="Drives hardware cost & labor">
                  <select
                    value={selectedSystem.hardwareSet || 'HINGE_DEADBOLT'}
                    onChange={(e) => updateSystem('hardwareSet', e.target.value)}
                    style={inputStyle}
                  >
                    {Object.entries(HARDWARE_SETS).map(([key, data]) => (
                      <option key={key} value={key}>
                        {data.label} - ${data.cost} + {data.laborHours} hrs
                      </option>
                    ))}
                  </select>
                </FormRow>
              </Section>

              {/* Assembly Details */}
              <Section title="Assembly Details">
                <FormRow label="Anchor Spacing (inches)">
                  <input
                    type="number"
                    min="12"
                    max="24"
                    step="2"
                    value={selectedSystem.anchorSpacing}
                    onChange={(e) => updateSystem('anchorSpacing', parseInt(e.target.value))}
                    style={inputStyle}
                  />
                </FormRow>

                <FormRow label="Caulk Joints (perimeter beads)">
                  <input
                    type="number"
                    min="1"
                    max="3"
                    step="1"
                    value={selectedSystem.caulkJoints}
                    onChange={(e) => updateSystem('caulkJoints', parseInt(e.target.value))}
                    style={inputStyle}
                  />
                </FormRow>
              </Section>

              {/* Layer 23: Labor Triad */}
              <Section title="⚙️ Labor Triad - Shop/Distribution/Field">
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ color: '#8b949e', fontSize: '13px', marginBottom: '12px' }}>
                    Define labor hours per square foot for each phase
                  </p>
                  
                  <FormRow label="🏭 Shop Fab (hrs/sf)">
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={selectedSystem.laborRates?.shopHours || 0.11}
                      onChange={(e) => updateSystem('laborRates', {
                        ...selectedSystem.laborRates,
                        shopHours: parseFloat(e.target.value) || 0
                      })}
                      style={inputStyle}
                    />
                  </FormRow>

                  <FormRow label="🚚 Handling (hrs/sf)">
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={selectedSystem.laborRates?.distHours || 0.05}
                      onChange={(e) => updateSystem('laborRates', {
                        ...selectedSystem.laborRates,
                        distHours: parseFloat(e.target.value) || 0
                      })}
                      style={inputStyle}
                    />
                  </FormRow>

                  <FormRow label="🏗️ Install (hrs/sf)">
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.01"
                      value={selectedSystem.laborRates?.fieldHours || 0.26}
                      onChange={(e) => updateSystem('laborRates', {
                        ...selectedSystem.laborRates,
                        fieldHours: parseFloat(e.target.value) || 0
                      })}
                      style={inputStyle}
                    />
                  </FormRow>

                  {/* Total Labor Preview */}
                  <div style={{
                    marginTop: '12px',
                    padding: '12px',
                    backgroundColor: '#1c2128',
                    border: '1px solid #30363d',
                    borderRadius: '6px'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ color: '#8b949e', fontSize: '13px' }}>Total Labor:</span>
                      <span style={{ 
                        color: '#3fb950', 
                        fontSize: '16px',
                        fontWeight: '600',
                        fontFamily: 'monospace'
                      }}>
                        {((selectedSystem.laborRates?.shopHours || 0) + 
                          (selectedSystem.laborRates?.distHours || 0) + 
                          (selectedSystem.laborRates?.fieldHours || 0)).toFixed(3)} hrs/sf
                      </span>
                    </div>
                  </div>
                </div>
              </Section>

              {/* Features */}
              <Section title="System Features">
                <FeatureToggle
                  label="Steel Reinforcement"
                  checked={selectedSystem.steelReinforcement}
                  onChange={(checked) => updateSystem('steelReinforcement', checked)}
                />
                <FeatureToggle
                  label="Shear Blocks"
                  checked={selectedSystem.shearBlocks}
                  onChange={(checked) => updateSystem('shearBlocks', checked)}
                />
                <FeatureToggle
                  label="Thermal Break"
                  checked={selectedSystem.thermalBreak}
                  onChange={(checked) => updateSystem('thermalBreak', checked)}
                />
                <FeatureToggle
                  label="Structural Silicone"
                  checked={selectedSystem.structuralSilicone}
                  onChange={(checked) => updateSystem('structuralSilicone', checked)}
                />
              </Section>

              {/* Layer 23: Formula Builder */}
              <Section title="🧮 Formula Builder - Derivative Calculations">
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ color: '#8b949e', fontSize: '13px', marginBottom: '12px' }}>
                    Define formulas for materials calculated from takeoff geometry
                  </p>
                  
                  {/* Formula List */}
                  {(selectedSystem.formulas || []).map((formula, index) => (
                    <div key={index} style={{
                      marginBottom: '12px',
                      padding: '12px',
                      backgroundColor: '#1c2128',
                      border: '1px solid #30363d',
                      borderRadius: '6px'
                    }}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '120px 150px 100px 80px 60px 40px',
                        gap: '8px',
                        alignItems: 'center'
                      }}>
                        {/* Target */}
                        <select
                          value={formula.target}
                          onChange={(e) => {
                            const newFormulas = [...(selectedSystem.formulas || [])];
                            newFormulas[index].target = e.target.value;
                            updateSystem('formulas', newFormulas);
                          }}
                          style={{
                            ...inputStyle,
                            fontSize: '12px'
                          }}
                        >
                          <option value="Caulk">Caulk</option>
                          <option value="Steel">Steel</option>
                          <option value="Subsill">Subsill</option>
                          <option value="Flashing">Flashing</option>
                          <option value="Misc">Misc</option>
                        </select>

                        {/* Base Variable */}
                        <select
                          value={formula.baseVar}
                          onChange={(e) => {
                            const newFormulas = [...(selectedSystem.formulas || [])];
                            newFormulas[index].baseVar = e.target.value;
                            updateSystem('formulas', newFormulas);
                          }}
                          style={{
                            ...inputStyle,
                            fontSize: '12px'
                          }}
                        >
                          <option value="PERIMETER">Perimeter</option>
                          <option value="AREA">Area (SF)</option>
                          <option value="JOINTS">Joints</option>
                          <option value="MULLION_LF">Mullion LF</option>
                          <option value="PANELS">Panels</option>
                        </select>

                        {/* Factor */}
                        <input
                          type="number"
                          placeholder="Factor"
                          value={formula.factor}
                          onChange={(e) => {
                            const newFormulas = [...(selectedSystem.formulas || [])];
                            newFormulas[index].factor = parseFloat(e.target.value) || 0;
                            updateSystem('formulas', newFormulas);
                          }}
                          style={{
                            ...inputStyle,
                            fontSize: '12px'
                          }}
                        />

                        {/* Constant */}
                        <input
                          type="number"
                          placeholder="Add"
                          value={formula.constant}
                          onChange={(e) => {
                            const newFormulas = [...(selectedSystem.formulas || [])];
                            newFormulas[index].constant = parseFloat(e.target.value) || 0;
                            updateSystem('formulas', newFormulas);
                          }}
                          style={{
                            ...inputStyle,
                            fontSize: '12px'
                          }}
                        />

                        {/* Unit */}
                        <input
                          type="text"
                          placeholder="Unit"
                          value={formula.unit || 'EA'}
                          onChange={(e) => {
                            const newFormulas = [...(selectedSystem.formulas || [])];
                            newFormulas[index].unit = e.target.value;
                            updateSystem('formulas', newFormulas);
                          }}
                          style={{
                            ...inputStyle,
                            fontSize: '11px'
                          }}
                        />

                        {/* Delete */}
                        <button
                          onClick={() => {
                            const newFormulas = (selectedSystem.formulas || []).filter((_, i) => i !== index);
                            updateSystem('formulas', newFormulas);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#f85149',
                            cursor: 'pointer',
                            fontSize: '16px'
                          }}
                        >
                          ×
                        </button>
                      </div>

                      {/* Formula Display */}
                      <div style={{
                        marginTop: '8px',
                        padding: '6px',
                        backgroundColor: '#0d1117',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#58a6ff',
                        fontFamily: 'monospace'
                      }}>
                        {formula.target} = ({formula.baseVar} × {formula.factor}) + {formula.constant} {formula.unit}
                      </div>
                    </div>
                  ))}

                  {/* Add Formula Button */}
                  <button
                    onClick={() => {
                      const newFormula = {
                        target: 'Caulk',
                        baseVar: 'PERIMETER',
                        factor: 1.0,
                        constant: 0,
                        unit: 'LF'
                      };
                      updateSystem('formulas', [...(selectedSystem.formulas || []), newFormula]);
                    }}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#238636',
                      border: '1px solid #2ea043',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '13px',
                      cursor: 'pointer',
                      width: '100%',
                      marginTop: '8px'
                    }}
                  >
                    + Add Formula
                  </button>
                </div>
              </Section>

              {/* Live Preview */}
              {preview && (
                <div style={{
                  marginTop: '24px',
                  padding: '16px',
                  backgroundColor: '#161b22',
                  border: '2px solid #238636',
                  borderRadius: '8px'
                }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '700',
                    color: '#238636',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>⚡</span>
                    Live Calculation Factors
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '12px'
                  }}>
                    <PreviewCard label="Metal Weight" value={`${preview.metalLbsPerFt} lbs/ft`} />
                    <PreviewCard 
                      label="Total Labor" 
                      value={`${((preview.laborRates?.shopHours || 0.11) + (preview.laborRates?.distHours || 0.05) + (preview.laborRates?.fieldHours || 0.26)).toFixed(3)} hrs/sf`} 
                    />
                    <PreviewCard label="Finish Premium" value={`${((preview.finishMultiplier - 1) * 100).toFixed(0)}%`} />
                    <PreviewCard label="Hardware Cost" value={`$${preview.hardwareCost}`} />
                  </div>
                </div>
              )}
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
  <div style={{ marginBottom: '24px' }}>
    <div style={{
      fontSize: '15px',
      fontWeight: '700',
      color: '#c9d1d9',
      marginBottom: '12px',
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
  <div style={{ marginBottom: '14px' }}>
    <label style={{
      display: 'block',
      fontSize: '13px',
      fontWeight: '600',
      color: '#8b949e',
      marginBottom: '6px'
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

const FeatureToggle = ({ label, checked, onChange }) => (
  <div
    onClick={() => onChange(!checked)}
    style={{
      padding: '10px 12px',
      backgroundColor: checked ? '#1c2128' : '#0d1117',
      border: `2px solid ${checked ? '#238636' : '#30363d'}`,
      borderRadius: '6px',
      marginBottom: '8px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      transition: 'all 0.2s'
    }}
  >
    <span style={{
      fontSize: '13px',
      fontWeight: '600',
      color: checked ? '#238636' : '#8b949e'
    }}>
      {label}
    </span>
    <div style={{
      width: '20px',
      height: '20px',
      borderRadius: '4px',
      backgroundColor: checked ? '#238636' : '#21262d',
      border: `1px solid ${checked ? '#238636' : '#30363d'}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: '12px',
      fontWeight: '700'
    }}>
      {checked ? '✓' : ''}
    </div>
  </div>
);

const PreviewCard = ({ label, value }) => (
  <div style={{
    padding: '12px',
    backgroundColor: '#0d1117',
    borderRadius: '6px',
    border: '1px solid #30363d'
  }}>
    <div style={{
      fontSize: '11px',
      color: '#6e7681',
      marginBottom: '4px',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    }}>
      {label}
    </div>
    <div style={{
      fontSize: '16px',
      fontWeight: '700',
      color: '#58a6ff'
    }}>
      {value}
    </div>
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

export default SystemArchitect;
