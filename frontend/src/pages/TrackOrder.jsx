import { useState, useEffect } from 'react';
import { navigate } from '../utils/navigate';

const API_BASE = "";

function formatApiError(detail, fallback = 'Order not found') {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === 'string' ? d : d?.msg || d?.message))
      .filter(Boolean)
      .join(', ') || fallback;
  }
  if (typeof detail === 'object') {
    return detail.msg || detail.message || JSON.stringify(detail);
  }
  return String(detail);
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

export default function TrackOrder() {
  const params = new URLSearchParams(window.location.search);
  // Support both ?order_id=5 and legacy ?order=5 (WhatsApp links)
  const initialId = params.get('order_id') || params.get('order') || '';
  const [orderId, setOrderId] = useState(initialId);
  const [orderDetails, setOrderDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const trackOrder = async (idOverride) => {
    const id = String(idOverride || orderId || '').trim();
    if (!id) {
      setError('Please enter an order ID');
      return;
    }

    setLoading(true);
    setError('');
    setOrderDetails(null);

    try {
      const res = await fetch(`${API_BASE}/api/orders/track?order_id=${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(formatApiError(data.detail || data.error));
      }

      setOrderDetails(data);
      // Keep URL shareable with the canonical param
      if (!params.get('order_id')) {
        window.history.replaceState({}, '', `/track?order_id=${id}`);
      }
    } catch (err) {
      setError(formatApiError(err?.message, 'Failed to track order'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialId) {
      trackOrder(initialId);
    }
  }, []);

  const getOrderStatusIcon = (status) => {
    const icons = {
      'CREATED': '📝',
      'CONFIRMED': '✅',
      'ACCEPTED': '👍',
      'PROCESSING': '🔄',
      'PARTIAL': '⚠️',
      'PARTIAL_READY': '🟡',
      'READY': '📦',
      'COMPLETED': '✓',
      'REJECTED': '🚫',
      'CANCELLED': '❌'
    };
    return icons[status] || '🔄';
  };

  const getStoreStatusColor = (status) => {
    const colors = {
      'PENDING': '#fbbf24',
      'ACCEPTED': '#22c55e',
      'READY': '#3b82f6',
      'COMPLETED': '#10b981',
      'REJECTED': '#ef4444',
      'CANCELLED': '#ef4444'
    };
    return colors[status] || '#9ca3af';
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>🛒 Smart Kirana</div>
        <button onClick={() => navigate('/')} style={styles.homeBtn}>
          Home
        </button>
      </div>

      {/* Track Order Form */}
      <div style={styles.trackCard}>
        <h1 style={styles.title}>📦 Track Your Order</h1>
        <p style={styles.subtitle}>Enter your order ID to track status</p>

        <div style={styles.inputGroup}>
          <input
            type="number"
            placeholder="Enter Order ID (e.g. 123)"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && trackOrder()}
            style={styles.input}
          />
          <button 
            onClick={trackOrder}
            disabled={loading}
            style={styles.trackBtn}
          >
            {loading ? '🔄 Tracking...' : '🔍 Track'}
          </button>
        </div>

        {error && (
          <div style={styles.error}>{error}</div>
        )}
      </div>

      {/* Order Details */}
      {orderDetails && (
        <div style={styles.detailsCard}>
          {/* Order Header */}
          <div style={styles.orderHeader}>
            <div>
              <h2 style={styles.orderTitle}>
                {getOrderStatusIcon(orderDetails.order_status)} Order #{orderDetails.id}
              </h2>
              <p style={styles.orderMeta}>
                📞 {orderDetails.customer_phone} | 
                🕐 {new Date(orderDetails.created_at).toLocaleString()}
              </p>
            </div>
            <div style={styles.statusBadge}>
              {orderDetails.order_status}
            </div>
          </div>

          {/* Progress Bar */}
          <div style={styles.progressSection}>
            <h3 style={styles.sectionTitle}>Order Progress</h3>
            <div style={styles.progressBar}>
              <div 
                style={{
                  ...styles.progressFill,
                  width: `${(orderDetails.ready_count / orderDetails.store_count) * 100}%`
                }}
              />
            </div>
            <p style={styles.progressText}>
              {orderDetails.ready_count} of {orderDetails.store_count} stores ready
            </p>
          </div>

          {/* Stores */}
          <div style={styles.storesSection}>
            <h3 style={styles.sectionTitle}>Stores ({orderDetails.stores.length})</h3>
            {orderDetails.stores.map((store) => (
              <div key={store.id} style={styles.storeCard}>
                <div style={styles.storeHeader}>
                  <div>
                    <div style={styles.storeName}>🏪 {store.store_name}</div>
                    <div style={styles.storeMeta}>📞 {store.store_phone}</div>
                  </div>
                  <div 
                    style={{
                      ...styles.storeStatus,
                      background: getStoreStatusColor(store.status)
                    }}
                  >
                    {store.status}
                  </div>
                </div>

                {/* Items */}
                <div style={styles.itemsList}>
                  <strong>Items:</strong>
                  {(store.items || []).map((item, i) => (
                    <div key={i} style={styles.item}>
                      • {item.product_name} × {item.quantity} - ₹{money(item.price)}
                    </div>
                  ))}
                </div>

                {Number(store.total_amount) > 0 && (
                  <div style={styles.storeTotal}>
                    Total: ₹{money(store.total_amount)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Total */}
          {Number(orderDetails.total_amount) > 0 && (
            <div style={styles.totalSection}>
              <div style={styles.totalLabel}>Order Total:</div>
              <div style={styles.totalAmount}>₹{money(orderDetails.total_amount)}</div>
            </div>
          )}

          {/* Instructions */}
          <div style={styles.instructions}>
            <p>💬 <strong>WhatsApp Commands:</strong></p>
            <p>• Reply <code>STATUS#{orderDetails.id}</code> to check status</p>
            <p>• Reply <code>CANCEL#{orderDetails.id}</code> to cancel order</p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={styles.footer}>
        <p>Need help? Contact us on WhatsApp</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
  },
  header: {
    maxWidth: '800px',
    margin: '0 auto 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: 'white',
  },
  homeBtn: {
    padding: '8px 16px',
    background: 'rgba(255,255,255,0.2)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  trackCard: {
    maxWidth: '600px',
    margin: '0 auto 30px',
    background: 'white',
    borderRadius: '16px',
    padding: '40px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    textAlign: 'center',
    margin: '0 0 10px 0',
  },
  subtitle: {
    textAlign: 'center',
    color: '#666',
    marginBottom: '30px',
  },
  inputGroup: {
    display: 'flex',
    gap: '10px',
  },
  input: {
    flex: 1,
    padding: '14px',
    border: '2px solid #e5e7eb',
    borderRadius: '12px',
    fontSize: '16px',
  },
  trackBtn: {
    padding: '14px 28px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  error: {
    marginTop: '15px',
    padding: '12px',
    background: '#fee2e2',
    color: '#dc2626',
    borderRadius: '8px',
    textAlign: 'center',
  },
  detailsCard: {
    maxWidth: '800px',
    margin: '0 auto',
    background: 'white',
    borderRadius: '16px',
    padding: '30px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
  },
  orderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '30px',
    paddingBottom: '20px',
    borderBottom: '2px solid #f3f4f6',
  },
  orderTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '0 0 8px 0',
  },
  orderMeta: {
    color: '#666',
    margin: 0,
  },
  statusBadge: {
    padding: '8px 16px',
    background: '#667eea',
    color: 'white',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: '600',
  },
  progressSection: {
    marginBottom: '30px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '15px',
  },
  progressBar: {
    height: '12px',
    background: '#e5e7eb',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #667eea, #764ba2)',
    transition: 'width 0.3s ease',
  },
  progressText: {
    textAlign: 'center',
    color: '#666',
    marginTop: '8px',
    fontSize: '14px',
  },
  storesSection: {
    marginBottom: '30px',
  },
  storeCard: {
    background: '#f9fafb',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '15px',
  },
  storeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '15px',
  },
  storeName: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '5px',
  },
  storeMeta: {
    fontSize: '14px',
    color: '#666',
  },
  storeStatus: {
    padding: '6px 12px',
    color: 'white',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
  },
  itemsList: {
    fontSize: '14px',
    lineHeight: '1.8',
  },
  item: {
    marginLeft: '10px',
  },
  storeTotal: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #e5e7eb',
    fontWeight: '600',
    textAlign: 'right',
  },
  totalSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    background: '#f0f9ff',
    borderRadius: '12px',
    marginBottom: '20px',
  },
  totalLabel: {
    fontSize: '18px',
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#667eea',
  },
  instructions: {
    padding: '20px',
    background: '#fef3c7',
    borderRadius: '12px',
    fontSize: '14px',
    lineHeight: '1.8',
  },
  footer: {
    maxWidth: '800px',
    margin: '30px auto 0',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '14px',
  },
};
