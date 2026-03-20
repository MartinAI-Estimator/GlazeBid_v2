import React from 'react';

/**
 * Reusable Loading Spinner Component
 * Provides consistent loading indicators across the app
 */
const LoadingSpinner = ({ 
  size = 'medium', // 'small', 'medium', 'large'
  message = 'Loading...', 
  overlay = false,
  style = {} 
}) => {
  const sizeMap = {
    small: { spinner: 16, border: 2 },
    medium: { spinner: 32, border: 3 },
    large: { spinner: 48, border: 4 }
  };
  
  const { spinner: spinnerSize, border: borderWidth } = sizeMap[size] || sizeMap.medium;

  const spinnerStyles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      padding: '20px',
      ...style
    },
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(26, 32, 44, 0.9)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      gap: '12px'
    },
    spinner: {
      width: `${spinnerSize}px`,
      height: `${spinnerSize}px`,
      border: `${borderWidth}px solid rgba(99, 179, 237, 0.3)`,
      borderTopColor: '#63b3ed',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    },
    message: {
      color: '#a0aec0',
      fontSize: size === 'small' ? '12px' : '14px',
      fontWeight: 500
    }
  };

  const content = (
    <>
      <div style={spinnerStyles.spinner} />
      {message && <p style={spinnerStyles.message}>{message}</p>}
    </>
  );

  if (overlay) {
    return <div style={spinnerStyles.overlay}>{content}</div>;
  }

  return <div style={spinnerStyles.container}>{content}</div>;
};

// Add keyframes via style injection
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
if (!document.head.querySelector('style[data-loading-spinner]')) {
  styleSheet.setAttribute('data-loading-spinner', 'true');
  document.head.appendChild(styleSheet);
}

export default LoadingSpinner;
