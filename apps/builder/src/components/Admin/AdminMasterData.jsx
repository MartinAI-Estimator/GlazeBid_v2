import React, { useState } from 'react';
import { useProject } from '../../context/ProjectContext';

/**
 * AdminMasterData - Layer 26: The Master Data Center
 * 
 * This is where you define the "SOW Dropdowns" from Excel:
 * 1. Cost Groups (02-Metal, 02-Glass) - Internal cost tracking
 * 2. Breakout Categories (Ext Storefront, Curtain Wall) - External proposals
 * 
 * Why: So your proposal reads "Exterior Storefront: $150k" instead of 50 line items.
 */
const AdminMasterData = () => {
  const { adminSettings = {}, setAdminSettings } = useProject();
  
  const [activePanel, setActivePanel] = useState('costGroups'); // 'costGroups' or 'breakouts'
  const [newGroupName, setNewGroupName] = useState('');
  const [newBreakoutName, setNewBreakoutName] = useState('');

  // Get current data or defaults
  const costGroups = adminSettings.costGroups || [
    "02-Metal",
    "02-Glass",
    "02-Finish",
    "02-Labor",
    "02-Sundries",
    "02-Equipment"
  ];

  const breakoutCategories = adminSettings.breakoutCategories || [
    "Exterior Storefront",
    "Curtain Wall",
    "Interior Storefront",
    "All Glass Entrances",
    "Mirrors"
  ];

  // Core groups that cannot be deleted (prevent breaking math)
  const protectedGroups = ["02-Metal", "02-Glass", "02-Labor"];

  // Add cost group
  const addCostGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    
    if (costGroups.includes(trimmed)) {
      alert('This cost group already exists.');
      return;
    }

    setAdminSettings({
      ...adminSettings,
      costGroups: [...costGroups, trimmed]
    });
    setNewGroupName('');
  };

  // Delete cost group
  const deleteCostGroup = (groupName) => {
    if (protectedGroups.includes(groupName)) {
      alert(`Cannot delete "${groupName}" - it's a core group required for calculations.`);
      return;
    }

    if (window.confirm(`Delete cost group "${groupName}"? This cannot be undone.`)) {
      setAdminSettings({
        ...adminSettings,
        costGroups: costGroups.filter(g => g !== groupName)
      });
    }
  };

  // Add breakout category
  const addBreakoutCategory = () => {
    const trimmed = newBreakoutName.trim();
    if (!trimmed) return;
    
    if (breakoutCategories.includes(trimmed)) {
      alert('This breakout category already exists.');
      return;
    }

    setAdminSettings({
      ...adminSettings,
      breakoutCategories: [...breakoutCategories, trimmed]
    });
    setNewBreakoutName('');
  };

  // Delete breakout category
  const deleteBreakoutCategory = (categoryName) => {
    if (window.confirm(`Delete breakout category "${categoryName}"? This cannot be undone.`)) {
      setAdminSettings({
        ...adminSettings,
        breakoutCategories: breakoutCategories.filter(c => c !== categoryName)
      });
    }
  };

  // Safety check
  if (!setAdminSettings) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#f85149',
        fontSize: '14px'
      }}>
        ⚠️ Error: Admin context not available. Please reload the application.
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0d1117',
      padding: '24px'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{
          margin: 0,
          fontSize: '28px',
          fontWeight: '700',
          color: '#c9d1d9',
          marginBottom: '8px'
        }}>
          📊 Master Data Center
        </h1>
        <p style={{
          margin: 0,
          fontSize: '14px',
          color: '#8b949e',
          lineHeight: '1.5'
        }}>
          Define the dropdowns that drive your entire estimating engine. 
          <strong style={{ color: '#c9d1d9' }}> Cost Groups</strong> track internal costs, 
          <strong style={{ color: '#c9d1d9' }}> Breakout Categories</strong> structure your proposals.
        </p>
      </div>

      {/* Panel Toggle */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        borderBottom: '1px solid #21262d'
      }}>
        <button
          onClick={() => setActivePanel('costGroups')}
          style={{
            padding: '12px 24px',
            backgroundColor: activePanel === 'costGroups' ? '#161b22' : 'transparent',
            border: 'none',
            borderBottom: activePanel === 'costGroups' ? '2px solid #58a6ff' : '2px solid transparent',
            color: activePanel === 'costGroups' ? '#58a6ff' : '#8b949e',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          💰 Cost Groups
        </button>
        <button
          onClick={() => setActivePanel('breakouts')}
          style={{
            padding: '12px 24px',
            backgroundColor: activePanel === 'breakouts' ? '#161b22' : 'transparent',
            border: 'none',
            borderBottom: activePanel === 'breakouts' ? '2px solid #58a6ff' : '2px solid transparent',
            color: activePanel === 'breakouts' ? '#58a6ff' : '#8b949e',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          📋 Proposal Breakouts
        </button>
      </div>

      {/* Cost Groups Panel */}
      {activePanel === 'costGroups' && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{
            padding: '16px',
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '6px'
          }}>
            <h3 style={{
              margin: 0,
              marginBottom: '8px',
              fontSize: '16px',
              fontWeight: '600',
              color: '#c9d1d9'
            }}>
              💰 Cost Groups
            </h3>
            <p style={{
              margin: 0,
              fontSize: '13px',
              color: '#8b949e',
              marginBottom: '16px'
            }}>
              These control internal cost tracking. Example: "How much are we spending on Aluminum across the whole job?"
            </p>

            {/* Add New Cost Group */}
            <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '16px'
            }}>
              <input
                type="text"
                placeholder="e.g., 02-Hardware"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCostGroup()}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: '#c9d1d9',
                  fontSize: '14px'
                }}
              />
              <button
                onClick={addCostGroup}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#238636',
                  border: '1px solid #2ea043',
                  borderRadius: '4px',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                + Add
              </button>
            </div>

            {/* Cost Groups List */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              {costGroups.map(group => (
                <div
                  key={group}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    backgroundColor: '#0d1117',
                    border: '1px solid #21262d',
                    borderRadius: '4px'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#c9d1d9'
                    }}>
                      {group}
                    </span>
                    {protectedGroups.includes(group) && (
                      <span style={{
                        padding: '2px 8px',
                        backgroundColor: '#1f6feb',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        color: 'white'
                      }}>
                        CORE
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => deleteCostGroup(group)}
                    disabled={protectedGroups.includes(group)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: protectedGroups.includes(group) ? '#21262d' : 'transparent',
                      border: '1px solid #f85149',
                      borderRadius: '4px',
                      color: protectedGroups.includes(group) ? '#6e7681' : '#f85149',
                      fontSize: '12px',
                      cursor: protectedGroups.includes(group) ? 'not-allowed' : 'pointer',
                      opacity: protectedGroups.includes(group) ? 0.5 : 1
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Help Text */}
          <div style={{
            padding: '12px',
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#8b949e'
          }}>
            <strong style={{ color: '#c9d1d9' }}>💡 Tip:</strong> Core groups (Metal, Glass, Labor) 
            cannot be deleted as they're required for calculations. Custom groups can be added for 
            specialized tracking (e.g., "02-Hardware", "02-Sealants").
          </div>
        </div>
      )}

      {/* Breakout Categories Panel */}
      {activePanel === 'breakouts' && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{
            padding: '16px',
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '6px'
          }}>
            <h3 style={{
              margin: 0,
              marginBottom: '8px',
              fontSize: '16px',
              fontWeight: '600',
              color: '#c9d1d9'
            }}>
              📋 Proposal Breakouts
            </h3>
            <p style={{
              margin: 0,
              fontSize: '13px',
              color: '#8b949e',
              marginBottom: '16px'
            }}>
              These structure your proposals. Example: Your proposal reads "Exterior Storefront: $150k" 
              instead of listing 50 individual frames.
            </p>

            {/* Add New Breakout */}
            <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '16px'
            }}>
              <input
                type="text"
                placeholder="e.g., Skylight Systems"
                value={newBreakoutName}
                onChange={(e) => setNewBreakoutName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addBreakoutCategory()}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: '#c9d1d9',
                  fontSize: '14px'
                }}
              />
              <button
                onClick={addBreakoutCategory}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#238636',
                  border: '1px solid #2ea043',
                  borderRadius: '4px',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                + Add
              </button>
            </div>

            {/* Breakouts List */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              {breakoutCategories.map(category => (
                <div
                  key={category}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    backgroundColor: '#0d1117',
                    border: '1px solid #21262d',
                    borderRadius: '4px'
                  }}
                >
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#c9d1d9'
                  }}>
                    {category}
                  </span>
                  <button
                    onClick={() => deleteBreakoutCategory(category)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'transparent',
                      border: '1px solid #f85149',
                      borderRadius: '4px',
                      color: '#f85149',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Help Text */}
          <div style={{
            padding: '12px',
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#8b949e'
          }}>
            <strong style={{ color: '#c9d1d9' }}>💡 Tip:</strong> Breakout categories group your 
            systems for proposals and invoicing. Common examples: "Exterior Storefront", "Curtain Wall", 
            "Interior Glazing". These appear in Tab 2 when creating systems.
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMasterData;
