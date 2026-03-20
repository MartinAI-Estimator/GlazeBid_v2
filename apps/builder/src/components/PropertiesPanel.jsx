import React, { useState, useEffect } from 'react';
import { calculateDeflection } from '../utils/physics';

const PropertiesPanel = ({ selectedMarkup, systemLibrary, projectName }) => {
    const [verification, setVerification] = useState(null);
    const [loadingVerification, setLoadingVerification] = useState(false);

    // Fetch verification status when markup changes
    useEffect(() => {
        if (!selectedMarkup?.id || !projectName) {
            setVerification(null);
            return;
        }

        const fetchVerification = async () => {
            setLoadingVerification(true);
            try {
                const encodedProjectName = encodeURIComponent(projectName);
                const response = await fetch(
                    `http://localhost:8000/api/projects/${encodedProjectName}/verify-entity/${selectedMarkup.id}`
                );
                const data = await response.json();
                
                if (data.success) {
                    setVerification(data.verification);
                }
            } catch {
                // Verification not available in offline/Electron mode — show nothing.
            } finally {
                setLoadingVerification(false);
            }
        };

        fetchVerification();
    }, [selectedMarkup?.id, projectName]);

    if (!selectedMarkup) return <div className="panel-empty">Select a markup to view data</div>;

    // Fetch system data from library (e.g., Kawneer 451T)
    const system = systemLibrary[selectedMarkup.systemID] || {};
    const structural = calculateDeflection(25, selectedMarkup.height_in, system.Ix || 1.0);

    return (
        <div style={{ width: '300px', background: '#252526', color: 'white', padding: '15px', borderLeft: '1px solid #444' }}>
            <h3>Elevation: {selectedMarkup.id}</h3>
            <hr />
            
            <div className="stat-group">
                <label>Dimensions</label>
                <p>{selectedMarkup.width_in}" W x {selectedMarkup.height_in}" H</p>
                <p>Area: {((selectedMarkup.width_in * selectedMarkup.height_in) / 144).toFixed(2)} SQFT</p>
            </div>

            <div className="stat-group" style={{ marginTop: '20px' }}>
                <label>Structural Status</label>
                <div style={{ 
                    padding: '10px', 
                    borderRadius: '4px', 
                    background: structural.pass ? '#1e4620' : '#5c1919',
                    border: `1px solid ${structural.pass ? '#4caf50' : '#f44336'}`
                }}>
                    <strong>{structural.pass ? 'PASS' : 'FAIL'}</strong>
                    <p>Deflection: {structural.value}"</p>
                    <p>Limit (L/175): {structural.limit}"</p>
                </div>
            </div>

            <div className="stat-group" style={{ marginTop: '20px' }}>
                <label>System: {system.name}</label>
                <select defaultValue={selectedMarkup.systemID}>
                    <option value="SF_451T">Kawneer 451T</option>
                    <option value="CW_1600">Kawneer 1600 UT</option>
                </select>
            </div>

            {/* 3-Point Verification Status (Multi-Modal Reasoning) */}
            {verification && (
                <div className="stat-group" style={{ marginTop: '20px' }}>
                    <label>AI Verification</label>
                    <div style={{
                        padding: '12px',
                        borderRadius: '6px',
                        background: verification.verified ? '#1e4620' : '#3a3a3a',
                        border: `2px solid ${verification.verified ? '#4caf50' : verification.confidence > 0.5 ? '#ff9800' : '#666'}`
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <strong>{verification.verified ? '✓ VERIFIED' : '⚠ PARTIAL'}</strong>
                            <span style={{
                                padding: '4px 8px',
                                borderRadius: '12px',
                                background: verification.verified ? '#4caf50' : verification.confidence > 0.5 ? '#ff9800' : '#666',
                                fontSize: '12px',
                                fontWeight: 'bold'
                            }}>
                                {Math.round(verification.confidence * 100)}%
                            </span>
                        </div>

                        {/* Verification Chain */}
                        <div style={{ marginTop: '12px', fontSize: '13px', color: '#ddd' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#aaa' }}>
                                Verification Chain:
                            </div>
                            {verification.chain && verification.chain.map((step, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    marginBottom: '4px',
                                    paddingLeft: '8px'
                                }}>
                                    <span style={{ color: '#4caf50', marginRight: '8px', fontSize: '16px' }}>→</span>
                                    <span style={{ flex: 1 }}>{step}</span>
                                </div>
                            ))}
                        </div>

                        {/* Issues */}
                        {verification.issues && verification.issues.length > 0 && (
                            <div style={{ marginTop: '12px', fontSize: '12px' }}>
                                <div style={{ fontWeight: 'bold', color: '#ff9800', marginBottom: '4px' }}>
                                    Issues:
                                </div>
                                {verification.issues.map((issue, i) => (
                                    <div key={i} style={{
                                        padding: '4px 8px',
                                        marginBottom: '4px',
                                        background: 'rgba(255, 152, 0, 0.1)',
                                        borderLeft: '3px solid #ff9800',
                                        borderRadius: '2px'
                                    }}>
                                        ⚠️ {issue}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Legend */}
                        <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #444', fontSize: '11px', color: '#888' }}>
                            <div>✓ 3 points = Fully verified (Elevation + Schedule + Detail)</div>
                            <div>⚠ 2 points = Partial (missing detail reference)</div>
                            <div>✗ 1 point = Unverified (not in schedule)</div>
                        </div>
                    </div>

                    {loadingVerification && (
                        <div style={{ textAlign: 'center', padding: '10px', color: '#888' }}>
                            Loading verification...
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PropertiesPanel;
