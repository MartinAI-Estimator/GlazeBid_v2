import React, { useState } from 'react';
import { useProject } from '../../context/ProjectContext';
import AdminSettings from './AdminSettings';

/**
 * AdminDashboard - The Management Backend
 * Password-protected panel for setting the "Golden Rules"
 * - Labor Matrix (production rates)
 * - Global Multipliers (markup, tax, labor rate)
 * - System Templates (Ext SF, Int SF, SSG CW presets)
 */
const AdminDashboard = ({ onClose }) => {
  const { adminSettings, setAdminSettings, equipmentLibrary, setEquipmentLibrary } = useProject();
  const [activeTab, setActiveTab] = useState('labor');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Material Categories state
  const [showAddCatForm, setShowAddCatForm] = useState(false);
  const [newCatIcon, setNewCatIcon] = useState('📦');
  const [newCatLabel, setNewCatLabel] = useState('');
  const [editingCatId, setEditingCatId] = useState(null);
  const [editCatIcon, setEditCatIcon] = useState('');
  const [editCatLabel, setEditCatLabel] = useState('');

  const materialCategories = adminSettings.materialCategories || [];

  const handleAddCategory = () => {
    const label = newCatLabel.trim();
    if (!label) return;
    const newCat = { id: `cat_${Date.now()}`, icon: newCatIcon.trim() || '📦', label };
    setAdminSettings(prev => ({ ...prev, materialCategories: [...(prev.materialCategories || []), newCat] }));
    setNewCatLabel('');
    setNewCatIcon('📦');
    setShowAddCatForm(false);
  };

  const handleDeleteCategory = (id) => {
    setAdminSettings(prev => ({ ...prev, materialCategories: (prev.materialCategories || []).filter(c => c.id !== id) }));
  };

  const startEditCategory = (cat) => {
    setEditingCatId(cat.id);
    setEditCatIcon(cat.icon);
    setEditCatLabel(cat.label);
  };

  const handleSaveEditCategory = () => {
    const label = editCatLabel.trim();
    if (!label) return;
    setAdminSettings(prev => ({
      ...prev,
      materialCategories: (prev.materialCategories || []).map(c =>
        c.id === editingCatId ? { ...c, icon: editCatIcon.trim() || c.icon, label } : c
      )
    }));
    setEditingCatId(null);
  };

  // Simple password check (in production, use proper auth)
  const handleLogin = (e) => {
    e.preventDefault();
    if (password === 'admin123') { // Replace with secure auth
      setIsAuthenticated(true);
    } else {
      alert('Incorrect password');
    }
  };

  // Update labor rate
  const updateLaborRate = (taskId, value) => {
    setAdminSettings(prev => ({
      ...prev,
      laborLibrary: prev.laborLibrary.map(task =>
        task.id === taskId ? { ...task, hoursPerUnit: parseFloat(value) || 0 } : task
      )
    }));
  };

  // Update financial defaults
  const updateFinancial = (field, value) => {
    setAdminSettings(prev => ({
      ...prev,
      financialDefaults: {
        ...prev.financialDefaults,
        [field]: parseFloat(value) || 0
      }
    }));
  };

  // Update system template
  const toggleTaskInTemplate = (templateName, taskId) => {
    setAdminSettings(prev => ({
      ...prev,
      systemTemplates: {
        ...prev.systemTemplates,
        [templateName]: {
          ...prev.systemTemplates[templateName],
          tasks: prev.systemTemplates[templateName].tasks.includes(taskId)
            ? prev.systemTemplates[templateName].tasks.filter(id => id !== taskId)
            : [...prev.systemTemplates[templateName].tasks, taskId]
        }
      }
    }));
  };

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        padding: '40px',
      }}>
        <div style={{
          backgroundColor: '#1c2128',
          padding: '40px',
          borderRadius: '8px',
          border: '1px solid #30363d',
          width: '400px'
        }}>
          <h2 style={{ color: '#58a6ff', marginBottom: '24px', fontSize: '20px' }}>
            🔒 Management Access Required
          </h2>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#c9d1d9',
                fontSize: '14px',
                marginBottom: '16px'
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="submit"
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#238636',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Unlock
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#21262d',
                  color: '#c9d1d9',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Main Admin Panel
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0d1117',
      border: '1px solid #30363d',
      borderRadius: '8px',
      overflow: 'hidden',
      minHeight: '600px',
    }}>
      {/* Header */}
      <div style={{
        height: '60px',
        backgroundColor: '#161b22',
        borderBottom: '1px solid #30363d',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        justifyContent: 'space-between'
      }}>
        <h1 style={{ color: '#58a6ff', fontSize: '18px', fontWeight: '700' }}>
          ⚙️ Management Dashboard
        </h1>
        <button
          onClick={onClose}
          style={{
            padding: '8px 16px',
            backgroundColor: '#21262d',
            color: '#c9d1d9',
            border: '1px solid #30363d',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Close
        </button>
      </div>

      {/* Tab Navigation */}
      <div style={{
        height: '48px',
        backgroundColor: '#161b22',
        borderBottom: '1px solid #30363d',
        display: 'flex',
        padding: '0 24px'
      }}>
        {[
          { id: 'labor', label: '⏱️ Labor Library', desc: 'Production Rates' },
          { id: 'equipment', label: '🏗️ Equipment', desc: 'Rental Rates' },
          { id: 'categories', label: '📦 Material Categories', desc: 'Bid Builder Dropdowns' },
          { id: 'financial', label: '💰 Financial Defaults', desc: 'Markup & Tax' },
          { id: 'appsettings', label: '⚙️ App Settings', desc: 'Projects Path & Config' },
          { id: 'templates', label: '📋 System Templates', desc: 'Presets' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0 20px',
              backgroundColor: 'transparent',
              color: activeTab === tab.id ? '#58a6ff' : '#8b949e',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #58a6ff' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '24px'
      }}>
        {activeTab === 'labor' && (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ color: '#c9d1d9', fontSize: '18px', marginBottom: '8px' }}>
                Labor Matrix Control
              </h2>
              <p style={{ color: '#8b949e', fontSize: '14px' }}>
                Set exact decimal man-hours for production tasks. These rates apply to all new estimates.
              </p>
            </div>

            <table style={{
              width: '100%',
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '6px',
              borderCollapse: 'collapse'
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #30363d' }}>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Task Name</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Category</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Hours/Unit</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Unit</th>
                </tr>
              </thead>
              <tbody>
                {adminSettings.laborLibrary.map(task => (
                  <tr key={task.id} style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={{ padding: '12px', color: '#c9d1d9', fontSize: '14px' }}>{task.name}</td>
                    <td style={{ padding: '12px', color: '#8b949e', fontSize: '13px' }}>{task.category}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <input
                        type="number"
                        step="0.001"
                        value={task.hoursPerUnit}
                        onChange={(e) => updateLaborRate(task.id, e.target.value)}
                        style={{
                          width: '80px',
                          padding: '6px',
                          backgroundColor: '#0d1117',
                          border: '1px solid #30363d',
                          borderRadius: '4px',
                          color: '#58a6ff',
                          textAlign: 'center',
                          fontSize: '14px',
                          fontWeight: '600'
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px', color: '#8b949e', fontSize: '13px' }}>{task.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'equipment' && (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ color: '#c9d1d9', fontSize: '18px', marginBottom: '8px' }}>
                Equipment Rental Rates
              </h2>
              <p style={{ color: '#8b949e', fontSize: '14px' }}>
                Manage equipment pricing for General Conditions calculations. Rates automatically optimize (daily/weekly/monthly).
              </p>
            </div>

            <table style={{
              width: '100%',
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '6px',
              borderCollapse: 'collapse'
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #30363d' }}>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Equipment Name</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Category</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Daily Rate</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Weekly Rate</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Monthly Rate</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Mobilization</th>
                </tr>
              </thead>
              <tbody>
                {equipmentLibrary.map(equipment => (
                  <tr key={equipment.id} style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={{ padding: '12px', color: '#c9d1d9', fontSize: '14px' }}>{equipment.name}</td>
                    <td style={{ padding: '12px', color: '#8b949e', fontSize: '13px' }}>{equipment.category}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <input
                        type="number"
                        step="10"
                        value={equipment.dailyRate}
                        onChange={(e) => {
                          const newRate = parseFloat(e.target.value) || 0;
                          setEquipmentLibrary(prev => prev.map(eq =>
                            eq.id === equipment.id ? { ...eq, dailyRate: newRate } : eq
                          ));
                        }}
                        style={{
                          width: '80px',
                          padding: '6px',
                          backgroundColor: '#0d1117',
                          border: '1px solid #30363d',
                          borderRadius: '4px',
                          color: '#58a6ff',
                          textAlign: 'center',
                          fontSize: '14px',
                          fontWeight: '600'
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <input
                        type="number"
                        step="50"
                        value={equipment.weeklyRate}
                        onChange={(e) => {
                          const newRate = parseFloat(e.target.value) || 0;
                          setEquipmentLibrary(prev => prev.map(eq =>
                            eq.id === equipment.id ? { ...eq, weeklyRate: newRate } : eq
                          ));
                        }}
                        style={{
                          width: '90px',
                          padding: '6px',
                          backgroundColor: '#0d1117',
                          border: '1px solid #30363d',
                          borderRadius: '4px',
                          color: '#58a6ff',
                          textAlign: 'center',
                          fontSize: '14px',
                          fontWeight: '600'
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <input
                        type="number"
                        step="100"
                        value={equipment.monthlyRate}
                        onChange={(e) => {
                          const newRate = parseFloat(e.target.value) || 0;
                          setEquipmentLibrary(prev => prev.map(eq =>
                            eq.id === equipment.id ? { ...eq, monthlyRate: newRate } : eq
                          ));
                        }}
                        style={{
                          width: '90px',
                          padding: '6px',
                          backgroundColor: '#0d1117',
                          border: '1px solid #30363d',
                          borderRadius: '4px',
                          color: '#58a6ff',
                          textAlign: 'center',
                          fontSize: '14px',
                          fontWeight: '600'
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <input
                        type="number"
                        step="50"
                        value={equipment.mobilizationCost}
                        onChange={(e) => {
                          const newCost = parseFloat(e.target.value) || 0;
                          setEquipmentLibrary(prev => prev.map(eq =>
                            eq.id === equipment.id ? { ...eq, mobilizationCost: newCost } : eq
                          ));
                        }}
                        style={{
                          width: '80px',
                          padding: '6px',
                          backgroundColor: '#0d1117',
                          border: '1px solid #30363d',
                          borderRadius: '4px',
                          color: '#c9d1d9',
                          textAlign: 'center',
                          fontSize: '14px'
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'financial' && (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ color: '#c9d1d9', fontSize: '18px', marginBottom: '8px' }}>
                Global Multipliers
              </h2>
              <p style={{ color: '#8b949e', fontSize: '14px' }}>
                Define default values that apply to every new bid. Estimators can override these per project.
              </p>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px'
            }}>
              {[
                { key: 'markupPct', label: 'Default Markup', suffix: '%', description: 'Applied to material costs' },
                { key: 'taxRate', label: 'Sales Tax Rate', suffix: '%', description: 'Based on project location' },
                { key: 'laborRate', label: 'Hourly Labor Rate', suffix: '$/hr', description: 'Burdened rate per man-hour' },
                { key: 'contingencyPct', label: 'Labor Contingency', suffix: '%', description: '% buffer added to raw labor hours for rework/punch-list' },
                { key: 'caulkBeads', label: 'Caulk Beads', suffix: 'beads', description: 'Standard perimeter caulk' }
              ].map(field => (
                <div
                  key={field.key}
                  style={{
                    backgroundColor: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: '8px',
                    padding: '20px'
                  }}
                >
                  <label style={{ color: '#c9d1d9', fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                    {field.label}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="number"
                      step="0.01"
                      value={adminSettings.financialDefaults[field.key]}
                      onChange={(e) => updateFinancial(field.key, e.target.value)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        backgroundColor: '#0d1117',
                        border: '1px solid #30363d',
                        borderRadius: '6px',
                        color: '#58a6ff',
                        fontSize: '16px',
                        fontWeight: '600'
                      }}
                    />
                    <span style={{ color: '#8b949e', fontSize: '14px', minWidth: '60px' }}>
                      {field.suffix}
                    </span>
                  </div>
                  <p style={{ color: '#8b949e', fontSize: '12px' }}>
                    {field.description}
                  </p>
                </div>
              ))}
            </div>

            {/* Base Pricing Section */}
            <div style={{ marginTop: '40px' }}>
              <h2 style={{ color: '#c9d1d9', fontSize: '18px', marginBottom: '8px' }}>
                Base Material Pricing
              </h2>
              <p style={{ color: '#8b949e', fontSize: '14px', marginBottom: '20px' }}>
                Unit costs used by the Pricing Logic Engine. These are combined with system DNA to calculate accurate material costs.
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '16px'
              }}>
                {[
                  { key: 'metalPerLb', label: 'Aluminum', suffix: '$/lb', description: 'Per pound of framing metal', icon: '🔩' },
                  { key: 'glassPerSF', label: 'Glass (Basic)', suffix: '$/SF', description: 'Per square foot of glass', icon: '🪟' },
                  { key: 'caulkPerLF', label: 'Caulk/Sealant', suffix: '$/LF', description: 'Per linear foot of caulk', icon: '🧪' },
                  { key: 'anchorPerEA', label: 'Anchors', suffix: '$/EA', description: 'Per anchor installed', icon: '⚓' },
                  { key: 'steelPerLb', label: 'Steel Reinforcement', suffix: '$/lb', description: 'Per pound of steel', icon: '🔨' }
                ].map(field => (
                  <div
                    key={field.key}
                    style={{
                      backgroundColor: '#161b22',
                      border: '1px solid #30363d',
                      borderRadius: '8px',
                      padding: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '20px' }}>{field.icon}</span>
                      <label style={{ color: '#c9d1d9', fontSize: '13px', fontWeight: '600' }}>
                        {field.label}
                      </label>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '6px' }}>
                      <span style={{ color: '#8b949e', fontSize: '16px', fontWeight: '700' }}>$</span>
                      <input
                        type="number"
                        step="0.25"
                        value={adminSettings.financialDefaults[field.key]}
                        onChange={(e) => updateFinancial(field.key, e.target.value)}
                        style={{
                          flex: 1,
                          padding: '8px',
                          backgroundColor: '#0d1117',
                          border: '1px solid #30363d',
                          borderRadius: '6px',
                          color: '#58a6ff',
                          fontSize: '15px',
                          fontWeight: '600',
                          textAlign: 'right'
                        }}
                      />
                      <span style={{ color: '#8b949e', fontSize: '12px', minWidth: '45px' }}>
                        {field.suffix}
                      </span>
                    </div>
                    <p style={{ color: '#6e7681', fontSize: '11px' }}>
                      {field.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── GPM Margin Tiers ── */}
            <div style={{ marginTop: '40px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ color: '#c9d1d9', fontSize: '18px', marginBottom: '8px' }}>
                    GPM Margin Tiers
                  </h2>
                  <p style={{ color: '#8b949e', fontSize: '14px' }}>
                    Auto-tiered Gross Profit Margin applied by the Bid Cart engine based on total hard cost.
                    The first tier whose ceiling exceeds the cost wins. Leave the ceiling blank for "no ceiling" (last tier).
                  </p>
                </div>
                <button
                  onClick={() => {
                    const newTier = { id: `tier_${Date.now()}`, label: 'New Tier', upTo: null, gpm: 25 };
                    setAdminSettings(prev => ({
                      ...prev,
                      financialDefaults: {
                        ...prev.financialDefaults,
                        gpmTiers: [...(prev.financialDefaults.gpmTiers || []), newTier],
                      },
                    }));
                  }}
                  style={{ padding: '8px 16px', backgroundColor: '#238636', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', flexShrink: 0, marginLeft: '20px' }}
                >
                  + Add Tier
                </button>
              </div>

              <table style={{ width: '100%', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '6px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #30363d' }}>
                    <th style={{ padding: '12px', textAlign: 'left', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tier Label</th>
                    <th style={{ padding: '12px', textAlign: 'right', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hard Cost Ceiling ($)</th>
                    <th style={{ padding: '12px', textAlign: 'center', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Base GPM (%)</th>
                    <th style={{ padding: '12px', width: '60px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(adminSettings.financialDefaults?.gpmTiers || []).map((tier) => (
                    <tr key={tier.id} style={{ borderBottom: '1px solid #21262d' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <input
                          type="text"
                          value={tier.label}
                          onChange={e => setAdminSettings(prev => ({
                            ...prev,
                            financialDefaults: {
                              ...prev.financialDefaults,
                              gpmTiers: prev.financialDefaults.gpmTiers.map(t =>
                                t.id === tier.id ? { ...t, label: e.target.value } : t
                              ),
                            },
                          }))}
                          style={{ width: '150px', padding: '6px 8px', backgroundColor: '#0d1117', border: '1px solid #30363d', borderRadius: '4px', color: '#c9d1d9', fontSize: '13px' }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <input
                          type="number"
                          min={0}
                          step={10000}
                          value={tier.upTo === null ? '' : tier.upTo}
                          placeholder="No ceiling"
                          onChange={e => {
                            const val = e.target.value === '' ? null : Number(e.target.value);
                            setAdminSettings(prev => ({
                              ...prev,
                              financialDefaults: {
                                ...prev.financialDefaults,
                                gpmTiers: prev.financialDefaults.gpmTiers.map(t =>
                                  t.id === tier.id ? { ...t, upTo: val } : t
                                ),
                              },
                            }));
                          }}
                          style={{ width: '160px', padding: '6px 8px', backgroundColor: '#0d1117', border: '1px solid #30363d', borderRadius: '4px', color: '#58a6ff', fontSize: '14px', fontWeight: 600, textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <input
                          type="number"
                          min={0}
                          max={99}
                          step={0.5}
                          value={tier.gpm}
                          onChange={e => setAdminSettings(prev => ({
                            ...prev,
                            financialDefaults: {
                              ...prev.financialDefaults,
                              gpmTiers: prev.financialDefaults.gpmTiers.map(t =>
                                t.id === tier.id ? { ...t, gpm: parseFloat(e.target.value) || 0 } : t
                              ),
                            },
                          }))}
                          style={{ width: '80px', padding: '6px 8px', backgroundColor: '#0d1117', border: '1px solid #30363d', borderRadius: '4px', color: '#4ade80', fontSize: '14px', fontWeight: 600, textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() => setAdminSettings(prev => ({
                            ...prev,
                            financialDefaults: {
                              ...prev.financialDefaults,
                              gpmTiers: prev.financialDefaults.gpmTiers.filter(t => t.id !== tier.id),
                            },
                          }))}
                          style={{ background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
                          title="Remove tier"
                        >×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {activeTab === 'templates' && (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ color: '#c9d1d9', fontSize: '18px', marginBottom: '8px' }}>
                System Templates
              </h2>
              <p style={{ color: '#8b949e', fontSize: '14px' }}>
                Define which labor tasks are "Standard" for each system type. Toggle tasks on/off.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
              {Object.entries(adminSettings.systemTemplates).map(([templateName, template]) => (
                <div
                  key={templateName}
                  style={{
                    backgroundColor: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: '8px',
                    padding: '20px'
                  }}
                >
                  <h3 style={{ color: '#58a6ff', fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
                    {template.label}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {adminSettings.laborLibrary.map(task => (
                      <label
                        key={task.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px',
                          backgroundColor: template.tasks.includes(task.id) ? '#1c2f1c' : 'transparent',
                          border: '1px solid',
                          borderColor: template.tasks.includes(task.id) ? '#238636' : '#21262d',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={template.tasks.includes(task.id)}
                          onChange={() => toggleTaskInTemplate(templateName, task.id)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ color: '#c9d1d9', fontSize: '13px', flex: 1 }}>
                          {task.name}
                        </span>
                        <span style={{ color: '#8b949e', fontSize: '11px' }}>
                          {task.hoursPerUnit}h
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div>
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ color: '#c9d1d9', fontSize: '18px', marginBottom: '8px' }}>Material Categories</h2>
                <p style={{ color: '#8b949e', fontSize: '14px' }}>
                  Manage the category options that appear in the bid builder materials dropdown. Changes apply to all new material line items.
                </p>
              </div>
              <button
                onClick={() => { setShowAddCatForm(true); setNewCatLabel(''); setNewCatIcon('📦'); }}
                style={{
                  padding: '10px 18px',
                  backgroundColor: '#238636',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  flexShrink: 0,
                  marginTop: '4px',
                }}
              >
                + Add Category
              </button>
            </div>

            {/* Add Category Form */}
            {showAddCatForm && (
              <div style={{
                marginBottom: '16px',
                padding: '16px',
                backgroundColor: '#161b22',
                border: '1px solid #1f6feb',
                borderRadius: '6px',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
              }}>
                <input
                  type="text"
                  placeholder="Icon (emoji)"
                  value={newCatIcon}
                  onChange={e => setNewCatIcon(e.target.value)}
                  style={{
                    width: '64px',
                    padding: '8px 10px',
                    backgroundColor: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#c9d1d9',
                    fontSize: '18px',
                    textAlign: 'center',
                  }}
                />
                <input
                  type="text"
                  placeholder="Category label (e.g. Sealants)"
                  value={newCatLabel}
                  onChange={e => setNewCatLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') setShowAddCatForm(false); }}
                  autoFocus
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    backgroundColor: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#c9d1d9',
                    fontSize: '14px',
                  }}
                />
                <button
                  onClick={handleAddCategory}
                  style={{ padding: '8px 16px', backgroundColor: '#238636', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  Save
                </button>
                <button
                  onClick={() => setShowAddCatForm(false)}
                  style={{ padding: '8px 16px', backgroundColor: '#21262d', color: '#8b949e', border: '1px solid #30363d', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Categories List */}
            <table style={{ width: '100%', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '6px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #30363d' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase', width: '60px' }}>Icon</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Category Label</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase', width: '140px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {materialCategories.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: '#8b949e', fontSize: '14px', fontStyle: 'italic' }}>
                      No categories yet. Click "+ Add Category" to create one.
                    </td>
                  </tr>
                )}
                {materialCategories.map((cat, idx) => (
                  <tr key={cat.id} style={{ borderBottom: '1px solid #21262d', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    {editingCatId === cat.id ? (
                      <>
                        <td style={{ padding: '10px 16px' }}>
                          <input
                            type="text"
                            value={editCatIcon}
                            onChange={e => setEditCatIcon(e.target.value)}
                            style={{ width: '48px', padding: '6px', backgroundColor: '#0d1117', border: '1px solid #1f6feb', borderRadius: '4px', color: '#c9d1d9', fontSize: '18px', textAlign: 'center' }}
                          />
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <input
                            type="text"
                            value={editCatLabel}
                            onChange={e => setEditCatLabel(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveEditCategory(); if (e.key === 'Escape') setEditingCatId(null); }}
                            autoFocus
                            style={{ width: '100%', padding: '6px 10px', backgroundColor: '#0d1117', border: '1px solid #1f6feb', borderRadius: '4px', color: '#c9d1d9', fontSize: '14px' }}
                          />
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button onClick={handleSaveEditCategory} style={{ padding: '5px 12px', backgroundColor: '#238636', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Save</button>
                            <button onClick={() => setEditingCatId(null)} style={{ padding: '5px 10px', backgroundColor: '#21262d', color: '#8b949e', border: '1px solid #30363d', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '12px 16px', fontSize: '20px', textAlign: 'center' }}>{cat.icon}</td>
                        <td style={{ padding: '12px 16px', color: '#c9d1d9', fontSize: '14px' }}>{cat.label}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => startEditCategory(cat)}
                              style={{ padding: '5px 12px', backgroundColor: '#21262d', color: '#58a6ff', border: '1px solid #30363d', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                            >
                              ✏️ Rename
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(cat.id)}
                              title="Delete category"
                              style={{ padding: '5px 10px', backgroundColor: 'rgba(248,81,73,0.1)', color: '#f85149', border: '1px solid rgba(248,81,73,0.3)', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            <p style={{ marginTop: '12px', color: '#8b949e', fontSize: '12px' }}>
              {materialCategories.length} categor{materialCategories.length === 1 ? 'y' : 'ies'} · Changes take effect immediately in the bid builder.
            </p>
          </div>
        )}

        {activeTab === 'appsettings' && (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ color: '#c9d1d9', fontSize: '18px', marginBottom: '8px' }}>
                Application Settings
              </h2>
              <p style={{ color: '#8b949e', fontSize: '14px', marginBottom: '16px' }}>
                Configure where GlazeBid saves project files. You can use local folders, network drives, or cloud storage (like Egnyte).
              </p>
              <button
                onClick={() => setShowSettingsModal(true)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#1f6feb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                ⚙️ Configure Project Save Location
              </button>
            </div>

            {/* Info Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginTop: '24px' }}>
              <div style={{
                padding: '20px',
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '6px'
              }}>
                <h3 style={{ color: '#58a6ff', fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
                  💾 Local Storage
                </h3>
                <p style={{ color: '#8b949e', fontSize: '13px', lineHeight: '1.6' }}>
                  Save projects to your computer's hard drive. Best for standalone installations.
                </p>
                <div style={{ marginTop: '12px', fontFamily: 'monospace', fontSize: '12px', color: '#58a6ff' }}>
                  Example: C:/Estimating/Projects
                </div>
              </div>

              <div style={{
                padding: '20px',
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '6px'
              }}>
                <h3 style={{ color: '#a371f7', fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
                  🌐 Network Drive
                </h3>
                <p style={{ color: '#8b949e', fontSize: '13px', lineHeight: '1.6' }}>
                  Save to a shared network location. Perfect for team collaboration on a server.
                </p>
                <div style={{ marginTop: '12px', fontFamily: 'monospace', fontSize: '12px', color: '#a371f7' }}>
                  Example: //server/shared/Estimating
                </div>
              </div>

              <div style={{
                padding: '20px',
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '6px'
              }}>
                <h3 style={{ color: '#f0883e', fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
                  ☁️ Cloud Storage
                </h3>
                <p style={{ color: '#8b949e', fontSize: '13px', lineHeight: '1.6' }}>
                  Use Egnyte, OneDrive, Dropbox, or other cloud drives. Access from anywhere!
                </p>
                <div style={{ marginTop: '12px', fontFamily: 'monospace', fontSize: '12px', color: '#f0883e' }}>
                  Example: E:/Egnyte/Estimating/Projects
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <AdminSettings onClose={() => setShowSettingsModal(false)} />
      )}
    </div>
  );
};

export default AdminDashboard;
