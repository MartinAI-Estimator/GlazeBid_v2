import React from 'react';
import { Square, MousePointer2 } from 'lucide-react';

const SystemLegend = ({ systems, activeSystem, onSystemSelect }) => {
  return (
    <div style={styles.container}>
      <div style={styles.header}>SYSTEM LEGEND</div>
      
      <div style={styles.list}>
        {(systems || []).map((sys) => (
          <div 
            key={sys.id} 
            onClick={() => onSystemSelect(sys)}
            style={{
              ...styles.systemItem,
              borderLeft: activeSystem?.id === sys.id ? `4px solid ${sys.color}` : '4px solid transparent',
              background: activeSystem?.id === sys.id ? '#252525' : 'transparent'
            }}
          >
            <Square size={16} fill={sys.color} color={sys.color} style={{ marginRight: '10px' }} />
            <div style={styles.info}>
              <span style={styles.label}>{sys.name}</span>
              <span style={styles.subLabel}>{sys.description}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.footer}>
        <MousePointer2 size={14} style={{ marginRight: '8px' }} />
        Select System to Begin Counting
      </div>
    </div>
  );
};

const styles = {
  container: { width: '240px', background: '#111', borderLeft: '1px solid #222', display: 'flex', flexDirection: 'column' },
  header: { padding: '15px', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', color: '#555', borderBottom: '1px solid #222' },
  list: { flexGrow: 1, padding: '10px 0' },
  systemItem: { padding: '12px 15px', display: 'flex', alignItems: 'center', cursor: 'pointer', transition: '0.2s' },
  info: { display: 'flex', flexDirection: 'column' },
  label: { fontSize: '13px', color: '#ddd', fontWeight: '500' },
  subLabel: { fontSize: '10px', color: '#666' },
  footer: { padding: '15px', borderTop: '1px solid #222', fontSize: '11px', color: '#444', display: 'flex', alignItems: 'center' }
};

export default SystemLegend;