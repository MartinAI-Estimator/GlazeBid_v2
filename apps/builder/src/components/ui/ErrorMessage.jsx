import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';

/**
 * Reusable Error Message Component
 * Provides consistent error display with retry/dismiss options
 */
const ErrorMessage = ({ 
  message, 
  title = 'Error',
  onRetry = null, 
  onDismiss = null,
  type = 'error', // 'error', 'warning', 'info'
  style = {} 
}) => {
  const colorMap = {
    error: { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', text: '#fca5a5', icon: '#ef4444' },
    warning: { bg: 'rgba(251, 191, 36, 0.1)', border: '#fbbf24', text: '#fde68a', icon: '#fbbf24' },
    info: { bg: 'rgba(99, 179, 237, 0.1)', border: '#63b3ed', text: '#90cdf4', icon: '#63b3ed' }
  };
  
  const colors = colorMap[type] || colorMap.error;

  const styles = {
    container: {
      backgroundColor: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: '8px',
      padding: '16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      ...style
    },
    icon: {
      flexShrink: 0,
      marginTop: '2px'
    },
    content: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    },
    title: {
      color: colors.text,
      fontWeight: 600,
      fontSize: '14px',
      margin: 0
    },
    message: {
      color: '#a0aec0',
      fontSize: '13px',
      margin: 0,
      lineHeight: 1.5
    },
    actions: {
      display: 'flex',
      gap: '8px',
      marginTop: '8px'
    },
    button: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '6px 12px',
      borderRadius: '4px',
      border: 'none',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 500,
      transition: 'all 0.2s'
    },
    retryButton: {
      backgroundColor: colors.border,
      color: '#1a202c'
    },
    dismissButton: {
      backgroundColor: 'transparent',
      border: `1px solid ${colors.border}`,
      color: colors.text
    }
  };

  return (
    <div style={styles.container}>
      <AlertCircle style={styles.icon} size={20} color={colors.icon} />
      <div style={styles.content}>
        <h4 style={styles.title}>{title}</h4>
        <p style={styles.message}>{message}</p>
        {(onRetry || onDismiss) && (
          <div style={styles.actions}>
            {onRetry && (
              <button 
                style={{ ...styles.button, ...styles.retryButton }}
                onClick={onRetry}
              >
                <RefreshCw size={14} />
                Retry
              </button>
            )}
            {onDismiss && (
              <button 
                style={{ ...styles.button, ...styles.dismissButton }}
                onClick={onDismiss}
              >
                <X size={14} />
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ErrorMessage;
