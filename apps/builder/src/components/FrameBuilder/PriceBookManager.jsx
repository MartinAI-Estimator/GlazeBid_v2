/**
 * PriceBookManager.jsx
 *
 * Estimator's running price book for aluminum extrusions, glass, hardware, and labor rates.
 * These prices feed into BOM cost calculations.
 * Includes placeholder AI extraction UI for pasting spec text.
 */

import React, { useState, useEffect } from 'react';
import { Download, Upload, RotateCcw, AlertCircle } from 'lucide-react';
import './PriceBookManager.css';

const DEFAULT_PRICEBOOK = {
  aluminum: {
    head: 9.50,
    sill: 8.75,
    jamb: 9.00,
    'mullion-v': 11.00,
    'mullion-h': 10.50,
    'glazing-bead': 4.25,
  },
  glass: {
    'clear-ig': 28.00,
    'lowe-ig': 34.50,
    'bronze-ig': 31.00,
    'spandrel': 22.00,
    'tempered': 38.00,
    'laminated': 42.00,
  },
  labor: {
    shopFabPerHr: 75.00,
    fieldInstallPerHr: 95.00,
    glassHandlingPerHr: 85.00,
    doorHardwarePerHr: 110.00,
  },
  hardware: {
    anchorEA: 2.75,
    shimPackEA: 1.50,
    caulkSausage: 18.00,
    'backer-rod': 0.45,
    mineralWoolLF: 3.20,
    intumescentStripLF: 8.50,
  },
  overhead: {
    materialMarkup: 1.15,
    laborBurden: 1.35,
    bondingInsurance: 0.025,
  },
};

const LABOR_DESCRIPTIONS = {
  shopFabPerHr: 'Shop Fabrication ($/hr)',
  fieldInstallPerHr: 'Field Installation ($/hr)',
  glassHandlingPerHr: 'Glass Handling ($/hr)',
  doorHardwarePerHr: 'Door Hardware ($/hr)',
};

const HARDWARE_DESCRIPTIONS = {
  anchorEA: 'Anchor (per each)',
  shimPackEA: 'Shim Pack (per each)',
  caulkSausage: 'Caulk Sausage (per sausage)',
  'backer-rod': 'Backer Rod (per LF)',
  mineralWoolLF: 'Mineral Wool (per LF)',
  intumescentStripLF: 'Intumescent Strip (per LF)',
};

