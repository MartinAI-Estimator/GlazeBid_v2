import React, { useState, useMemo, useCallback } from 'react';
import { 
  X, 
  Table2, 
  Search, 
  Filter,
  Download,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  SortAsc,
  SortDesc,
  Layers
} from 'lucide-react';

/**
 * ScheduleViewer Component
 * Displays extracted schedules (door, window, hardware, etc.) from drawings
 * Allows filtering, searching, and exporting schedule data
 */
const ScheduleViewer = ({ 
  isOpen, 
  onClose, 
  project,
  schedules = [] // Array of schedule objects from AI extraction
}) => {
  const [activeSchedule, setActiveSchedule] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [copiedCell, setCopiedCell] = useState(null);
  const [filterColumn, setFilterColumn] = useState(null);
  const [filterValue, setFilterValue] = useState('');

  // Sample schedule data for demonstration
  const sampleSchedules = useMemo(() => [
    {
      id: 'window_schedule',
      name: 'Window Schedule',
      type: 'window',
      sheet: 'A8.1',
      columns: ['Mark', 'Width', 'Height', 'Type', 'Glass', 'Frame', 'Qty', 'Notes'],
      data: [
        { Mark: 'W-1', Width: '4\'-0"', Height: '5\'-0"', Type: 'Fixed', Glass: '1" IG Low-E', Frame: 'Aluminum', Qty: 12, Notes: 'Tempered' },
        { Mark: 'W-2', Width: '6\'-0"', Height: '5\'-0"', Type: 'Fixed', Glass: '1" IG Low-E', Frame: 'Aluminum', Qty: 8, Notes: '' },
        { Mark: 'W-3', Width: '3\'-0"', Height: '4\'-0"', Type: 'Operable', Glass: '1" IG Low-E', Frame: 'Aluminum', Qty: 6, Notes: 'Awning' },
        { Mark: 'W-4', Width: '8\'-0"', Height: '8\'-0"', Type: 'Storefront', Glass: '1" IG Low-E', Frame: 'Aluminum', Qty: 4, Notes: 'Main Entry' },
        { Mark: 'CW-1', Width: '20\'-0"', Height: '12\'-0"', Type: 'Curtain Wall', Glass: '1" IG Low-E', Frame: 'Aluminum', Qty: 2, Notes: 'Showroom' },
      ]
    },
    {
      id: 'door_schedule',
      name: 'Door Schedule',
      type: 'door',
      sheet: 'A8.2',
      columns: ['Mark', 'Width', 'Height', 'Material', 'Type', 'Hardware', 'Fire Rating', 'Qty'],
      data: [
        { Mark: 'D-1', Width: '3\'-0"', Height: '7\'-0"', Material: 'HM', Type: 'Single', Hardware: 'Set A', 'Fire Rating': '90 min', Qty: 4 },
        { Mark: 'D-2', Width: '6\'-0"', Height: '7\'-0"', Material: 'HM', Type: 'Double', Hardware: 'Set B', 'Fire Rating': '90 min', Qty: 2 },
        { Mark: 'D-3', Width: '3\'-6"', Height: '8\'-0"', Material: 'AL/GL', Type: 'Storefront', Hardware: 'Set C', 'Fire Rating': 'None', Qty: 3 },
        { Mark: 'D-4', Width: '8\'-0"', Height: '8\'-0"', Material: 'AL/GL', Type: 'Slider', Hardware: 'Set D', 'Fire Rating': 'None', Qty: 1 },
      ]
    },
    {
      id: 'hardware_schedule',
      name: 'Hardware Schedule',
      type: 'hardware',
      sheet: 'A8.3',
      columns: ['Set', 'Hinges', 'Lock', 'Closer', 'Panic', 'Stop', 'Threshold'],
      data: [
        { Set: 'A', Hinges: '4.5" x 4.5" BB', Lock: 'Mortise', Closer: 'LCN 4041', Panic: 'None', Stop: 'Floor', Threshold: 'Saddle' },
        { Set: 'B', Hinges: '4.5" x 4.5" BB', Lock: 'Mortise', Closer: 'LCN 4041', Panic: 'Von Duprin 99', Stop: 'Wall', Threshold: 'Saddle' },
        { Set: 'C', Hinges: 'Continuous', Lock: 'Adams Rite', Closer: 'Surface', Panic: 'None', Stop: 'None', Threshold: 'ADA' },
        { Set: 'D', Hinges: 'None', Lock: 'Adams Rite', Closer: 'None', Panic: 'None', Stop: 'None', Threshold: 'ADA' },
      ]
    }
  ], []);

  // Use provided schedules or sample data
  const allSchedules = schedules.length > 0 ? schedules : sampleSchedules;

  // Set initial active schedule
  React.useEffect(() => {
    if (!activeSchedule && allSchedules.length > 0) {
      setActiveSchedule(allSchedules[0].id);
    }
  }, [allSchedules, activeSchedule]);

  // Get current schedule
  const currentSchedule = useMemo(() => {
    return allSchedules.find(s => s.id === activeSchedule);
  }, [allSchedules, activeSchedule]);

  // Filter and sort data
  const processedData = useMemo(() => {
    if (!currentSchedule) return [];
    
    let data = [...currentSchedule.data];
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      data = data.filter(row => 
        Object.values(row).some(val => 
          String(val).toLowerCase().includes(query)
        )
      );
    }
    
    // Apply column filter
    if (filterColumn && filterValue) {
      data = data.filter(row => 
        String(row[filterColumn]).toLowerCase().includes(filterValue.toLowerCase())
      );
    }
    
    // Apply sorting
    if (sortColumn) {
      data.sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        
        // Handle numeric sorting
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);
        
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }
        
        // String sorting
        const comparison = String(aVal).localeCompare(String(bVal));
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }
    
    return data;
  }, [currentSchedule, searchQuery, filterColumn, filterValue, sortColumn, sortDirection]);

  // Handle column sort
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn]);

  // Copy cell value
  const copyCell = useCallback((value, cellId) => {
    navigator.clipboard.writeText(String(value));
    setCopiedCell(cellId);
    setTimeout(() => setCopiedCell(null), 1500);
  }, []);

  // Export to CSV
  const exportToCSV = useCallback(() => {
    if (!currentSchedule) return;
    
    const headers = currentSchedule.columns.join(',');
    const rows = processedData.map(row => 
      currentSchedule.columns.map(col => `"${row[col] || ''}"`).join(',')
    );
    
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSchedule.name.replace(/\s+/g, '_')}.csv`;
    a.click();
    
    URL.revokeObjectURL(url);
  }, [currentSchedule, processedData]);

  // Calculate totals for numeric columns
  const columnTotals = useMemo(() => {
    if (!currentSchedule) return {};
    
    const totals = {};
    currentSchedule.columns.forEach(col => {
      const numericValues = processedData
        .map(row => parseFloat(row[col]))
        .filter(v => !isNaN(v));
      
      if (numericValues.length > 0) {
        totals[col] = numericValues.reduce((a, b) => a + b, 0);
      }
    });
    
    return totals;
  }, [currentSchedule, processedData]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <Table2 size={22} color="#007BFF" />
            <h2 style={styles.title}>Schedule Viewer</h2>
            <span style={styles.projectName}>{project}</span>
          </div>
          <button style={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* Sidebar - Schedule List */}
          <div style={styles.sidebar}>
            <div style={styles.sidebarHeader}>
              <Layers size={16} />
              Schedules
            </div>
            <div style={styles.scheduleList}>
              {allSchedules.map(schedule => (
                <button
                  key={schedule.id}
                  style={{
                    ...styles.scheduleItem,
                    ...(activeSchedule === schedule.id ? styles.scheduleItemActive : {})
                  }}
                  onClick={() => setActiveSchedule(schedule.id)}
                >
                  <div style={styles.scheduleIcon}>
                    {schedule.type === 'window' ? '🪟' : 
                     schedule.type === 'door' ? '🚪' : 
                     schedule.type === 'hardware' ? '🔧' : '📋'}
                  </div>
                  <div style={styles.scheduleInfo}>
                    <div style={styles.scheduleName}>{schedule.name}</div>
                    <div style={styles.scheduleSheet}>Sheet: {schedule.sheet}</div>
                  </div>
                  <div style={styles.scheduleCount}>{schedule.data.length}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Main Content - Schedule Table */}
          <div style={styles.mainContent}>
            {/* Toolbar */}
            <div style={styles.toolbar}>
              <div style={styles.searchBox}>
                <Search size={16} color="#6b7280" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search schedule..."
                  style={styles.searchInput}
                />
              </div>
              
              {/* Column Filter */}
              {currentSchedule && (
                <div style={styles.filterGroup}>
                  <Filter size={14} color="#6b7280" />
                  <select
                    value={filterColumn || ''}
                    onChange={(e) => setFilterColumn(e.target.value || null)}
                    style={styles.filterSelect}
                  >
                    <option value="">Filter column...</option>
                    {currentSchedule.columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  {filterColumn && (
                    <input
                      type="text"
                      value={filterValue}
                      onChange={(e) => setFilterValue(e.target.value)}
                      placeholder="Filter value..."
                      style={styles.filterInput}
                    />
                  )}
                </div>
              )}
              
              <button style={styles.exportButton} onClick={exportToCSV}>
                <Download size={14} />
                Export CSV
              </button>
            </div>

            {/* Table */}
            <div style={styles.tableContainer}>
              {currentSchedule ? (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {currentSchedule.columns.map(col => (
                        <th 
                          key={col}
                          style={styles.th}
                          onClick={() => handleSort(col)}
                        >
                          <div style={styles.thContent}>
                            {col}
                            {sortColumn === col && (
                              sortDirection === 'asc' 
                                ? <SortAsc size={12} /> 
                                : <SortDesc size={12} />
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {processedData.map((row, rowIdx) => (
                      <tr key={rowIdx} style={styles.tr}>
                        {currentSchedule.columns.map((col, colIdx) => {
                          const cellId = `${rowIdx}-${colIdx}`;
                          return (
                            <td 
                              key={col}
                              style={styles.td}
                              onClick={() => copyCell(row[col], cellId)}
                              title="Click to copy"
                            >
                              <div style={styles.cellContent}>
                                {row[col]}
                                {copiedCell === cellId && (
                                  <Check size={12} color="#4ade80" />
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals row if applicable */}
                  {Object.keys(columnTotals).length > 0 && (
                    <tfoot>
                      <tr style={styles.totalsRow}>
                        {currentSchedule.columns.map(col => (
                          <td key={col} style={styles.totalsTd}>
                            {columnTotals[col] !== undefined ? (
                              <strong>{columnTotals[col]}</strong>
                            ) : null}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              ) : (
                <div style={styles.emptyState}>
                  <Table2 size={48} color="#4b5563" />
                  <p>No schedule selected</p>
                </div>
              )}
            </div>

            {/* Status Bar */}
            <div style={styles.statusBar}>
              <span>
                Showing {processedData.length} of {currentSchedule?.data.length || 0} items
              </span>
              {searchQuery && (
                <span style={styles.filterBadge}>
                  Filtered by: "{searchQuery}"
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#1c2128',
    borderRadius: '12px',
    width: '95vw',
    maxWidth: '1400px',
    height: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderBottom: '1px solid #2d333b',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#ffffff',
  },
  projectName: {
    fontSize: '13px',
    color: '#9ea7b3',
    padding: '4px 10px',
    backgroundColor: '#252526',
    borderRadius: '4px',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#9ea7b3',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '6px',
  },
  content: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  sidebar: {
    width: '260px',
    backgroundColor: '#252526',
    borderRight: '1px solid #2d333b',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '16px',
    borderBottom: '1px solid #2d333b',
    fontSize: '13px',
    fontWeight: 600,
    color: '#9ea7b3',
    textTransform: 'uppercase',
  },
  scheduleList: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  scheduleItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '12px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    textAlign: 'left',
    marginBottom: '4px',
    transition: 'background-color 0.15s',
  },
  scheduleItemActive: {
    backgroundColor: 'rgba(0, 123, 255, 0.15)',
  },
  scheduleIcon: {
    fontSize: '18px',
    width: '28px',
    textAlign: 'center',
  },
  scheduleInfo: {
    flex: 1,
    minWidth: 0,
  },
  scheduleName: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  scheduleSheet: {
    fontSize: '11px',
    color: '#6b7280',
  },
  scheduleCount: {
    padding: '2px 8px',
    backgroundColor: '#0b0e11',
    borderRadius: '10px',
    fontSize: '11px',
    color: '#9ea7b3',
    fontWeight: 600,
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderBottom: '1px solid #2d333b',
    backgroundColor: '#1c2128',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: '#0b0e11',
    borderRadius: '6px',
    border: '1px solid #2d333b',
    flex: 1,
    maxWidth: '300px',
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    color: '#ffffff',
    fontSize: '13px',
    outline: 'none',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  filterSelect: {
    padding: '8px 12px',
    backgroundColor: '#0b0e11',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '12px',
    cursor: 'pointer',
  },
  filterInput: {
    padding: '8px 12px',
    backgroundColor: '#0b0e11',
    border: '1px solid #2d333b',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '12px',
    width: '120px',
  },
  exportButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    backgroundColor: '#007BFF',
    border: 'none',
    borderRadius: '6px',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    marginLeft: 'auto',
  },
  tableContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '0 16px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    position: 'sticky',
    top: 0,
    backgroundColor: '#252526',
    padding: '12px 16px',
    textAlign: 'left',
    fontWeight: 600,
    color: '#9ea7b3',
    borderBottom: '2px solid #007BFF',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  thContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  tr: {
    borderBottom: '1px solid #2d333b',
  },
  td: {
    padding: '12px 16px',
    color: '#ffffff',
    cursor: 'pointer',
  },
  cellContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  totalsRow: {
    backgroundColor: '#252526',
  },
  totalsTd: {
    padding: '12px 16px',
    color: '#4ade80',
    fontWeight: 600,
    borderTop: '2px solid #4ade80',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#6b7280',
    gap: '12px',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 16px',
    borderTop: '1px solid #2d333b',
    fontSize: '12px',
    color: '#6b7280',
  },
  filterBadge: {
    padding: '4px 8px',
    backgroundColor: 'rgba(0, 123, 255, 0.15)',
    borderRadius: '4px',
    color: '#007BFF',
  },
};

export default ScheduleViewer;
