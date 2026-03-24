import React, { useState, useEffect } from 'react';
import { Download, FileText, AlertCircle, Package, Wrench, Layers } from 'lucide-react';

const DoorSchedule = ({ project, projectData }) => {
  const doorSchedules = projectData?.doorSchedules?.schedules || null;
  const [loading, setLoading] = useState(!projectData);
  const [activeTab, setActiveTab] = useState('aluminum'); // 'aluminum' or 'glazing'
  const [classifiedDoors, setClassifiedDoors] = useState(null);
  const [aluminumSchedule, setAluminumSchedule] = useState(null);
  const [glazingSchedule, setGlazingSchedule] = useState(null);

  // Classify doors on mount
  useEffect(() => {
    if (doorSchedules && project) {
      classifyDoors();
    }
  }, [doorSchedules, project]);

  const classifyDoors = async () => {
    setLoading(true);
    // Backend not available in local/Electron mode — degrade gracefully.
    // Schedules remain null, which triggers the empty-state UI below.
    try {
      const classifyResponse = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/door-schedule/projects/${encodeURIComponent(project)}/classify`,
        { method: 'POST' }
      );
      if (!classifyResponse.ok) throw new Error('no server');
      const classifyData = await classifyResponse.json();
      if (classifyData.success) setClassifiedDoors(classifyData);

      const aluminumResponse = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/door-schedule/projects/${encodeURIComponent(project)}/aluminum-schedule`
      );
      if (!aluminumResponse.ok) throw new Error('no server');
      const aluminumData = await aluminumResponse.json();
      if (aluminumData.success) setAluminumSchedule(aluminumData);

      const glazingResponse = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/door-schedule/projects/${encodeURIComponent(project)}/glazing-schedule`
      );
      if (!glazingResponse.ok) throw new Error('no server');
      const glazingData = await glazingResponse.json();
      if (glazingData.success) setGlazingSchedule(glazingData);
    } catch {
      // Server unavailable — schedules stay null, empty-state UI renders instead.
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = async () => {
    try {
      const endpoint = activeTab === 'aluminum' ? 'aluminum' : 'glazing';
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/door-schedule/projects/${encodeURIComponent(project)}/export/${endpoint}`
      );
      if (!response.ok) throw new Error('no server');
      const data = await response.json();
      const blob = new Blob([data.content], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // Export not available in local mode — no server running.
      console.warn('CSV export unavailable: backend server is not running.');
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Classifying doors and calculating glass areas...</p>
        </div>
      </div>
    );
  }

  if (!doorSchedules || Object.keys(doorSchedules).length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyContainer}>
          <Package size={64} color="#6b7280" />
          <h2 style={styles.emptyTitle}>No Door Schedules</h2>
          <p style={styles.emptyText}>
            Go to Spec Viewer and extract requirements from Door Hardware sections (08 71 XX) to see door schedules here.
          </p>
        </div>
      </div>
    );
  }

  // Calculate totals based on active tab
  const getTotals = () => {
    if (activeTab === 'aluminum' && aluminumSchedule) {
      return {
        totalDoors: aluminumSchedule.total_doors || 0,
        totalHardwareSets: Object.keys(aluminumSchedule.hardware_sets || {}).length,
        label: 'Aluminum/Storefront Doors'
      };
    } else if (activeTab === 'glazing' && glazingSchedule) {
      const totalSF = glazingSchedule.doors?.reduce((sum, door) => sum + (door.net_sf || 0), 0) || 0;
      return {
        totalDoors: glazingSchedule.total_doors || 0,
        totalSF: totalSF.toFixed(2),
        label: 'All Doors - Glazing Takeoff'
      };
    }
    return { totalDoors: 0, label: 'Loading...' };
  };

  const totals = getTotals();

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🚪 Door Schedule - Dual View</h1>
          <p style={styles.subtitle}>Project: {project}</p>
        </div>
        <div style={styles.exportButtons}>
          <button onClick={exportToCSV} style={styles.exportButton}>
            <Download size={18} />
            <span style={{marginLeft: '8px'}}>
              Export {activeTab === 'aluminum' ? 'Hardware Vendor' : 'Glazing Takeoff'}
            </span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabsContainer}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'aluminum' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('aluminum')}
        >
          <Wrench size={18} />
          <span style={{marginLeft: '8px'}}>Schedule A: Aluminum/Storefront</span>
          {aluminumSchedule && (
            <span style={styles.tabBadge}>{aluminumSchedule.total_doors}</span>
          )}
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'glazing' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('glazing')}
        >
          <Layers size={18} />
          <span style={{marginLeft: '8px'}}>Schedule B: Glazing Takeoff</span>
          {glazingSchedule && (
            <span style={styles.tabBadge}>{glazingSchedule.total_doors}</span>
          )}
        </button>
      </div>

      {/* Summary Cards */}
      <div style={styles.cardsGrid}>
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={{...styles.cardIcon, backgroundColor: 'rgba(0, 123, 255, 0.15)'}}>
              <FileText size={24} color="#007BFF" />
            </div>
            <div>
              <div style={styles.cardLabel}>{totals.label}</div>
              <div style={styles.cardValue}>{totals.totalDoors}</div>
            </div>
          </div>
        </div>

        {activeTab === 'aluminum' && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={{...styles.cardIcon, backgroundColor: 'rgba(245, 158, 11, 0.15)'}}>
                <Package size={24} color="#f59e0b" />
              </div>
              <div>
                <div style={styles.cardLabel}>Hardware Sets</div>
                <div style={styles.cardValue}>{totals.totalHardwareSets}</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'glazing' && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={{...styles.cardIcon, backgroundColor: 'rgba(16, 185, 129, 0.15)'}}>
                <Layers size={24} color="#10b981" />
              </div>
              <div>
                <div style={styles.cardLabel}>Total Glass SF</div>
                <div style={styles.cardValue}>{totals.totalSF}</div>
              </div>
            </div>
          </div>
        )}

        {classifiedDoors && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={{...styles.cardIcon, backgroundColor: 'rgba(139, 92, 246, 0.15)'}}>
                <AlertCircle size={24} color="#8b5cf6" />
              </div>
              <div>
                <div style={styles.cardLabel}>Classification</div>
                <div style={{fontSize: '14px', color: '#9ea7b3'}}>
                  {classifiedDoors.aluminum_doors} AL / {classifiedDoors.hm_doors} HM
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Schedule A: Aluminum/Storefront Doors */}
      {activeTab === 'aluminum' && aluminumSchedule && (
        <div style={styles.scheduleContent}>
          <div style={styles.scheduleDescription}>
            <h3>📋 Hardware Vendor Schedule</h3>
            <p>Aluminum and storefront doors with complete hardware specifications for vendor quoting.</p>
          </div>

          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeader}>
                  <th style={styles.th}>Mark</th>
                  <th style={styles.th}>Section</th>
                  <th style={styles.th}>Size</th>
                  <th style={styles.th}>Door Type</th>
                  <th style={styles.th}>Hardware Set</th>
                  <th style={styles.th}>Fire Rating</th>
                  <th style={styles.th}>Scope</th>
                </tr>
              </thead>
              <tbody>
                {aluminumSchedule.doors.map((door, idx) => (
                  <tr key={idx} style={styles.tableRow}>
                    <td style={styles.td}>
                      <span style={styles.doorMark}>{door.mark}</span>
                    </td>
                    <td style={styles.td}>{door.section_code}</td>
                    <td style={styles.td}>{door.size}</td>
                    <td style={styles.td}>{door.type || '-'}</td>
                    <td style={styles.td}>
                      {door.hardware_set ? (
                        <span style={styles.hwSetBadge}>{door.hardware_set}</span>
                      ) : '-'}
                    </td>
                    <td style={styles.td}>{door.fire_rating || '-'}</td>
                    <td style={styles.td}>
                      <span style={styles.scopeBadgeAluminum}>{door.scope_label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Hardware Sets Detail */}
          {aluminumSchedule.hardware_sets && Object.keys(aluminumSchedule.hardware_sets).length > 0 && (
            <div style={styles.hardwareSetsContainer}>
              <h3 style={styles.tableTitle}>Hardware Sets ({Object.keys(aluminumSchedule.hardware_sets).length})</h3>
              {Object.entries(aluminumSchedule.hardware_sets).map(([setId, setInfo]) => (
                <div key={setId} style={styles.hwSetCard}>
                  <div style={styles.hwSetHeader}>
                    <span style={styles.hwSetId}>{setInfo.id}</span>
                    {setInfo.items && setInfo.items.length > 0 && (
                      <div style={styles.hwSetItems}>
                        {setInfo.items.map((item, idx) => (
                          <span key={idx} style={styles.hwSetItem}>{item}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {setInfo.description && (
                    <p style={styles.hwSetDescription}>{setInfo.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule B: Glazing Takeoff */}
      {activeTab === 'glazing' && glazingSchedule && (
        <div style={styles.scheduleContent}>
          <div style={styles.scheduleDescription}>
            <h3>🔍 Glazing Takeoff Schedule</h3>
            <p>All doors requiring glazing with calculated glass areas for material ordering.</p>
          </div>

          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeader}>
                  <th style={styles.th}>Mark</th>
                  <th style={styles.th}>Section</th>
                  <th style={styles.th}>Size</th>
                  <th style={styles.th}>Stile Type</th>
                  <th style={styles.th}>Glass Width</th>
                  <th style={styles.th}>Glass Height</th>
                  <th style={styles.th}>Glass SF</th>
                  <th style={styles.th}>Scope</th>
                </tr>
              </thead>
              <tbody>
                {glazingSchedule.doors.map((door, idx) => (
                  <tr key={idx} style={styles.tableRow}>
                    <td style={styles.td}>
                      <span style={styles.doorMark}>{door.mark}</span>
                    </td>
                    <td style={styles.td}>{door.section_code}</td>
                    <td style={styles.td}>{door.size}</td>
                    <td style={styles.td}>{door.stile_label || '-'}</td>
                    <td style={styles.td}>{door.width_net_inches || '-'}"</td>
                    <td style={styles.td}>{door.height_net_inches || '-'}"</td>
                    <td style={styles.td}>
                      <span style={styles.glassSF}>{door.net_sf || '-'}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={
                        door.scope === 'ALUMINUM_SCOPE' 
                          ? styles.scopeBadgeAluminum 
                          : styles.scopeBadgeHM
                      }>
                        {door.scope_label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Glass Summary by Type */}
          {glazingSchedule.summary && glazingSchedule.summary.length > 0 && (
            <div style={styles.summarySection}>
              <h3 style={styles.tableTitle}>Glass Summary by Type</h3>
              <table style={styles.summaryTable}>
                <thead>
                  <tr style={styles.tableHeader}>
                    <th style={styles.th}>Glass Type</th>
                    <th style={styles.th}>Door Count</th>
                    <th style={styles.th}>Total SF</th>
                  </tr>
                </thead>
                <tbody>
                  {glazingSchedule.summary.map((item, idx) => (
                    <tr key={idx} style={styles.tableRow}>
                      <td style={styles.td}>{item.glass_type}</td>
                      <td style={styles.td}>{item.door_count}</td>
                      <td style={styles.td}>
                        <span style={styles.glassSF}>{item.total_sf}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    width: '100%',
    height: '100vh',
    backgroundColor: '#0b0e11',
    color: '#ffffff',
    overflow: 'auto',
    padding: '40px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
  },
  title: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#ffffff',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '14px',
    color: '#9ea7b3',
    margin: 0,
  },
  exportButtons: {
    display: 'flex',
    gap: '12px',
  },
  exportButton: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 20px',
    backgroundColor: '#007BFF',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.2s',
  },
  tabsContainer: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
    borderBottom: '2px solid #2d333b',
    paddingBottom: '0',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 24px',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '3px solid transparent',
    color: '#9ea7b3',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    position: 'relative',
    bottom: '-2px',
  },
  activeTab: {
    color: '#58a6ff',
    borderBottomColor: '#58a6ff',
  },
  tabBadge: {
    marginLeft: '8px',
    padding: '2px 8px',
    backgroundColor: '#2d333b',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '700',
  },
  scheduleContent: {
    marginTop: '24px',
  },
  scheduleDescription: {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: '#1c2128',
    borderRadius: '8px',
    borderLeft: '4px solid #58a6ff',
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '32px',
  },
  card: {
    backgroundColor: '#1c2128',
    borderRadius: '12px',
    padding: '24px',
    border: '1px solid #2d333b',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  cardIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: '13px',
    color: '#9ea7b3',
    marginBottom: '4px',
    fontWeight: '500',
  },
  cardValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#ffffff',
  },
  sectionCard: {
    backgroundColor: '#1c2128',
    borderRadius: '12px',
    padding: '32px',
    border: '1px solid #2d333b',
    marginBottom: '24px',
  },
  sectionHeader: {
    marginBottom: '24px',
    borderBottom: '2px solid #2d333b',
    paddingBottom: '16px',
  },
  sectionCode: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#007BFF',
    margin: '0 0 4px 0',
  },
  sectionName: {
    fontSize: '14px',
    color: '#9ea7b3',
    margin: 0,
  },
  tableContainer: {
    marginBottom: '24px',
  },
  tableTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: '12px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: '#0b0e11',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  tableHeader: {
    backgroundColor: '#2d333b',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '13px',
    fontWeight: '600',
    color: '#9ea7b3',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  tableRow: {
    borderBottom: '1px solid #2d333b',
    transition: 'background-color 0.15s',
  },
  td: {
    padding: '16px',
    fontSize: '14px',
    color: '#ffffff',
  },
  doorMark: {
    fontWeight: '700',
    color: '#007BFF',
    fontSize: '16px',
  },
  hwSetBadge: {
    display: 'inline-block',
    backgroundColor: '#f59e0b',
    color: '#000',
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
  },
  scopeBadgeAluminum: {
    display: 'inline-block',
    backgroundColor: 'rgba(0, 123, 255, 0.2)',
    color: '#58a6ff',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    border: '1px solid #58a6ff',
  },
  scopeBadgeHM: {
    display: 'inline-block',
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    color: '#a78bfa',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    border: '1px solid #8b5cf6',
  },
  glassSF: {
    fontWeight: '700',
    color: '#10b981',
    fontSize: '14px',
  },
  hardwareSetsContainer: {
    marginTop: '24px',
  },
  hwSetCard: {
    backgroundColor: '#0b0e11',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px',
    border: '1px solid #2d333b',
  },
  hwSetHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '8px',
    flexWrap: 'wrap',
  },
  hwSetId: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#f59e0b',
  },
  hwSetItems: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  hwSetItem: {
    backgroundColor: '#2d333b',
    color: '#9ea7b3',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
  },
  hwSetDescription: {
    fontSize: '13px',
    color: '#d1d5db',
    margin: 0,
    lineHeight: '1.5',
  },
  summarySection: {
    marginTop: '32px',
    padding: '24px',
    backgroundColor: '#1c2128',
    borderRadius: '12px',
    border: '2px solid #10b981',
  },
  summaryTable: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: '#0b0e11',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #2d333b',
    borderTop: '4px solid #007BFF',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '16px',
    color: '#9ea7b3',
    fontSize: '14px',
  },
  emptyContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#ffffff',
    margin: '24px 0 12px 0',
  },
  emptyText: {
    fontSize: '14px',
    color: '#9ea7b3',
    maxWidth: '400px',
    lineHeight: '1.6',
  },
};

export default DoorSchedule;
