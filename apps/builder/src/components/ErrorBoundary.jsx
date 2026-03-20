import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    // Keep stack visibility in devtools/electron console for debugging.
    console.error('GlazeBid renderer error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.page}>
          <div style={styles.card}>
            <h1 style={styles.title}>GlazeBid hit a runtime error</h1>
            <p style={styles.text}>
              The app failed while rendering. Please reload the app.
            </p>
            <pre style={styles.error}>
              {String(this.state.error?.message || this.state.error || 'Unknown error')}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: '#2d333b',
    color: '#eef2f7',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  },
  card: {
    width: '100%',
    maxWidth: '760px',
    background: '#36404b',
    border: '1px solid #596878',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.22)',
  },
  title: {
    margin: '0 0 10px 0',
    fontSize: '24px',
    fontWeight: 700,
  },
  text: {
    margin: '0 0 16px 0',
    color: '#c4cfdb',
  },
  error: {
    margin: 0,
    maxHeight: '260px',
    overflow: 'auto',
    padding: '12px',
    background: '#222a33',
    border: '1px solid #596878',
    borderRadius: '8px',
    color: '#f0f4fa',
    fontSize: '12px',
    lineHeight: 1.5,
  },
};

export default ErrorBoundary;
