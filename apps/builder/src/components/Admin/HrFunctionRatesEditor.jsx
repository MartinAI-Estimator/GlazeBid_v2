import React, { useState, useEffect } from 'react';
import './HrFunctionRatesEditor.css';

const HrFunctionRatesEditor = () => {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [rates, setRates] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [editedRates, setEditedRates] = useState({});

  // Load rates on mount
  useEffect(() => {
    loadRates();
  }, []);

  const loadRates = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/bidsheet/admin/hr-function-rates');
      const data = await response.json();
      
      if (data.success) {
        setRates(data.rates);
        setEditedRates(data.rates);
      } else {
        setError('Failed to load rates');
      }
    } catch (err) {
      setError(`Error loading rates: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    // Simple check - just enable editing (actual check happens on save)
    if (password.trim()) {
      setIsAuthenticated(true);
    }
  };

  const handleRateChange = (field, value) => {
    setEditedRates(prev => ({
      ...prev,
      [field]: parseFloat(value) || 0
    }));
  };

  const handleSave = async () => {
    if (!isAuthenticated || !password) {
      setError('Please enter password first');
      return;
    }

    setLoading(true);
    setError(null);
    setSaveStatus('');

    try {
      const response = await fetch(
        `/api/bidsheet/admin/hr-function-rates?password=${encodeURIComponent(password)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(editedRates),
        }
      );

      const data = await response.json();

      if (data.success) {
        setRates(data.rates);
        setEditedRates(data.rates);
        setSaveStatus('Rates saved successfully!');
        setTimeout(() => setSaveStatus(''), 3000);
      } else {
        setError(data.detail || 'Failed to save rates');
      }
    } catch (err) {
      setError(`Error saving rates: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setEditedRates(rates);
    setError(null);
    setSaveStatus('');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPassword('');
  };

  if (!isAuthenticated) {
    return (
      <div className="hr-rates-editor">
        <div className="hr-rates-auth">
          <div className="auth-card">
            <div className="auth-header">
              <span className="auth-icon">🔒</span>
              <h2>Admin Access Required</h2>
            </div>
            <form onSubmit={handlePasswordSubmit}>
              <div className="form-group">
                <label>Enter Admin Password:</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="password-input"
                  autoFocus
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={!password.trim()}>
                Unlock Editor
              </button>
            </form>
            {error && <div className="error-message">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  if (loading && !rates) {
    return (
      <div className="hr-rates-editor">
        <div className="loading">Loading Hr Function rates...</div>
      </div>
    );
  }

  return (
    <div className="hr-rates-editor">
      <div className="hr-rates-header">
        <div className="header-left">
          <h1>⚙️ Hr Function Rate Editor</h1>
          <p className="subtitle">Global default rates for all projects</p>
        </div>
        <div className="header-right">
          <button onClick={handleLogout} className="btn btn-secondary">
            🔒 Lock Editor
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {saveStatus && <div className="success-banner">{saveStatus}</div>}

      <div className="rates-grid">
        {/* Hr Function Rates */}
        <div className="rates-section">
          <h2>📋 Hr Function Task Rates (MHs per unit)</h2>
          <div className="rates-cards">
            <div className="rate-card">
              <label>Joints</label>
              <input
                type="number"
                step="0.01"
                value={editedRates.joints || 0}
                onChange={(e) => handleRateChange('joints', e.target.value)}
              />
              <span className="rate-unit">MHs per joint</span>
            </div>

            <div className="rate-card">
              <label>Distribution</label>
              <input
                type="number"
                step="0.01"
                value={editedRates.dist || 0}
                onChange={(e) => handleRateChange('dist', e.target.value)}
              />
              <span className="rate-unit">MHs per piece</span>
            </div>

            <div className="rate-card">
              <label>Subsills</label>
              <input
                type="number"
                step="0.01"
                value={editedRates.subsills || 0}
                onChange={(e) => handleRateChange('subsills', e.target.value)}
              />
              <span className="rate-unit">MHs per subsill</span>
            </div>

            <div className="rate-card">
              <label>Bays (≤3)</label>
              <input
                type="number"
                step="0.01"
                value={editedRates.bays || 0}
                onChange={(e) => handleRateChange('bays', e.target.value)}
              />
              <span className="rate-unit">MHs per bay</span>
            </div>

            <div className="rate-card">
              <label>Bays (&gt;3)</label>
              <input
                type="number"
                step="0.01"
                value={editedRates.bays_big || 0}
                onChange={(e) => handleRateChange('bays_big', e.target.value)}
              />
              <span className="rate-unit">MHs per bay</span>
            </div>

            <div className="rate-card">
              <label>DLOs (≤3)</label>
              <input
                type="number"
                step="0.01"
                value={editedRates.dlos || 0}
                onChange={(e) => handleRateChange('dlos', e.target.value)}
              />
              <span className="rate-unit">MHs per DLO</span>
            </div>

            <div className="rate-card">
              <label>DLOs (&gt;3)</label>
              <input
                type="number"
                step="0.01"
                value={editedRates.dlos_big || 0}
                onChange={(e) => handleRateChange('dlos_big', e.target.value)}
              />
              <span className="rate-unit">MHs per DLO</span>
            </div>

            <div className="rate-card">
              <label>Caulking</label>
              <input
                type="number"
                step="0.01"
                value={editedRates.caulk || 0}
                onChange={(e) => handleRateChange('caulk', e.target.value)}
              />
              <span className="rate-unit">MHs per LF</span>
            </div>

            <div className="rate-card">
              <label>SSG</label>
              <input
                type="number"
                step="0.01"
                value={editedRates.ssg || 0}
                onChange={(e) => handleRateChange('ssg', e.target.value)}
              />
              <span className="rate-unit">MHs per SF</span>
            </div>

            <div className="rate-card">
              <label>Steel</label>
              <input
                type="number"
                step="0.01"
                value={editedRates.steel || 0}
                onChange={(e) => handleRateChange('steel', e.target.value)}
              />
              <span className="rate-unit">MHs per piece</span>
            </div>

            <div className="rate-card">
              <label>Vents</label>
              <input
                type="number"
                step="0.01"
                value={editedRates.vents || 0}
                onChange={(e) => handleRateChange('vents', e.target.value)}
              />
              <span className="rate-unit">MHs per vent</span>
            </div>

            <div className="rate-card">
              <label>Brake Metal</label>
              <input
                type="number"
                step="0.01"
                value={editedRates.brake_metal || 0}
                onChange={(e) => handleRateChange('brake_metal', e.target.value)}
              />
              <span className="rate-unit">MHs per LF</span>
            </div>

            <div className="rate-card">
              <label>Door Pairs</label>
              <input
                type="number"
                step="0.01"
                value={editedRates.pairs || 0}
                onChange={(e) => handleRateChange('pairs', e.target.value)}
              />
              <span className="rate-unit">MHs per pair</span>
            </div>

            <div className="rate-card">
              <label>Single Doors</label>
              <input
                type="number"
                step="0.01"
                value={editedRates.singles || 0}
                onChange={(e) => handleRateChange('singles', e.target.value)}
              />
              <span className="rate-unit">MHs per door</span>
            </div>
          </div>
        </div>

        {/* Labor Rates */}
        <div className="rates-section">
          <h2>💰 Labor Hourly Rates</h2>
          <div className="rates-cards labor-rates">
            <div className="rate-card large">
              <label>Shop Labor Rate</label>
              <div className="input-with-prefix">
                <span className="prefix">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={editedRates.labor_rate_shop || 0}
                  onChange={(e) => handleRateChange('labor_rate_shop', e.target.value)}
                />
              </div>
              <span className="rate-unit">per MH</span>
            </div>

            <div className="rate-card large">
              <label>Distribution Labor Rate</label>
              <div className="input-with-prefix">
                <span className="prefix">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={editedRates.labor_rate_dist || 0}
                  onChange={(e) => handleRateChange('labor_rate_dist', e.target.value)}
                />
              </div>
              <span className="rate-unit">per MH</span>
            </div>

            <div className="rate-card large">
              <label>Field Labor Rate</label>
              <div className="input-with-prefix">
                <span className="prefix">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={editedRates.labor_rate_field || 0}
                  onChange={(e) => handleRateChange('labor_rate_field', e.target.value)}
                />
              </div>
              <span className="rate-unit">per MH</span>
            </div>
          </div>
        </div>
      </div>

      <div className="hr-rates-footer">
        <button onClick={handleReset} className="btn btn-secondary" disabled={loading}>
          Reset Changes
        </button>
        <button onClick={handleSave} className="btn btn-primary" disabled={loading}>
          {loading ? 'Saving...' : '💾 Save All Rates'}
        </button>
      </div>
    </div>
  );
};

export default HrFunctionRatesEditor;
