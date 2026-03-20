import React, { useState, useEffect } from 'react';
import { useProject } from '../../context/ProjectContext';
import { Users, Plus, Trash2, DollarSign, TrendingUp } from 'lucide-react';

/**
 * LaborCrewManager - The Crew Blend Calculator
 * Replaces flat labor rate with weighted average composite rate
 * Mimics Excel "Labor Calculator" tab logic
 */
const LaborCrewManager = ({ isModal = false, onClose = null }) => {
  const { laborCrew, setLaborCrew, adminSettings, setAdminSettings } = useProject();
  const [newRole, setNewRole] = useState({ role: '', count: 1, baseRate: 0, burdenPct: 40 });

  // Calculate the blended crew rate
  const calculateBlendedRate = (crew) => {
    if (!crew || crew.length === 0) return 0;
    
    let totalCost = 0;
    let totalCount = 0;

    crew.forEach(member => {
      const burdenedRate = member.baseRate * (1 + member.burdenPct / 100);
      totalCost += burdenedRate * member.count;
      totalCount += member.count;
    });

    return totalCount > 0 ? totalCost / totalCount : 0;
  };

  // Auto-sync blended rate to global settings
  useEffect(() => {
    const blendedRate = calculateBlendedRate(laborCrew);
    if (blendedRate > 0) {
      setAdminSettings(prev => ({
        ...prev,
        financialDefaults: {
          ...prev.financialDefaults,
          laborRate: Math.round(blendedRate * 100) / 100 // Round to 2 decimals
        }
      }));
    }
  }, [laborCrew, setAdminSettings]);

  // Add new crew member
  const handleAddMember = () => {
    if (!newRole.role.trim()) {
      alert('Please enter a role name');
      return;
    }
    if (newRole.baseRate <= 0) {
      alert('Base rate must be greater than 0');
      return;
    }

    setLaborCrew(prev => [
      ...prev,
      {
        id: Date.now(),
        role: newRole.role,
        count: parseInt(newRole.count) || 1,
        baseRate: parseFloat(newRole.baseRate) || 0,
        burdenPct: parseFloat(newRole.burdenPct) || 40
      }
    ]);

    // Reset form
    setNewRole({ role: '', count: 1, baseRate: 0, burdenPct: 40 });
  };

  // Update crew member
  const handleUpdateMember = (id, field, value) => {
    setLaborCrew(prev => prev.map(member =>
      member.id === id ? { ...member, [field]: parseFloat(value) || 0 } : member
    ));
  };

  // Remove crew member
  const handleRemoveMember = (id) => {
    setLaborCrew(prev => prev.filter(member => member.id !== id));
  };

  // Calculate burdened rate for display
  const getBurdenedRate = (baseRate, burdenPct) => {
    return baseRate * (1 + burdenPct / 100);
  };

  // Calculate total crew stats
  const totalCrewSize = laborCrew.reduce((sum, m) => sum + m.count, 0);
  const blendedRate = calculateBlendedRate(laborCrew);

  const containerStyle = isModal ? {
    backgroundColor: '#1c2128',
    borderRadius: '8px',
    border: '1px solid #30363d',
    maxWidth: '900px',
    maxHeight: '90vh',
    overflow: 'auto'
  } : {};

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{
        padding: '24px',
        borderBottom: '1px solid #30363d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <h2 style={{ color: '#c9d1d9', fontSize: '20px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={24} color="#58a6ff" />
            Labor Crew Builder
          </h2>
          <p style={{ color: '#8b949e', fontSize: '14px' }}>
            Build a crew composition to calculate your true blended labor rate
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
              fontSize: '14px'
            }}
          >
            Close
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div style={{
        padding: '24px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        backgroundColor: '#0d1117'
      }}>
        <div style={{
          padding: '16px',
          backgroundColor: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '6px'
        }}>
          <div style={{ color: '#8b949e', fontSize: '12px', marginBottom: '4px' }}>Total Crew Size</div>
          <div style={{ color: '#c9d1d9', fontSize: '24px', fontWeight: '700' }}>
            {totalCrewSize} {totalCrewSize === 1 ? 'person' : 'people'}
          </div>
        </div>

        <div style={{
          padding: '16px',
          backgroundColor: '#161b22',
          border: '2px solid #58a6ff',
          borderRadius: '6px'
        }}>
          <div style={{ color: '#8b949e', fontSize: '12px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <TrendingUp size={14} />
            Blended Labor Rate
          </div>
          <div style={{ color: '#58a6ff', fontSize: '28px', fontWeight: '700' }}>
            ${blendedRate.toFixed(2)}/hr
          </div>
          <div style={{ color: '#8b949e', fontSize: '11px', marginTop: '4px' }}>
            Including burden & benefits
          </div>
        </div>
      </div>

      {/* Crew Table */}
      <div style={{ padding: '24px' }}>
        <h3 style={{ color: '#c9d1d9', fontSize: '16px', marginBottom: '16px', fontWeight: '600' }}>
          Current Crew Composition
        </h3>

        {laborCrew.length === 0 ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            backgroundColor: '#161b22',
            border: '1px dashed #30363d',
            borderRadius: '6px'
          }}>
            <Users size={48} color="#30363d" style={{ marginBottom: '16px' }} />
            <p style={{ color: '#8b949e', fontSize: '14px' }}>
              No crew members defined. Add roles below to build your crew.
            </p>
          </div>
        ) : (
          <table style={{
            width: '100%',
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '6px',
            borderCollapse: 'collapse',
            overflow: 'hidden'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#0d1117', borderBottom: '1px solid #30363d' }}>
                <th style={{ padding: '12px', textAlign: 'left', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Role</th>
                <th style={{ padding: '12px', textAlign: 'center', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Count</th>
                <th style={{ padding: '12px', textAlign: 'center', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Base Rate</th>
                <th style={{ padding: '12px', textAlign: 'center', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Burden %</th>
                <th style={{ padding: '12px', textAlign: 'center', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Burdened Rate</th>
                <th style={{ padding: '12px', textAlign: 'center', color: '#8b949e', fontSize: '12px', textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {laborCrew.map(member => {
                const burdenedRate = getBurdenedRate(member.baseRate, member.burdenPct);
                return (
                  <tr key={member.id} style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={{ padding: '12px', color: '#c9d1d9', fontSize: '14px', fontWeight: '600' }}>
                      {member.role}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <input
                        type="number"
                        min="1"
                        value={member.count}
                        onChange={(e) => handleUpdateMember(member.id, 'count', e.target.value)}
                        style={{
                          width: '60px',
                          padding: '6px',
                          backgroundColor: '#0d1117',
                          border: '1px solid #30363d',
                          borderRadius: '4px',
                          color: '#c9d1d9',
                          textAlign: 'center',
                          fontSize: '13px'
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <input
                        type="number"
                        step="0.50"
                        value={member.baseRate}
                        onChange={(e) => handleUpdateMember(member.id, 'baseRate', e.target.value)}
                        style={{
                          width: '80px',
                          padding: '6px',
                          backgroundColor: '#0d1117',
                          border: '1px solid #30363d',
                          borderRadius: '4px',
                          color: '#58a6ff',
                          textAlign: 'center',
                          fontSize: '13px',
                          fontWeight: '600'
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <input
                        type="number"
                        step="1"
                        value={member.burdenPct}
                        onChange={(e) => handleUpdateMember(member.id, 'burdenPct', e.target.value)}
                        style={{
                          width: '70px',
                          padding: '6px',
                          backgroundColor: '#0d1117',
                          border: '1px solid #30363d',
                          borderRadius: '4px',
                          color: '#c9d1d9',
                          textAlign: 'center',
                          fontSize: '13px'
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#10b981', fontSize: '14px', fontWeight: '600' }}>
                      ${burdenedRate.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        style={{
                          padding: '6px',
                          backgroundColor: 'transparent',
                          border: '1px solid #f85149',
                          borderRadius: '4px',
                          color: '#f85149',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add New Member Form */}
      <div style={{
        padding: '24px',
        backgroundColor: '#0d1117',
        borderTop: '1px solid #30363d'
      }}>
        <h3 style={{ color: '#c9d1d9', fontSize: '16px', marginBottom: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={20} />
          Add Crew Member
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr auto',
          gap: '12px',
          alignItems: 'end'
        }}>
          <div>
            <label style={{ color: '#8b949e', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
              Role Name
            </label>
            <input
              type="text"
              placeholder="e.g., Foreman, Glazier, Apprentice"
              value={newRole.role}
              onChange={(e) => setNewRole(prev => ({ ...prev, role: e.target.value }))}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '4px',
                color: '#c9d1d9',
                fontSize: '13px'
              }}
            />
          </div>

          <div>
            <label style={{ color: '#8b949e', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
              Count
            </label>
            <input
              type="number"
              min="1"
              value={newRole.count}
              onChange={(e) => setNewRole(prev => ({ ...prev, count: e.target.value }))}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '4px',
                color: '#c9d1d9',
                fontSize: '13px'
              }}
            />
          </div>

          <div>
            <label style={{ color: '#8b949e', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
              Base Rate ($/hr)
            </label>
            <input
              type="number"
              step="0.50"
              value={newRole.baseRate}
              onChange={(e) => setNewRole(prev => ({ ...prev, baseRate: e.target.value }))}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '4px',
                color: '#c9d1d9',
                fontSize: '13px'
              }}
            />
          </div>

          <div>
            <label style={{ color: '#8b949e', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
              Burden %
            </label>
            <input
              type="number"
              step="1"
              value={newRole.burdenPct}
              onChange={(e) => setNewRole(prev => ({ ...prev, burdenPct: e.target.value }))}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '4px',
                color: '#c9d1d9',
                fontSize: '13px'
              }}
            />
          </div>

          <button
            onClick={handleAddMember}
            style={{
              padding: '8px 16px',
              backgroundColor: '#238636',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Plus size={16} />
            Add
          </button>
        </div>

        <div style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '6px'
        }}>
          <h4 style={{ color: '#8b949e', fontSize: '11px', textTransform: 'uppercase', marginBottom: '8px' }}>
            Understanding Burden
          </h4>
          <p style={{ color: '#8b949e', fontSize: '12px', lineHeight: '1.6' }}>
            <strong>Burden %</strong> includes payroll taxes, workers comp, health insurance, and benefits. 
            Typical ranges: <strong>35-45%</strong> for field workers, <strong>30-40%</strong> for foremen.
          </p>
        </div>
      </div>

      {/* Quick Presets */}
      <div style={{
        padding: '24px',
        backgroundColor: '#0d1117',
        borderTop: '1px solid #30363d'
      }}>
        <h3 style={{ color: '#c9d1d9', fontSize: '14px', marginBottom: '12px', fontWeight: '600' }}>
          Quick Presets
        </h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { label: 'Standard Crew', crew: [
              { role: 'Foreman', count: 1, baseRate: 65, burdenPct: 40 },
              { role: 'Glazier', count: 2, baseRate: 55, burdenPct: 42 },
              { role: 'Apprentice', count: 1, baseRate: 35, burdenPct: 38 }
            ]},
            { label: 'Premium Crew', crew: [
              { role: 'Lead Foreman', count: 1, baseRate: 75, burdenPct: 40 },
              { role: 'Senior Glazier', count: 3, baseRate: 65, burdenPct: 42 },
              { role: 'Glazier', count: 1, baseRate: 55, burdenPct: 42 }
            ]},
            { label: 'Training Crew', crew: [
              { role: 'Foreman', count: 1, baseRate: 65, burdenPct: 40 },
              { role: 'Glazier', count: 1, baseRate: 55, burdenPct: 42 },
              { role: 'Apprentice', count: 3, baseRate: 30, burdenPct: 35 }
            ]}
          ].map((preset, idx) => (
            <button
              key={idx}
              onClick={() => {
                const crewWithIds = preset.crew.map((member, i) => ({
                  ...member,
                  id: Date.now() + i
                }));
                setLaborCrew(crewWithIds);
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#c9d1d9',
                cursor: 'pointer',
                fontSize: '13px',
                transition: 'all 0.2s'
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LaborCrewManager;
