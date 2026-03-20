/**
 * Live Calculations Panel
 * Real-time statistics and metrics dashboard
 */
import React from 'react';
import './LiveCalculationsPanel.css';

export default function LiveCalculationsPanel({ totals, statistics }) {
  // Safety defaults - ensure all values are numbers
  const safeTotals = {
    shopCost: Number(totals?.shopCost) || 0,
    distCost: Number(totals?.distCost) || 0,
    fieldCost: Number(totals?.fieldCost) || 0,
    totalCost: Number(totals?.totalCost) || 0,
    totalQuantity: Number(totals?.totalQuantity) || 0,
    totalSF: Number(totals?.totalSF) || 0,
    totalFrames: Number(totals?.totalFrames) || 0,
    totalMHs: Number(totals?.totalMHs) || 0
  };
  
  const safeStats = {
    mhsPerDLO: Number(statistics?.mhsPerDLO) || 0,
    avgSFPerDLO: Number(statistics?.avgSFPerDLO) || 0,
    avgSFPerFrame: Number(statistics?.avgSFPerFrame) || 0
  };
  
  return (
    <div className="live-calculations-panel">
      {/* Statistics Card */}
      <div className="calc-card">
        <div className="calc-card-header">
          <h3 className="calc-card-title">📈 Statistics</h3>
        </div>
        <div className="calc-card-body">
          <div className="calc-stat">
            <span className="calc-stat-label">MHs per DLO</span>
            <span className="calc-stat-value">{(safeStats.mhsPerDLO || 0).toFixed(2)}</span>
          </div>
          <div className="calc-stat">
            <span className="calc-stat-label">Avg SF per DLO</span>
            <span className="calc-stat-value">{(safeStats.avgSFPerDLO || 0).toFixed(2)}</span>
          </div>
          <div className="calc-stat">
            <span className="calc-stat-label">Avg SF per Frame</span>
            <span className="calc-stat-value">{(safeStats.avgSFPerFrame || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>
      
      {/* Cost Breakdown Card */}
      <div className="calc-card">
        <div className="calc-card-header">
          <h3 className="calc-card-title">💰 Cost Breakdown</h3>
        </div>
        <div className="calc-card-body">
          <div className="cost-item">
            <div className="cost-item-header">
              <span className="cost-item-label">Shop Labor</span>
              <span className="cost-item-value">${(safeTotals.shopCost || 0).toLocaleString()}</span>
            </div>
            <div className="cost-progress-bar">
              <div 
                className="cost-progress-fill cost-progress-shop"
                style={{ width: `${((safeTotals.shopCost || 0) / (safeTotals.totalCost || 1) * 100).toFixed(0)}%` }}
              />
            </div>
          </div>
          
          <div className="cost-item">
            <div className="cost-item-header">
              <span className="cost-item-label">Distribution</span>
              <span className="cost-item-value">${(safeTotals.distCost || 0).toLocaleString()}</span>
            </div>
            <div className="cost-progress-bar">
              <div 
                className="cost-progress-fill cost-progress-dist"
                style={{ width: `${((safeTotals.distCost || 0) / (safeTotals.totalCost || 1) * 100).toFixed(0)}%` }}
              />
            </div>
          </div>
          
          <div className="cost-item">
            <div className="cost-item-header">
              <span className="cost-item-label">Field Labor</span>
              <span className="cost-item-value">${(safeTotals.fieldCost || 0).toLocaleString()}</span>
            </div>
            <div className="cost-progress-bar">
              <div 
                className="cost-progress-fill cost-progress-field"
                style={{ width: `${((safeTotals.fieldCost || 0) / (safeTotals.totalCost || 1) * 100).toFixed(0)}%` }}
              />
            </div>
          </div>
          
          <div className="cost-total">
            <span className="cost-total-label">Total Labor Cost</span>
            <span className="cost-total-value">${(safeTotals.totalCost || 0).toLocaleString()}</span>
          </div>
        </div>
      </div>
      
      {/* Quick Metrics Card */}
      <div className="calc-card">
        <div className="calc-card-header">
          <h3 className="calc-card-title">⚡ Quick Metrics</h3>
        </div>
        <div className="calc-card-body">
          <div className="quick-metric">
            <div className="quick-metric-icon">🏗️</div>
            <div className="quick-metric-content">
              <span className="quick-metric-value">{safeTotals.totalFrames || 0}</span>
              <span className="quick-metric-label">Total Frames</span>
            </div>
          </div>
          
          <div className="quick-metric">
            <div className="quick-metric-icon">📐</div>
            <div className="quick-metric-content">
              <span className="quick-metric-value">{(safeTotals.totalSF || 0).toFixed(0)}</span>
              <span className="quick-metric-label">Total SF</span>
            </div>
          </div>
          
          <div className="quick-metric">
            <div className="quick-metric-icon">⏱️</div>
            <div className="quick-metric-content">
              <span className="quick-metric-value">{(safeTotals.totalMHs || 0).toFixed(0)}</span>
              <span className="quick-metric-label">Total MHs</span>
            </div>
          </div>
          
          <div className="quick-metric">
            <div className="quick-metric-icon">💵</div>
            <div className="quick-metric-content">
              <span className="quick-metric-value">${((safeTotals.totalCost || 0) / (safeTotals.totalSF || 1)).toFixed(2)}</span>
              <span className="quick-metric-label">Cost per SF</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
