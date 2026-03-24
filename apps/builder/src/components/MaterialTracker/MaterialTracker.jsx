/**
 * Material Tracker Component
 * Tracks materials from SOW (Statement of Work) tab
 * Maintains Excel formulas for material calculations
 */
import React, { useState, useEffect } from 'react';
import { Package, Download, Upload, Plus, Trash2, Edit2, Save } from 'lucide-react';
import './MaterialTracker.css';

const MaterialTracker = ({ project }) => {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newMaterial, setNewMaterial] = useState({
    description: '',
    quantity: 0,
    unit: 'EA',
    unitCost: 0.00,
    supplier: '',
    leadTime: ''
  });

  // Load materials from backend
  useEffect(() => {
    if (project) {
      loadMaterials();
    }
  }, [project]);

  const loadMaterials = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/materials/projects/${encodeURIComponent(project)}`);
      const data = await response.json();
      
      if (data.success && data.materials) {
        setMaterials(data.materials);
      }
    } catch (err) {
      console.error('Failed to load materials:', err);
    } finally {
      setLoading(false);
    }
  };

  const addMaterial = async () => {
    if (!newMaterial.description) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/materials/projects/${encodeURIComponent(project)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMaterial)
      });
      
      const data = await response.json();
      if (data.success) {
        await loadMaterials();
        setNewMaterial({
          description: '',
          quantity: 0,
          unit: 'EA',
          unitCost: 0.00,
          supplier: '',
          leadTime: ''
        });
      }
    } catch (err) {
      console.error('Failed to add material:', err);
    }
  };

  const deleteMaterial = async (materialId) => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/materials/${materialId}?project_name=${encodeURIComponent(project)}`, {
        method: 'DELETE'
      });
      await loadMaterials();
    } catch (err) {
      console.error('Failed to delete material:', err);
    }
  };

  const updateMaterial = async (materialId, updates) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/materials/${materialId}?project_name=${encodeURIComponent(project)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      
      const data = await response.json();
      if (data.success) {
        await loadMaterials();
        setEditingId(null);
      }
    } catch (err) {
      console.error('Failed to update material:', err);
    }
  };

  // Calculate totals
  const totalQuantity = materials.reduce((sum, m) => sum + (m.quantity || 0), 0);
  const totalCost = materials.reduce((sum, m) => sum + ((m.quantity || 0) * (m.unitCost || 0)), 0);

  return (
    <div className="material-tracker-container">
      {/* Header */}
      <div className="material-tracker-header">
        <div className="material-tracker-title">
          <Package size={28} color="#F59E0B" />
          <div>
            <h1>Material Tracker</h1>
            <p className="subtitle">Statement of Work - Material Management</p>
          </div>
        </div>
        <div className="material-tracker-actions">
          <button className="btn-secondary">
            <Upload size={18} />
            Import from Excel
          </button>
          <button className="btn-primary">
            <Download size={18} />
            Export SOW
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="material-summary-cards">
        <div className="summary-card">
          <div className="summary-label">Total Items</div>
          <div className="summary-value">{materials.length}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Total Quantity</div>
          <div className="summary-value">{totalQuantity.toFixed(0)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Total Material Cost</div>
          <div className="summary-value">${totalCost.toFixed(2)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Pending Orders</div>
          <div className="summary-value">
            {materials.filter(m => m.status === 'pending').length}
          </div>
        </div>
      </div>

      {/* Material Table */}
      <div className="material-table-container">
        <table className="material-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Unit Cost</th>
              <th>Total Cost</th>
              <th>Supplier</th>
              <th>Lead Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((material) => (
              <tr key={material.id}>
                <td>{material.description}</td>
                <td className="text-right">{material.quantity}</td>
                <td>{material.unit}</td>
                <td className="text-right">${material.unitCost?.toFixed(2)}</td>
                <td className="text-right total-cost">
                  ${((material.quantity || 0) * (material.unitCost || 0)).toFixed(2)}
                </td>
                <td>{material.supplier || '-'}</td>
                <td>{material.leadTime || '-'}</td>
                <td>
                  <div className="action-buttons">
                    <button 
                      className="btn-icon"
                      onClick={() => setEditingId(material.id)}
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      className="btn-icon btn-danger"
                      onClick={() => deleteMaterial(material.id)}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            
            {materials.length === 0 && !loading && (
              <tr>
                <td colSpan="8" className="empty-state">
                  No materials added yet. Add your first material below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Material Form */}
      <div className="add-material-section">
        <h3>Add New Material</h3>
        <div className="add-material-form">
          <input
            type="text"
            placeholder="Material Description"
            value={newMaterial.description}
            onChange={(e) => setNewMaterial({...newMaterial, description: e.target.value})}
            className="form-input"
          />
          <input
            type="number"
            placeholder="Quantity"
            value={newMaterial.quantity}
            onChange={(e) => setNewMaterial({...newMaterial, quantity: parseFloat(e.target.value) || 0})}
            className="form-input small"
          />
          <select
            value={newMaterial.unit}
            onChange={(e) => setNewMaterial({...newMaterial, unit: e.target.value})}
            className="form-select small"
          >
            <option value="EA">EA</option>
            <option value="SF">SF</option>
            <option value="LF">LF</option>
            <option value="BOX">BOX</option>
            <option value="GAL">GAL</option>
          </select>
          <input
            type="number"
            step="0.01"
            placeholder="Unit Cost"
            value={newMaterial.unitCost}
            onChange={(e) => setNewMaterial({...newMaterial, unitCost: parseFloat(e.target.value) || 0})}
            className="form-input small"
          />
          <input
            type="text"
            placeholder="Supplier"
            value={newMaterial.supplier}
            onChange={(e) => setNewMaterial({...newMaterial, supplier: e.target.value})}
            className="form-input"
          />
          <input
            type="text"
            placeholder="Lead Time"
            value={newMaterial.leadTime}
            onChange={(e) => setNewMaterial({...newMaterial, leadTime: e.target.value})}
            className="form-input small"
          />
          <button 
            className="btn-primary"
            onClick={addMaterial}
          >
            <Plus size={18} />
            Add Material
          </button>
        </div>
      </div>
    </div>
  );
};

export default MaterialTracker;
