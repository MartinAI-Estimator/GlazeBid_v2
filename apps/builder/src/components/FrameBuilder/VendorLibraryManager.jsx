/**
 * VendorLibraryManager.jsx
 *
 * Browse all 11 archetypes and 12 vendor systems built into the frame engine.
 * Estimators can see part catalogs, add custom notes per vendor, and mark preferred vendors.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, Star, Plus } from 'lucide-react';
import './VendorLibraryManager.css';

// Mock frame engine imports — replace with actual when available
// import { ARCHETYPE_CATALOG, VENDOR_CATALOG, getVendorsForArchetype, getArchetypesByCategory } from '@glazebid/frame-engine';

// Fallback data structure for demonstration
const MOCK_ARCHETYPES = {
  'arch-sf-1': {
    id: 'arch-sf-1',
    name: 'Standard Storefront 1.5"',
    category: 'storefront',
    description: 'Classic aluminum storefront system with 1.5" mullions',
    thermalBreak: true,
    ssgCapable: false,
    maxWindPsf: 45,
    maxSpanFt: 12,
    glassBiteMin: 0.375,
    glassBiteMax: 0.75,
    typicalSightline: '1.75"',
  },
  'arch-cw-2': {
    id: 'arch-cw-2',
    name: 'Structural Curtain Wall 2"',
    category: 'curtain-wall',
    description: 'High-performance curtain wall with structural silicone',
    thermalBreak: true,
    ssgCapable: true,
    maxWindPsf: 65,
    maxSpanFt: 15,
    glassBiteMin: 0.5,
    glassBiteMax: 1.0,
    typicalSightline: '2.25"',
  },
  'arch-ww-1': {
    id: 'arch-ww-1',
    name: 'Window Wall Hybrid',
    category: 'window-wall',
    description: 'Combined window and wall system with integrated spandrel',
    thermalBreak: true,
    ssgCapable: false,
    maxWindPsf: 55,
    maxSpanFt: 14,
    glassBiteMin: 0.4375,
    glassBiteMax: 0.8125,
    typicalSightline: '2.0"',
  },
  'arch-ag-1': {
    id: 'arch-ag-1',
    name: 'All-Glass Assembly',
    category: 'all-glass',
    description: 'Frameless glass panel system',
    thermalBreak: false,
    ssgCapable: false,
    maxWindPsf: 35,
    maxSpanFt: 10,
    glassBiteMin: 0.5,
    glassBiteMax: 1.25,
    typicalSightline: '0.5"',
  },
};

const MOCK_VENDORS = {
  'vendor-sch-1': {
    id: 'vendor-sch-1',
    vendorName: 'Schüco International',
    systemName: 'UW 75 Storefront',
    systemId: 'UW-75-SF',
    supportedArchetypeId: 'arch-sf-1',
    parts: [
      { partNumber: 'UW75-HEAD-01', role: 'head', description: 'Head channel assembly', weightLbsFt: 2.4 },
      { partNumber: 'UW75-SILL-01', role: 'sill', description: 'Sill channel assembly', weightLbsFt: 2.6 },
      { partNumber: 'UW75-JAMB-01', role: 'jamb', description: 'Vertical jamb post', weightLbsFt: 2.2 },
      { partNumber: 'UW75-MULL-V-01', role: 'mullion-v', description: 'Vertical mullion extrusion', weightLbsFt: 2.5 },
    ],
  },
  'vendor-sch-2': {
    id: 'vendor-sch-2',
    vendorName: 'Schüco International',
    systemName: 'FW 50+ Curtain Wall',
    systemId: 'FW-50-CW',
    supportedArchetypeId: 'arch-cw-2',
    parts: [
      { partNumber: 'FW50-HEAD-01', role: 'head', description: 'Structural head assembly', weightLbsFt: 3.8 },
      { partNumber: 'FW50-JAMB-01', role: 'jamb', description: 'Structural jamb post', weightLbsFt: 4.2 },
      { partNumber: 'FW50-MULL-01', role: 'mullion-v', description: 'Vertical mullion with SI cavity', weightLbsFt: 3.9 },
    ],
  },
  'vendor-yku-1': {
    id: 'vendor-yku-1',
    vendorName: 'YKK AP',
    systemName: 'Storefront 450',
    systemId: 'SF-450',
    supportedArchetypeId: 'arch-sf-1',
    parts: [
      { partNumber: 'SF450-H', role: 'head', description: 'Head rail', weightLbsFt: 2.3 },
      { partNumber: 'SF450-S', role: 'sill', description: 'Sill rail', weightLbsFt: 2.4 },
      { partNumber: 'SF450-J', role: 'jamb', description: 'Jamb stile', weightLbsFt: 2.1 },
    ],
  },
  'vendor-alco-1': {
    id: 'vendor-alco-1',
    vendorName: 'Alcoa Architectural Products',
    systemName: 'Durawall CW',
    systemId: 'DURA-CW-2',
    supportedArchetypeId: 'arch-cw-2',
    parts: [
      { partNumber: 'DW-CW-001', role: 'head', description: 'Aluminum head structure', weightLbsFt: 3.5 },
      { partNumber: 'DW-CW-002', role: 'jamb', description: 'Aluminum jamb structure', weightLbsFt: 3.7 },
    ],
  },
};

const getArchetypesByCategory = () => {
  const categories = {
    storefront: [],
    'curtain-wall': [],
    'window-wall': [],
    'all-glass': [],
  };
  Object.values(MOCK_ARCHETYPES).forEach((arch) => {
    if (categories[arch.category]) {
      categories[arch.category].push(arch);
    }
  });
  return categories;
};

const getVendorsForArchetype = (archetypeId) => {
  return Object.values(MOCK_VENDORS).filter(
    (v) => v.supportedArchetypeId === archetypeId
  );
};

export default function VendorLibraryManager() {
  const [selectedArchetypeId, setSelectedArchetypeId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategoryId, setExpandedCategoryId] = useState(null);
  const [vendorNotes, setVendorNotes] = useState({});
  const [preferredVendors, setPreferredVendors] = useState({});

  // Load persisted notes and preferences from localStorage
  useEffect(() => {
    try {
      const savedNotes = localStorage.getItem('glazebid-vendor-notes');
      if (savedNotes) setVendorNotes(JSON.parse(savedNotes));

      const savedPrefs = localStorage.getItem('glazebid-vendor-prefs');
      if (savedPrefs) setPreferredVendors(JSON.parse(savedPrefs));
    } catch (e) {
      console.warn('Failed to load vendor preferences:', e);
    }
  }, []);

  // Persist notes to localStorage
  const updateVendorNotes = (systemId, notes) => {
    const updated = { ...vendorNotes, [systemId]: notes };
    setVendorNotes(updated);
    localStorage.setItem('glazebid-vendor-notes', JSON.stringify(updated));
  };

  // Toggle preferred vendor
  const togglePreferred = (systemId) => {
    const updated = { ...preferredVendors };
    if (updated[systemId]) {
      delete updated[systemId];
    } else {
      updated[systemId] = true;
    }
    setPreferredVendors(updated);
    localStorage.setItem('glazebid-vendor-prefs', JSON.stringify(updated));
  };

  const archetypesByCategory = getArchetypesByCategory();
  const selectedArchetype = selectedArchetypeId
    ? MOCK_ARCHETYPES[selectedArchetypeId]
    : null;
  const vendorsForArchetype = selectedArchetypeId
    ? getVendorsForArchetype(selectedArchetypeId)
    : [];

  // Filter archetypes and vendors by search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return archetypesByCategory;

    const query = searchQuery.toLowerCase();
    const filtered = {};
    Object.entries(archetypesByCategory).forEach(([cat, archs]) => {
      filtered[cat] = archs.filter((arch) =>
        arch.name.toLowerCase().includes(query) ||
        arch.description.toLowerCase().includes(query)
      );
    });
    return filtered;
  }, [searchQuery, archetypesByCategory]);

  const filteredVendors = useMemo(() => {
    if (!searchQuery.trim()) return vendorsForArchetype;
    const query = searchQuery.toLowerCase();
    return vendorsForArchetype.filter(
      (v) =>
        v.vendorName.toLowerCase().includes(query) ||
        v.systemName.toLowerCase().includes(query) ||
        v.systemId.toLowerCase().includes(query)
    );
  }, [searchQuery, vendorsForArchetype]);

  const allVendors = useMemo(() => {
    if (!searchQuery.trim()) return Object.values(MOCK_VENDORS);
    const query = searchQuery.toLowerCase();
    return Object.values(MOCK_VENDORS).filter(
      (v) =>
        v.vendorName.toLowerCase().includes(query) ||
        v.systemName.toLowerCase().includes(query) ||
        v.systemId.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const categoryLabels = {
    storefront: 'Storefronts',
    'curtain-wall': 'Curtain Walls',
    'window-wall': 'Window Walls',
    'all-glass': 'All-Glass Systems',
  };

  return (
    <div className="vendor-library-container">
      {/* Header */}
      <div className="vendor-library-header">
        <h2>Vendor Library</h2>
        <input
          type="text"
          placeholder="Search archetypes & vendors..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="vendor-search-input"
        />
      </div>

      <div className="vendor-library-layout">
        {/* Left Column: Archetype Browser */}
        <div className="vendor-library-left">
          <div className="archetype-browser">
            {selectedArchetypeId === null && (
              <div className="all-vendors-view">
                <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#0ea5e9' }}>
                  All {allVendors.length} Vendors
                </h3>
                <div className="vendor-grid">
                  {allVendors.map((vendor) => (
                    <div
                      key={vendor.id}
                      className="vendor-grid-card"
                      onClick={() => setSelectedArchetypeId(vendor.supportedArchetypeId)}
                    >
                      <div className="vendor-grid-name">{vendor.vendorName}</div>
                      <div className="vendor-grid-system">{vendor.systemName}</div>
                      <div className="vendor-grid-id">{vendor.systemId}</div>
                      <div className="vendor-grid-parts">
                        {vendor.parts.length} parts
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedArchetypeId === null && (
              <>
                {Object.entries(filteredCategories).map(([catKey, archs]) => (
                  <div key={catKey} className="archetype-category">
                    <button
                      className="category-header"
                      onClick={() =>
                        setExpandedCategoryId(
                          expandedCategoryId === catKey ? null : catKey
                        )
                      }
                    >
                      {expandedCategoryId === catKey ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                      <span>{categoryLabels[catKey]}</span>
                      <span className="category-count">({archs.length})</span>
                    </button>

                    {expandedCategoryId === catKey && (
                      <div className="archetype-list">
                        {archs.map((arch) => (
                          <button
                            key={arch.id}
                            className={`archetype-card ${
                              selectedArchetypeId === arch.id ? 'active' : ''
                            }`}
                            onClick={() => setSelectedArchetypeId(arch.id)}
                          >
                            <div className="archetype-name">{arch.name}</div>
                            <div className="archetype-meta">
                              <span className="badge">
                                {arch.maxWindPsf} psf
                              </span>
                              <span className="badge">
                                {arch.maxSpanFt}ft span
                              </span>
                              {arch.thermalBreak && (
                                <span className="badge badge-thermal">
                                  Thermal: Yes
                                </span>
                              )}
                              {arch.ssgCapable && (
                                <span className="badge badge-ssg">
                                  SSG: Yes
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Right Column: Detail Panel */}
        <div className="vendor-library-right">
          {selectedArchetypeId === null ? (
            <div className="detail-placeholder">
              <p>Select an archetype to view details and vendors</p>
            </div>
          ) : (
            <>
              {/* Archetype Info Card */}
              <div className="archetype-info-card">
                <h3>{selectedArchetype.name}</h3>
                <p className="category-label">
                  {categoryLabels[selectedArchetype.category]}
                </p>
                <p className="description">{selectedArchetype.description}</p>

                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">Thermal Break</span>
                    <span className="info-value">
                      {selectedArchetype.thermalBreak ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">SSG Capable</span>
                    <span className="info-value">
                      {selectedArchetype.ssgCapable ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Max Wind</span>
                    <span className="info-value">
                      {selectedArchetype.maxWindPsf} psf
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Max Span</span>
                    <span className="info-value">
                      {selectedArchetype.maxSpanFt} ft
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Glass Bite Range</span>
                    <span className="info-value">
                      {selectedArchetype.glassBiteMin}" -{' '}
                      {selectedArchetype.glassBiteMax}"
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Typical Sightline</span>
                    <span className="info-value">
                      {selectedArchetype.typicalSightline}
                    </span>
                  </div>
                </div>

                <button
                  className="btn-back"
                  onClick={() => setSelectedArchetypeId(null)}
                >
                  Back to All Archetypes
                </button>
              </div>

              {/* Vendors for this Archetype */}
              <h4 className="vendors-heading">
                Vendors for {selectedArchetype.name}
              </h4>
              <div className="vendors-container">
                {filteredVendors.length === 0 ? (
                  <div className="no-vendors">
                    No vendors match your search
                  </div>
                ) : (
                  filteredVendors.map((vendor) => (
                    <div key={vendor.id} className="vendor-detail-card">
                      <div className="vendor-header">
                        <div className="vendor-title">
                          <h5>{vendor.vendorName}</h5>
                          <p>{vendor.systemName}</p>
                        </div>
                        <button
                          className={`btn-star ${
                            preferredVendors[vendor.systemId] ? 'preferred' : ''
                          }`}
                          onClick={() => togglePreferred(vendor.systemId)}
                          title="Mark as preferred vendor"
                        >
                          <Star size={18} />
                        </button>
                      </div>

                      <div className="system-id-badge">
                        System ID: {vendor.systemId}
                      </div>

                      {/* Parts Table */}
                      <table className="parts-table">
                        <thead>
                          <tr>
                            <th>Part #</th>
                            <th>Role</th>
                            <th>Description</th>
                            <th>Weight</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vendor.parts.map((part, idx) => (
                            <tr key={idx}>
                              <td>{part.partNumber}</td>
                              <td>{part.role}</td>
                              <td>{part.description}</td>
                              <td>{part.weightLbsFt} lbs/ft</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Custom Notes */}
                      <div className="vendor-notes-section">
                        <label>Estimator Notes</label>
                        <textarea
                          className="notes-textarea"
                          placeholder="E.g., Lead time: 8 weeks, contact John at ext 204"
                          value={vendorNotes[vendor.systemId] || ''}
                          onChange={(e) =>
                            updateVendorNotes(vendor.systemId, e.target.value)
                          }
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="vendor-actions">
                        <button className="btn btn-secondary">
                          Set as Default
                        </button>
                        <button className="btn btn-secondary">
                          Add to Frame
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
