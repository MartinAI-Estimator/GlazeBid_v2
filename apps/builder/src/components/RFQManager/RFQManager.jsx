import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  FileText, 
  Trash2, 
  Edit3, 
  Send, 
  Download, 
  ChevronRight,
  ClipboardList,
  Building2,
  Calendar,
  DollarSign,
  Package
} from 'lucide-react';
import './RFQManager.css';

/**
 * RFQ Manager - Request for Quote Management
 * Allows users to create RFQs for specialty items found in drawings
 * and attach relevant drawing pages for vendor quotes
 */
const RFQManager = ({ project, onOpenDrawing }) => {
  const [rfqs, setRfqs] = useState([]);
  const [selectedRfq, setSelectedRfq] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // New RFQ form state
  const [newRfq, setNewRfq] = useState({
    name: '',
    vendor: '',
    description: '',
    dueDate: '',
    priority: 'normal',
    category: 'specialty',
    notes: ''
  });

  // Load RFQs on mount
  useEffect(() => {
    if (project) {
      loadRfqs();
    }
  }, [project]);

  const loadRfqs = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/rfq/projects/${encodeURIComponent(project)}`
      );
      if (response.ok) {
        const data = await response.json();
        setRfqs(data.rfqs || []);
      }
    } catch (err) {
      console.error('Failed to load RFQs:', err);
      setError('Failed to load RFQs');
    } finally {
      setLoading(false);
    }
  };

  const createRfq = async () => {
    if (!newRfq.name.trim()) {
      alert('Please enter an RFQ name');
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/rfq/projects/${encodeURIComponent(project)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newRfq,
            createdAt: new Date().toISOString(),
            status: 'draft',
            attachments: []
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRfqs([...rfqs, data.rfq]);
        setNewRfq({
          name: '',
          vendor: '',
          description: '',
          dueDate: '',
          priority: 'normal',
          category: 'specialty',
          notes: ''
        });
        setIsCreating(false);
        setSelectedRfq(data.rfq);
      }
    } catch (err) {
      console.error('Failed to create RFQ:', err);
      alert('Failed to create RFQ');
    }
  };

  const deleteRfq = async (rfqId) => {
    if (!window.confirm('Are you sure you want to delete this RFQ?')) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/rfq/${rfqId}?project=${encodeURIComponent(project)}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        setRfqs(rfqs.filter(r => r.id !== rfqId));
        if (selectedRfq?.id === rfqId) {
          setSelectedRfq(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete RFQ:', err);
      alert('Failed to delete RFQ');
    }
  };

  const updateRfq = async (rfqId, updates) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/rfq/${rfqId}?project=${encodeURIComponent(project)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRfqs(rfqs.map(r => r.id === rfqId ? data.rfq : r));
        if (selectedRfq?.id === rfqId) {
          setSelectedRfq(data.rfq);
        }
      }
    } catch (err) {
      console.error('Failed to update RFQ:', err);
    }
  };

  const exportRfq = async (rfq) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/rfq/${rfq.id}/export?project=${encodeURIComponent(project)}`
      );
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `RFQ_${rfq.name.replace(/\s+/g, '_')}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }
    } catch (err) {
      console.error('Failed to export RFQ:', err);
      alert('Failed to export RFQ');
    }
  };

  const openAttachment = (attachment) => {
    if (onOpenDrawing && attachment.sheet && attachment.page) {
      onOpenDrawing(attachment.sheet, attachment.page);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return '#6b7280';
      case 'sent': return '#3b82f6';
      case 'received': return '#10b981';
      case 'expired': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'normal': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  return (
    <div className="rfq-manager-container">
      {/* Header */}
      <div className="rfq-header">
        <div className="rfq-header-left">
          <ClipboardList size={28} color="#007BFF" />
          <div>
            <h1>RFQ Manager</h1>
            <p className="subtitle">Request for Quotes - Specialty Items</p>
          </div>
        </div>
        <div className="rfq-header-actions">
          <button 
            className="btn-primary"
            onClick={() => setIsCreating(true)}
          >
            <Plus size={18} />
            Create RFQ
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="rfq-content">
        {/* RFQ List Panel */}
        <div className="rfq-list-panel">
          <div className="rfq-list-header">
            <h3>RFQ List</h3>
            <span className="rfq-count">{rfqs.length} items</span>
          </div>

          {loading ? (
            <div className="rfq-loading">Loading RFQs...</div>
          ) : rfqs.length === 0 ? (
            <div className="rfq-empty">
              <ClipboardList size={48} strokeWidth={1} />
              <p>No RFQs created yet</p>
              <span>Create your first RFQ to request vendor quotes</span>
            </div>
          ) : (
            <div className="rfq-list">
              {rfqs.map(rfq => (
                <div 
                  key={rfq.id}
                  className={`rfq-list-item ${selectedRfq?.id === rfq.id ? 'selected' : ''}`}
                  onClick={() => setSelectedRfq(rfq)}
                >
                  <div className="rfq-item-header">
                    <span className="rfq-item-name">{rfq.name}</span>
                    <span 
                      className="rfq-item-status"
                      style={{ backgroundColor: getStatusColor(rfq.status) }}
                    >
                      {rfq.status}
                    </span>
                  </div>
                  <div className="rfq-item-meta">
                    {rfq.vendor && (
                      <span className="rfq-item-vendor">
                        <Building2 size={12} />
                        {rfq.vendor}
                      </span>
                    )}
                    {rfq.dueDate && (
                      <span className="rfq-item-date">
                        <Calendar size={12} />
                        {new Date(rfq.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="rfq-item-attachments">
                    <FileText size={12} />
                    {rfq.attachments?.length || 0} drawings attached
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RFQ Detail Panel */}
        <div className="rfq-detail-panel">
          {isCreating ? (
            <div className="rfq-create-form">
              <h3>Create New RFQ</h3>
              
              <div className="form-group">
                <label>RFQ Name *</label>
                <input
                  type="text"
                  value={newRfq.name}
                  onChange={(e) => setNewRfq({ ...newRfq, name: e.target.value })}
                  placeholder="e.g., Custom Canopy System"
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Vendor</label>
                  <input
                    type="text"
                    value={newRfq.vendor}
                    onChange={(e) => setNewRfq({ ...newRfq, vendor: e.target.value })}
                    placeholder="Vendor name"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={newRfq.dueDate}
                    onChange={(e) => setNewRfq({ ...newRfq, dueDate: e.target.value })}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={newRfq.category}
                    onChange={(e) => setNewRfq({ ...newRfq, category: e.target.value })}
                    className="form-select"
                  >
                    <option value="specialty">Specialty Glazing</option>
                    <option value="hardware">Hardware</option>
                    <option value="metal">Metal Work</option>
                    <option value="canopy">Canopy Systems</option>
                    <option value="railing">Railings</option>
                    <option value="sunshade">Sunshades</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Priority</label>
                  <select
                    value={newRfq.priority}
                    onChange={(e) => setNewRfq({ ...newRfq, priority: e.target.value })}
                    className="form-select"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newRfq.description}
                  onChange={(e) => setNewRfq({ ...newRfq, description: e.target.value })}
                  placeholder="Describe the items you need quoted..."
                  className="form-textarea"
                  rows={4}
                />
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={newRfq.notes}
                  onChange={(e) => setNewRfq({ ...newRfq, notes: e.target.value })}
                  placeholder="Additional notes for vendor..."
                  className="form-textarea"
                  rows={3}
                />
              </div>

              <div className="form-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => setIsCreating(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary"
                  onClick={createRfq}
                >
                  <Plus size={16} />
                  Create RFQ
                </button>
              </div>
            </div>
          ) : selectedRfq ? (
            <div className="rfq-detail">
              <div className="rfq-detail-header">
                <div>
                  <h2>{selectedRfq.name}</h2>
                  <div className="rfq-detail-meta">
                    <span 
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(selectedRfq.status) }}
                    >
                      {selectedRfq.status}
                    </span>
                    <span 
                      className="priority-badge"
                      style={{ color: getPriorityColor(selectedRfq.priority) }}
                    >
                      {selectedRfq.priority} priority
                    </span>
                  </div>
                </div>
                <div className="rfq-detail-actions">
                  <button 
                    className="btn-icon"
                    onClick={() => exportRfq(selectedRfq)}
                    title="Export RFQ Data"
                  >
                    <Download size={18} />
                  </button>
                  <button 
                    className="btn-icon btn-danger"
                    onClick={() => deleteRfq(selectedRfq.id)}
                    title="Delete RFQ"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="rfq-detail-info">
                {selectedRfq.vendor && (
                  <div className="info-row">
                    <Building2 size={16} />
                    <span className="info-label">Vendor:</span>
                    <span className="info-value">{selectedRfq.vendor}</span>
                  </div>
                )}
                {selectedRfq.dueDate && (
                  <div className="info-row">
                    <Calendar size={16} />
                    <span className="info-label">Due Date:</span>
                    <span className="info-value">
                      {new Date(selectedRfq.dueDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
                <div className="info-row">
                  <Package size={16} />
                  <span className="info-label">Category:</span>
                  <span className="info-value">{selectedRfq.category}</span>
                </div>
              </div>

              {selectedRfq.description && (
                <div className="rfq-detail-section">
                  <h4>Description</h4>
                  <p>{selectedRfq.description}</p>
                </div>
              )}

              {selectedRfq.notes && (
                <div className="rfq-detail-section">
                  <h4>Notes</h4>
                  <p>{selectedRfq.notes}</p>
                </div>
              )}

              {/* Attached Drawings */}
              <div className="rfq-detail-section">
                <h4>
                  <FileText size={16} />
                  Linked Drawings ({selectedRfq.attachments?.length || 0})
                </h4>
                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0 0 12px 0' }}>
                  These are references to your drawings — originals remain in the drawing set.
                </p>
                {selectedRfq.attachments?.length > 0 ? (
                  <div className="attachment-list">
                    {selectedRfq.attachments.map((att, idx) => (
                      <div 
                        key={idx}
                        className="attachment-item"
                        onClick={() => openAttachment(att)}
                      >
                        <FileText size={14} />
                        <span className="attachment-name">{att.sheetName || att.sheet}</span>
                        <span className="attachment-page">Page {att.page}</span>
                        <ChevronRight size={14} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-attachments">
                    No drawings linked yet. Right-click a thumbnail in the PDF viewer and select "Add to RFQ" to link drawings. Your originals will stay in the drawing set.
                  </p>
                )}
              </div>

              {/* Status Actions */}
              <div className="rfq-status-actions">
                {selectedRfq.status === 'draft' && (
                  <button 
                    className="btn-primary"
                    onClick={() => updateRfq(selectedRfq.id, { status: 'sent' })}
                  >
                    <Send size={16} />
                    Mark as Sent
                  </button>
                )}
                {selectedRfq.status === 'sent' && (
                  <button 
                    className="btn-success"
                    onClick={() => updateRfq(selectedRfq.id, { status: 'received' })}
                  >
                    Quote Received
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="rfq-no-selection">
              <ClipboardList size={64} strokeWidth={1} />
              <h3>Select an RFQ</h3>
              <p>Select an RFQ from the list to view details, or create a new one.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RFQManager;