export default function PriceBookManager() {
  const [activeTab, setActiveTab] = useState('aluminum');
  const [pricebook, setPricebook] = useState(DEFAULT_PRICEBOOK);
  const [changeLog, setChangeLog] = useState([]);
  const [specText, setSpecText] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Load pricebook from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('glazebid-pricebook');
      if (saved) {
        setPricebook(JSON.parse(saved));
      }
      const savedLog = localStorage.getItem('glazebid-pricebook-log');
      if (savedLog) {
        setChangeLog(JSON.parse(savedLog));
      }
    } catch (e) {
      console.warn('Failed to load pricebook:', e);
    }
  }, []);

  // Persist pricebook to localStorage
  const savePricebook = (newBook) => {
    setPricebook(newBook);
    localStorage.setItem('glazebid-pricebook', JSON.stringify(newBook));
  };

  // Log price changes
  const logChange = (field, oldValue, newValue) => {
    const entry = {
      field,
      oldValue: parseFloat(oldValue),
      newValue: parseFloat(newValue),
      changedAt: new Date().toISOString(),
    };
    const newLog = [entry, ...changeLog].slice(0, 5);
    setChangeLog(newLog);
    localStorage.setItem('glazebid-pricebook-log', JSON.stringify(newLog));
  };

  // Generic price change handler
  const handlePriceChange = (category, key, value) => {
    const oldValue = pricebook[category][key];
    const newValue = parseFloat(value) || 0;

    if (oldValue !== newValue) {
      logChange(`${category}.${key}`, oldValue, newValue);
      const newBook = {
        ...pricebook,
        [category]: {
          ...pricebook[category],
          [key]: newValue,
        },
      };
      savePricebook(newBook);
    }
  };

  // Export pricebook as JSON
  const handleExport = () => {
    const dataStr = JSON.stringify(pricebook, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GlazeBid-PriceBook-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import pricebook from JSON file
  const handleImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        // Validate structure
        if (imported.aluminum && imported.glass && imported.labor) {
          savePricebook(imported);
          alert('Price book imported successfully');
        } else {
          alert('Invalid price book format');
        }
      } catch (err) {
        alert('Failed to import price book: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Reset to defaults
  const handleReset = () => {
    savePricebook(DEFAULT_PRICEBOOK);
    setChangeLog([]);
    localStorage.removeItem('glazebid-pricebook-log');
    setShowResetConfirm(false);
  };

  // Computed all-in rates for labor
  const laborBurdenFactor = pricebook.overhead.laborBurden;
  const computedLabor = {
    shopFabAllIn: (pricebook.labor.shopFabPerHr * laborBurdenFactor).toFixed(2),
    fieldInstallAllIn: (pricebook.labor.fieldInstallPerHr * laborBurdenFactor).toFixed(2),
    glassHandlingAllIn: (pricebook.labor.glassHandlingPerHr * laborBurdenFactor).toFixed(2),
    doorHardwareAllIn: (pricebook.labor.doorHardwarePerHr * laborBurdenFactor).toFixed(2),
  };

  return (
    <div className="pricebook-manager">
      {/* Header */}
      <div className="pricebook-header">
        <h2>Price Book Manager</h2>
        <div className="header-actions">
          <button
            className="btn btn-icon"
            onClick={handleExport}
            title="Export price book as JSON"
          >
            <Download size={18} />
            Export
          </button>
          <label className="btn btn-icon">
            <Upload size={18} />
            Import
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </label>
          <button
            className="btn btn-icon btn-danger"
            onClick={() => setShowResetConfirm(true)}
            title="Reset all prices to defaults"
          >
            <RotateCcw size={18} />
            Reset
          </button>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="modal-overlay" onClick={() => setShowResetConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Reset Price Book?</h3>
            <p>This will restore all prices to default values. This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleReset}>
                Reset All Prices
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="pricebook-tabs">
        {[
          { id: 'aluminum', label: 'Aluminum' },
          { id: 'glass', label: 'Glass' },
          { id: 'labor', label: 'Labor' },
          { id: 'hardware', label: 'Hardware' },
          { id: 'overhead', label: 'Overhead' },
          { id: 'ai-extraction', label: 'AI Extraction' },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`tab-pill ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="pricebook-content">
        {/* Aluminum Tab */}
        {activeTab === 'aluminum' && (
          <div className="tab-pane">
            <h3>Aluminum Extrusion Pricing (per LF)</h3>
            <table className="price-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Description</th>
                  <th>Price/LF</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(pricebook.aluminum).map(([role, price]) => (
                  <tr key={role}>
                    <td className="role-cell">{role}</td>
                    <td>
                      {role === 'head' && 'Head channel assembly'}
                      {role === 'sill' && 'Sill channel assembly'}
                      {role === 'jamb' && 'Vertical jamb post'}
                      {role === 'mullion-v' && 'Vertical mullion extrusion'}
                      {role === 'mullion-h' && 'Horizontal mullion extrusion'}
                      {role === 'glazing-bead' && 'Glazing bead/stop'}
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={price}
                        onChange={(e) => handlePriceChange('aluminum', role, e.target.value)}
                        className="price-input"
                      />
                    </td>
                    <td className="updated-cell">Today</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Glass Tab */}
        {activeTab === 'glass' && (
          <div className="tab-pane">
            <h3>Glass Pricing (per SF)</h3>
            <table className="price-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Price/SF</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(pricebook.glass).map(([type, price]) => (
                  <tr key={type}>
                    <td className="role-cell">{type}</td>
                    <td>
                      {type === 'clear-ig' && 'Clear Insulated Glass'}
                      {type === 'lowe-ig' && 'Low-E Insulated Glass'}
                      {type === 'bronze-ig' && 'Bronze Insulated Glass'}
                      {type === 'spandrel' && 'Spandrel Glass'}
                      {type === 'tempered' && 'Tempered Glass'}
                      {type === 'laminated' && 'Laminated Glass'}
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={price}
                        onChange={(e) => handlePriceChange('glass', type, e.target.value)}
                        className="price-input"
                      />
                    </td>
                    <td className="updated-cell">Today</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Labor Tab */}
        {activeTab === 'labor' && (
          <div className="tab-pane">
            <h3>Labor Rates ($/hr)</h3>
            <table className="price-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Base Rate</th>
                  <th>All-In Rate (x{laborBurdenFactor})</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(pricebook.labor).map(([key, price]) => {
                  const allInKey = key.replace('PerHr', 'AllIn');
                  const allInPrice = computedLabor[allInKey];
                  return (
                    <tr key={key}>
                      <td className="role-cell">{LABOR_DESCRIPTIONS[key]}</td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={price}
                          onChange={(e) => handlePriceChange('labor', key, e.target.value)}
                          className="price-input"
                        />
                      </td>
                      <td className="computed-cell">${allInPrice}</td>
                      <td className="updated-cell">Today</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="labor-example">
              <h4>Example Calculation</h4>
              <p>
                Base shop fab rate: ${pricebook.labor.shopFabPerHr.toFixed(2)}/hr
                <br />
                × Labor burden factor: {laborBurdenFactor}
                <br />
                = All-in cost: ${computedLabor.shopFabAllIn}/hr
              </p>
            </div>
          </div>
        )}

        {/* Hardware Tab */}
        {activeTab === 'hardware' && (
          <div className="tab-pane">
            <h3>Hardware & Accessories</h3>
            <table className="price-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Unit</th>
                  <th>Price</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(pricebook.hardware).map(([key, price]) => {
                  const unit =
                    key.includes('LF') || key === 'backer-rod' ? 'per LF' : 'per EA';
                  return (
                    <tr key={key}>
                      <td className="role-cell">
                        {HARDWARE_DESCRIPTIONS[key]}
                      </td>
                      <td>{unit}</td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={price}
                          onChange={(e) => handlePriceChange('hardware', key, e.target.value)}
                          className="price-input"
                        />
                      </td>
                      <td className="updated-cell">Today</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Overhead Tab */}
        {activeTab === 'overhead' && (
          <div className="tab-pane">
            <h3>Markup & Overhead Factors</h3>

            <div className="overhead-grid">
              <div className="overhead-item">
                <label>Material Markup</label>
                <div className="factor-input-group">
                  <input
                    type="number"
                    step="0.01"
                    value={pricebook.overhead.materialMarkup}
                    onChange={(e) =>
                      handlePriceChange('overhead', 'materialMarkup', e.target.value)
                    }
                    className="factor-input"
                  />
                  <span className="factor-label">× multiplier</span>
                </div>
                <p className="factor-example">
                  Material cost $10,000 × {pricebook.overhead.materialMarkup} = $
                  {(10000 * pricebook.overhead.materialMarkup).toFixed(2)} billed
                </p>
              </div>

              <div className="overhead-item">
                <label>Labor Burden Factor</label>
                <div className="factor-input-group">
                  <input
                    type="number"
                    step="0.01"
                    value={pricebook.overhead.laborBurden}
                    onChange={(e) =>
                      handlePriceChange('overhead', 'laborBurden', e.target.value)
                    }
                    className="factor-input"
                  />
                  <span className="factor-label">× multiplier</span>
                </div>
                <p className="factor-example">
                  Labor rate $75/hr × {pricebook.overhead.laborBurden} = $
                  {(75 * pricebook.overhead.laborBurden).toFixed(2)}/hr all-in
                </p>
              </div>

              <div className="overhead-item">
                <label>Bonding & Insurance %</label>
                <div className="factor-input-group">
                  <input
                    type="number"
                    step="0.001"
                    value={pricebook.overhead.bondingInsurance}
                    onChange={(e) =>
                      handlePriceChange('overhead', 'bondingInsurance', e.target.value)
                    }
                    className="factor-input"
                  />
                  <span className="factor-label">% of project cost</span>
                </div>
                <p className="factor-example">
                  Project subtotal $50,000 × {(pricebook.overhead.bondingInsurance * 100).toFixed(2)}% = $
                  {(50000 * pricebook.overhead.bondingInsurance).toFixed(2)} allocation
                </p>
              </div>
            </div>
          </div>
        )}

        {/* AI Extraction Tab */}
        {activeTab === 'ai-extraction' && (
          <div className="tab-pane ai-pane">
            <h3>AI Price Extraction</h3>
            <p className="ai-description">
              Paste vendor quote text below. When connected, GlazeBid will automatically
              read vendor quotes and populate your price book. Supports email text, PDF
              text, and CSV price lists.
            </p>

            <textarea
              className="spec-textarea"
              placeholder="Paste email or PDF text from vendor quote here..."
              value={specText}
              onChange={(e) => setSpecText(e.target.value)}
            />

            <div className="ai-button-group">
              <button className="btn btn-disabled" disabled title="Connect Claude API in Settings to enable">
                Extract Prices (AI)
              </button>
            </div>

            <div className="ai-info-card">
              <AlertCircle size={20} />
              <div>
                <h4>Feature Status: Not Connected</h4>
                <p>
                  AI price extraction requires a Claude API connection. When enabled, GlazeBid
                  will read vendor quotes and automatically populate the price book with accurate
                  material and labor costs.
                </p>
                <p>
                  <strong>Coming soon:</strong> Connect your Anthropic Claude API key in Settings
                  to enable this feature.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Change Log Footer */}
      {changeLog.length > 0 && (
        <div className="pricebook-footer">
          <h4>Recent Changes</h4>
          <div className="changelog">
            {changeLog.map((entry, idx) => (
              <div key={idx} className="changelog-entry">
                <span className="changelog-field">{entry.field}</span>
                <span className="changelog-old">${entry.oldValue.toFixed(2)}</span>
                <span className="changelog-arrow">→</span>
                <span className="changelog-new">${entry.newValue.toFixed(2)}</span>
                <span className="changelog-time">
                  {new Date(entry.changedAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
