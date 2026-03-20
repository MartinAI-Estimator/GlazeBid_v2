import React, { useState, useEffect } from 'react';
import { TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';

const StatsRibbon = () => {
  const [stats, setStats] = useState({
    totalTakeoff: 0,
    activeRFIs: 0,
    systemHealth: 'checking'
  });

  useEffect(() => {
    fetchStats();
    // Check system health every 30 seconds
    const interval = setInterval(checkSystemHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    // No backend — stats derive from local bid store
    await checkSystemHealth();
  };

  const checkSystemHealth = async () => {
    // Running in local Electron mode — always healthy
    setStats(prev => ({ ...prev, systemHealth: 'healthy' }));
  };

  return (
    <div style={styles.ribbon}>
      <div style={styles.statItem}>
        <TrendingUp size={16} color="#007BFF" />
        <div style={styles.statContent}>
          <span style={styles.statLabel}>Total Takeoff</span>
          <span style={styles.statValue}>{stats.totalTakeoff.toLocaleString()} SF</span>
        </div>
      </div>
      
      <div style={styles.divider} />
      
      <div style={styles.statItem}>
        <AlertCircle size={16} color={stats.activeRFIs > 0 ? '#f59e0b' : '#6b7280'} />
        <div style={styles.statContent}>
          <span style={styles.statLabel}>Active RFIs</span>
          <span style={styles.statValue}>{stats.activeRFIs}</span>
        </div>
      </div>
      
      <div style={styles.divider} />
      
      <div style={styles.statItem}>
        {stats.systemHealth === 'healthy' ? (
          <CheckCircle size={16} color="#10b981" />
        ) : stats.systemHealth === 'checking' ? (
          <div style={styles.spinner} />
        ) : (
          <AlertCircle size={16} color="#ef4444" />
        )}
        <div style={styles.statContent}>
          <span style={styles.statLabel}>System Status</span>
          <span style={{...styles.statValue, color: stats.systemHealth === 'healthy' ? '#10b981' : '#ef4444'}}>
            {stats.systemHealth === 'healthy' ? 'Online' : stats.systemHealth === 'checking' ? 'Checking...' : 'Offline'}
          </span>
        </div>
      </div>
    </div>
  );
};

const styles = {
  ribbon: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    padding: '12px 24px',
    backgroundColor: '#0d1117',
    borderTop: '1px solid #2d333b',
    borderBottom: '1px solid #2d333b',
    fontFamily: 'Inter, sans-serif',
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  statContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  statLabel: {
    fontSize: '11px',
    color: '#9ca3af',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statValue: {
    fontSize: '16px',
    color: '#ffffff',
    fontWeight: '600',
  },
  divider: {
    width: '1px',
    height: '32px',
    backgroundColor: '#2d333b',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid #2d333b',
    borderTop: '2px solid #007BFF',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

export default StatsRibbon;
