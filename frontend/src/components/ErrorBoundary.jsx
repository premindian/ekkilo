import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unknown error' };
  }

  componentDidCatch(error, info) {
    console.error('UI crash:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f3f4f6' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 420, textAlign: 'center' }}>
            <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
            <p style={{ color: '#666', fontSize: 14 }}>{this.state.message}</p>
            <button
              onClick={() => {
                localStorage.removeItem('ekkilo_token');
                localStorage.removeItem('ekkilo_user');
                window.location.href = '/';
              }}
              style={{
                marginTop: 12,
                background: '#667eea',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                cursor: 'pointer',
              }}
            >
              Reset & go home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
