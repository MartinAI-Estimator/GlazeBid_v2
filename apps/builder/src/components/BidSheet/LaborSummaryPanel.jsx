/**
 * Labor Summary Panel
 * Displays labor breakdown table
 * Collapsible section with toggle in bottom-right corner
 */
import React, { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import './LaborSummaryPanel.css';

export default function LaborSummaryPanel({ totals, hrFunctionRates, statistics }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Safety checks - ensure all values are numbers
  const safeTotals = {
    shopMHs: Number(totals?.shopMHs) || 0,
    distMHs: Number(totals?.distMHs) || 0,
    fieldMHs: Number(totals?.fieldMHs) || 0,
    totalMHs: Number(totals?.totalMHs) || 0,
    shopCost: Number(totals?.shopCost) || 0,
    distCost: Number(totals?.distCost) || 0,
    fieldCost: Number(totals?.fieldCost) || 0,
    totalCost: Number(totals?.totalCost) || 0,
    totalSF: Number(totals?.totalSF) || 0
  };
  
  const laborRate = hrFunctionRates?.labor_rate_shop || 42.00;
  
  // Statistics safety defaults
  const safeStats = {
    mhsPerDLO: Number(statistics?.mhsPerDLO) || 0,
    avgSFPerDLO: Number(statistics?.avgSFPerDLO) || 0,
    avgSFPerFrame: Number(statistics?.avgSFPerFrame) || 0
  };
  
  return (
    <div className={`labor-summary-panel ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Panel Header */}
      <div className="labor-summary-header">
        <h3 className="panel-title">Labor Summary</h3>
        <button
          className="collapse-toggle"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Expand Labor Summary' : 'Collapse Labor Summary'}
        >
          {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
        </button>
      </div>

      {/* Tables Container */}
      <div className="labor-tables-container">
        {/* Labor Breakdown Table */}
        <div className="labor-summary-table-wrapper">
        <table className="labor-summary-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>MHs</th>
              <th>MHs/SF</th>
              <th>Cost</th>
              <th>$/SF</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span className="labor-icon">🏭</span> Shop</td>
              <td className="numeric">{(safeTotals.shopMHs || 0).toFixed(2)}</td>
              <td className="numeric">{((safeTotals.shopMHs || 0) / (safeTotals.totalSF || 1)).toFixed(4)}</td>
              <td className="numeric">${(safeTotals.shopCost || 0).toLocaleString()}</td>
              <td className="numeric">${((safeTotals.shopCost || 0) / (safeTotals.totalSF || 1)).toFixed(2)}</td>
            </tr>
            <tr>
              <td><span className="labor-icon">🚚</span> Distribution</td>
              <td className="numeric">{(safeTotals.distMHs || 0).toFixed(2)}</td>
              <td className="numeric">{((safeTotals.distMHs || 0) / (safeTotals.totalSF || 1)).toFixed(4)}</td>
              <td className="numeric">${(safeTotals.distCost || 0).toLocaleString()}</td>
              <td className="numeric">${((safeTotals.distCost || 0) / (safeTotals.totalSF || 1)).toFixed(2)}</td>
            </tr>
            <tr>
              <td><span className="labor-icon">👷</span> Field</td>
              <td className="numeric">{(safeTotals.fieldMHs || 0).toFixed(2)}</td>
              <td className="numeric">{((safeTotals.fieldMHs || 0) / (safeTotals.totalSF || 1)).toFixed(4)}</td>
              <td className="numeric">${(safeTotals.fieldCost || 0).toLocaleString()}</td>
              <td className="numeric">${((safeTotals.fieldCost || 0) / (safeTotals.totalSF || 1)).toFixed(2)}</td>
            </tr>
            <tr className="total-row">
              <td><span className="labor-icon">📊</span> <strong>Total</strong></td>
              <td className="numeric"><strong>{(safeTotals.totalMHs || 0).toFixed(2)}</strong></td>
              <td className="numeric"><strong>{((safeTotals.totalMHs || 0) / (safeTotals.totalSF || 1)).toFixed(4)}</strong></td>
              <td className="numeric"><strong>${(safeTotals.totalCost || 0).toLocaleString()}</strong></td>
              <td className="numeric"><strong>${((safeTotals.totalCost || 0) / (safeTotals.totalSF || 1)).toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Statistics Table */}
      <div className="statistics-table-wrapper">
        <table className="statistics-table">
          <tbody>
            <tr>
              <td className="stat-label">MHs / DLO</td>
              <td className="stat-value">{safeStats.mhsPerDLO.toFixed(2)}</td>
            </tr>
            <tr>
              <td className="stat-label">Avg. SqFt / DLO</td>
              <td className="stat-value">{safeStats.avgSFPerDLO.toFixed(1)}</td>
            </tr>
            <tr>
              <td className="stat-label">Avg. SqFt / Frame</td>
              <td className="stat-value">{safeStats.avgSFPerFrame.toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>

    </div>
  );
}
