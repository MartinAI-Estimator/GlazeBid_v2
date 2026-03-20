/**
 * Bid Summary Component
 * Final bid totals with tax, labor rate, and markup percentages
 * Pulls data from SOW tab and integrates with Labor and Material components
 */
import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Calculator, FileText, Download, Settings } from 'lucide-react';
import './BidSummary.css';

const BidSummary = ({ project }) => {
  const [bidData, setBidData] = useState({
    laborCost: 0,
    materialCost: 0,
    contingencies: 0,
    shopDrawings: 0,
    miscLabor: 0,
    subtotal: 0,
    taxRate: 8.5,
    taxAmount: 0,
    markupPercent: 15,
    markupAmount: 0,
    totalBid: 0
  });
  
  const [laborRate, setLaborRate] = useState({
    shop: 42.00,
    dist: 38.00,
    field: 48.00
  });
  
  const [breakdown, setBreakdown] = useState({
    shopMHs: 0,
    distMHs: 0,
    fieldMHs: 0,
    totalMHs: 0,
    shopCost: 0,
    distCost: 0,
    fieldCost: 0
  });
  
  const [loading, setLoading] = useState(false);
  const [editingRates, setEditingRates] = useState(false);

  // Load bid data from backend
  useEffect(() => {
    if (project) {
      loadBidData();
    }
  }, [project]);

  const loadBidData = async () => {
    // Local mode: no backend. Data computed from BidSheetContext.
    setLoading(false);
  };

  const updateRates = async () => {
    setEditingRates(false);
  };

  const updateBidParameters = async (field, value) => {
    const updated = { ...bidData, [field]: parseFloat(value) };
    const subtotal = updated.laborCost + updated.materialCost + updated.contingencies + updated.shopDrawings + updated.miscLabor;
    updated.subtotal = subtotal;
    const taxAmount = subtotal * (updated.taxRate / 100);
    const markupAmount = (subtotal + taxAmount) * (updated.markupPercent / 100);
    const totalBid = subtotal + taxAmount + markupAmount;
    updated.taxAmount = taxAmount;
    updated.markupAmount = markupAmount;
    updated.totalBid = totalBid;
    setBidData(updated);
    try {
      localStorage.setItem(`glazebid:bidsummary:${project}`, JSON.stringify({
        taxRate: updated.taxRate, markupPercent: updated.markupPercent,
        contingencies: updated.contingencies, shopDrawings: updated.shopDrawings,
        miscLabor: updated.miscLabor,
      }));
    } catch { /* quota */ }

  return (
    <div className="bid-summary-container">
      {/* Header */}
      <div className="bid-summary-header">
        <div className="bid-summary-title">
          <DollarSign size={28} color="#22D3EE" />
          <div>
            <h1>Bid Summary</h1>
            <p className="subtitle">Final bid totals with tax and markup</p>
          </div>
        </div>
        <div className="bid-summary-actions">
          <button className="btn-secondary">
            <Settings size={18} />
            Configure
          </button>
          <button className="btn-primary">
            <Download size={18} />
            Export Summary
          </button>
        </div>
      </div>

      {/* Main Summary Card */}
      <div className="total-bid-card">
        <div className="total-bid-label">Total Bid Amount</div>
        <div className="total-bid-value">${bidData.totalBid.toFixed(2)}</div>
        <div className="total-bid-subtitle">
          {bidData.subtotal > 0 && (
            <>
              {((bidData.totalBid / bidData.subtotal - 1) * 100).toFixed(1)}% above cost
            </>
          )}
        </div>
      </div>

      {/* Cost Breakdown */}
      <div className="breakdown-section">
        <h3>Cost Breakdown</h3>
        <div className="breakdown-grid">
          <div className="breakdown-item">
            <div className="breakdown-label">Labor Cost</div>
            <div className="breakdown-value">${bidData.laborCost.toFixed(2)}</div>
          </div>
          <div className="breakdown-item">
            <div className="breakdown-label">Material Cost</div>
            <div className="breakdown-value">${bidData.materialCost.toFixed(2)}</div>
          </div>
          <div className="breakdown-item editable">
            <div className="breakdown-label">Contingencies</div>
            <div className="breakdown-input">
              $<input
                type="number"
                step="100"
                value={bidData.contingencies}
                onChange={(e) => updateBidParameters('contingencies', e.target.value)}
                className="amount-input"
              />
            </div>
          </div>
          <div className="breakdown-item editable">
            <div className="breakdown-label">Shop Drawings</div>
            <div className="breakdown-input">
              $<input
                type="number"
                step="100"
                value={bidData.shopDrawings}
                onChange={(e) => updateBidParameters('shopDrawings', e.target.value)}
                className="amount-input"
              />
            </div>
          </div>
          <div className="breakdown-item editable">
            <div className="breakdown-label">Misc Labor</div>
            <div className="breakdown-input">
              $<input
                type="number"
                step="50"
                value={bidData.miscLabor}
                onChange={(e) => updateBidParameters('miscLabor', e.target.value)}
                className="amount-input"
              />
            </div>
          </div>
          <div className="breakdown-item highlighted">
            <div className="breakdown-label">Subtotal</div>
            <div className="breakdown-value">${bidData.subtotal.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Tax and Markup Table */}
      <div className="parameters-section">
        <h3>Tax & Markup Parameters</h3>
        <table className="parameters-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Sales Tax</td>
              <td>
                <input
                  type="number"
                  step="0.1"
                  value={bidData.taxRate}
                  onChange={(e) => updateBidParameters('taxRate', e.target.value)}
                  className="rate-input"
                /> %
              </td>
              <td className="amount-cell">${bidData.taxAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Markup</td>
              <td>
                <input
                  type="number"
                  step="0.5"
                  value={bidData.markupPercent}
                  onChange={(e) => updateBidParameters('markupPercent', e.target.value)}
                  className="rate-input"
                /> %
              </td>
              <td className="amount-cell">${bidData.markupAmount.toFixed(2)}</td>
            </tr>
            <tr className="total-row">
              <td><strong>Total Bid</strong></td>
              <td></td>
              <td className="amount-cell total"><strong>${bidData.totalBid.toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Labor Rate Table */}
      <div className="labor-rates-section">
        <div className="section-header-with-action">
          <h3>Labor Rates</h3>
          {!editingRates ? (
            <button 
              className="btn-secondary small"
              onClick={() => setEditingRates(true)}
            >
              Edit Rates
            </button>
          ) : (
            <button 
              className="btn-primary small"
              onClick={updateRates}
            >
              Save Rates
            </button>
          )}
        </div>
        
        <table className="labor-rates-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Man Hours</th>
              <th>Rate ($/hr)</th>
              <th>Total Cost</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Shop Labor</td>
              <td className="text-right">{breakdown.shopMHs.toFixed(2)}</td>
              <td className="text-center">
                {editingRates ? (
                  <input
                    type="number"
                    step="0.50"
                    value={laborRate.shop}
                    onChange={(e) => setLaborRate({...laborRate, shop: parseFloat(e.target.value)})}
                    className="rate-input"
                  />
                ) : (
                  `$${laborRate.shop.toFixed(2)}`
                )}
              </td>
              <td className="text-right cost-cell">${breakdown.shopCost.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Distribution Labor</td>
              <td className="text-right">{breakdown.distMHs.toFixed(2)}</td>
              <td className="text-center">
                {editingRates ? (
                  <input
                    type="number"
                    step="0.50"
                    value={laborRate.dist}
                    onChange={(e) => setLaborRate({...laborRate, dist: parseFloat(e.target.value)})}
                    className="rate-input"
                  />
                ) : (
                  `$${laborRate.dist.toFixed(2)}`
                )}
              </td>
              <td className="text-right cost-cell">${breakdown.distCost.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Field Labor</td>
              <td className="text-right">{breakdown.fieldMHs.toFixed(2)}</td>
              <td className="text-center">
                {editingRates ? (
                  <input
                    type="number"
                    step="0.50"
                    value={laborRate.field}
                    onChange={(e) => setLaborRate({...laborRate, field: parseFloat(e.target.value)})}
                    className="rate-input"
                  />
                ) : (
                  `$${laborRate.field.toFixed(2)}`
                )}
              </td>
              <td className="text-right cost-cell">${breakdown.fieldCost.toFixed(2)}</td>
            </tr>
            <tr className="total-row">
              <td><strong>Total Labor</strong></td>
              <td className="text-right"><strong>{breakdown.totalMHs.toFixed(2)}</strong></td>
              <td></td>
              <td className="text-right cost-cell total"><strong>${bidData.laborCost.toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BidSummary;
