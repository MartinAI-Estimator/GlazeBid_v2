import React from 'react';

const StatusChip = ({ status, animated = false }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'scanning':
        return {
          label: 'AI Scanning...',
          color: '#007BFF',
          bgColor: 'rgba(0, 123, 255, 0.15)',
          animated: true
        };
      case 'drafting':
        return {
          label: 'Drafting',
          color: '#f59e0b',
          bgColor: 'rgba(245, 158, 11, 0.15)',
          animated: false
        };
      case 'completed':
        return {
          label: 'Completed',
          color: '#10b981',
          bgColor: 'rgba(16, 185, 129, 0.15)',
          animated: false
        };
      case 'in_progress':
        return {
          label: 'In Progress',
          color: '#3b82f6',
          bgColor: 'rgba(59, 130, 246, 0.15)',
          animated: false
        };
      default:
        return {
          label: 'New',
          color: '#6b7280',
          bgColor: 'rgba(107, 116, 128, 0.15)',
          animated: false
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      borderRadius: '12px',
      backgroundColor: config.bgColor,
      border: `1px solid ${config.color}40`,
      fontSize: '11px',
      fontWeight: '600',
      color: config.color,
      fontFamily: 'Inter, sans-serif',
      letterSpacing: '0.3px'
    }}>
      {config.animated && (
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: config.color,
          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
        }} />
      )}
      {config.label}
    </div>
  );
};

// Add pulse animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
`;
if (typeof document !== 'undefined' && !document.getElementById('status-chip-animations')) {
  styleSheet.id = 'status-chip-animations';
  document.head.appendChild(styleSheet);
}

export default StatusChip;
