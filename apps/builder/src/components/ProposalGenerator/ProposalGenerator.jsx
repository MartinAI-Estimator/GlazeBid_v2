/**
 * Proposal Generator Component
 * Creates professional proposal documents from bid data
 */
import React, { useState } from 'react';
import { FileSpreadsheet, Download, Eye, FileText, Settings } from 'lucide-react';
import './ProposalGenerator.css';

const ProposalGenerator = ({ project }) => {
  const [proposalData, setProposalData] = useState({
    projectName: project || '',
    clientName: '',
    projectAddress: '',
    proposalDate: new Date().toISOString().split('T')[0],
    validUntil: '',
    includeDrawings: true,
    includeSpecifications: true,
    includeBreakdown: true,
    paymentTerms: 'Net 30',
    warrantyPeriod: '1 Year'
  });

  const handleGenerateProposal = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/proposals/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: project,
          ...proposalData
        })
      });
      
      const data = await response.json();
      if (data.success && data.downloadUrl) {
        window.open(data.downloadUrl, '_blank');
      }
    } catch (err) {
      console.error('Failed to generate proposal:', err);
    }
  };

  return (
    <div className="proposal-generator-container">
      {/* Header */}
      <div className="proposal-header">
        <div className="proposal-title">
          <FileSpreadsheet size={28} color="#A855F7" />
          <div>
            <h1>Proposal Generator</h1>
            <p className="subtitle">Create professional proposal documents</p>
          </div>
        </div>
        <div className="proposal-actions">
          <button className="btn-secondary">
            <Eye size={18} />
            Preview
          </button>
          <button className="btn-primary" onClick={handleGenerateProposal}>
            <Download size={18} />
            Generate PDF
          </button>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="proposal-config-section">
        <h3>Proposal Information</h3>
        
        <div className="form-grid">
          <div className="form-group">
            <label>Project Name</label>
            <input
              type="text"
              value={proposalData.projectName}
              onChange={(e) => setProposalData({...proposalData, projectName: e.target.value})}
              className="form-input"
            />
          </div>
          
          <div className="form-group">
            <label>Client Name</label>
            <input
              type="text"
              value={proposalData.clientName}
              onChange={(e) => setProposalData({...proposalData, clientName: e.target.value})}
              className="form-input"
              placeholder="Enter client name"
            />
          </div>
          
          <div className="form-group">
            <label>Project Address</label>
            <input
              type="text"
              value={proposalData.projectAddress}
              onChange={(e) => setProposalData({...proposalData, projectAddress: e.target.value})}
              className="form-input"
              placeholder="Enter project address"
            />
          </div>
          
          <div className="form-group">
            <label>Proposal Date</label>
            <input
              type="date"
              value={proposalData.proposalDate}
              onChange={(e) => setProposalData({...proposalData, proposalDate: e.target.value})}
              className="form-input"
            />
          </div>
          
          <div className="form-group">
            <label>Valid Until</label>
            <input
              type="date"
              value={proposalData.validUntil}
              onChange={(e) => setProposalData({...proposalData, validUntil: e.target.value})}
              className="form-input"
            />
          </div>
          
          <div className="form-group">
            <label>Payment Terms</label>
            <select
              value={proposalData.paymentTerms}
              onChange={(e) => setProposalData({...proposalData, paymentTerms: e.target.value})}
              className="form-select"
            >
              <option value="Net 30">Net 30</option>
              <option value="Net 60">Net 60</option>
              <option value="Due on Receipt">Due on Receipt</option>
              <option value="50% Deposit">50% Deposit</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Warranty Period</label>
            <select
              value={proposalData.warrantyPeriod}
              onChange={(e) => setProposalData({...proposalData, warrantyPeriod: e.target.value})}
              className="form-select"
            >
              <option value="1 Year">1 Year</option>
              <option value="2 Years">2 Years</option>
              <option value="5 Years">5 Years</option>
              <option value="10 Years">10 Years</option>
            </select>
          </div>
        </div>
      </div>

      {/* Include Options */}
      <div className="proposal-options-section">
        <h3>Proposal Contents</h3>
        
        <div className="options-grid">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={proposalData.includeDrawings}
              onChange={(e) => setProposalData({...proposalData, includeDrawings: e.target.checked})}
            />
            <span>Include Drawing References</span>
          </label>
          
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={proposalData.includeSpecifications}
              onChange={(e) => setProposalData({...proposalData, includeSpecifications: e.target.checked})}
            />
            <span>Include Specifications</span>
          </label>
          
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={proposalData.includeBreakdown}
              onChange={(e) => setProposalData({...proposalData, includeBreakdown: e.target.checked})}
            />
            <span>Include Cost Breakdown</span>
          </label>
        </div>
      </div>

      {/* Preview Section */}
      <div className="proposal-preview-section">
        <h3>Proposal Preview</h3>
        <div className="preview-card">
          <div className="preview-header">
            <FileText size={48} color="#A855F7" />
            <h2>{proposalData.projectName || 'Project Name'}</h2>
            <p>Glazing Installation Proposal</p>
          </div>
          <div className="preview-body">
            <div className="preview-row">
              <span className="preview-label">Client:</span>
              <span className="preview-value">{proposalData.clientName || 'Not specified'}</span>
            </div>
            <div className="preview-row">
              <span className="preview-label">Location:</span>
              <span className="preview-value">{proposalData.projectAddress || 'Not specified'}</span>
            </div>
            <div className="preview-row">
              <span className="preview-label">Date:</span>
              <span className="preview-value">{proposalData.proposalDate}</span>
            </div>
            <div className="preview-row">
              <span className="preview-label">Payment Terms:</span>
              <span className="preview-value">{proposalData.paymentTerms}</span>
            </div>
            <div className="preview-row">
              <span className="preview-label">Warranty:</span>
              <span className="preview-value">{proposalData.warrantyPeriod}</span>
            </div>
          </div>
          <div className="preview-footer">
            <p className="preview-note">
              This is a preview. Click "Generate PDF" to create the full proposal document.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProposalGenerator;
