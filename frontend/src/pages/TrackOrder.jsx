import { useState, useEffect } from 'react';
import { navigate } from '../utils/navigate';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../components/BrandLogo';

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
  const { user, token, loading: authLoading } = useAuth();
  const params = new URLSearchParams(window.location.search);
  // Private WhatsApp/share links use ?t=...; logged-in users may use ?order_id=
  const initialToken = params.get('t') || '';
  const initialId = params.get('order_id') || params.get('order') || '';
  const justPaid = params.get('paid') === '1';
  const [orderId, setOrderId] = useState(initialId);
  const [orderDetails, setOrderDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundMsg, setRefundMsg] = useState('');
  const [showPaidBanner, setShowPaidBanner] = useState(justPaid);

  const fetchTrack = async ({ trackToken, id } = {}) => {
    const qs = new URLSearchParams();
    if (trackToken) {
      qs.set('t', trackToken);
    } else if (id) {
      qs.set('order_id', String(id));
      if (!token) {
        setError('Please log in to track by order ID, or open the private link from WhatsApp.');
        return;
      }
      qs.set('token', token);
    } else {
      setError('Please enter an order ID');
      return;
    }

    setLoading(true);
    setError('');
    setOrderDetails(null);

    try {
      const res = await fetch(`${API_BASE}/api/orders/track?${qs.toString()}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(formatApiError(data.detail || data.error));
      }

      setOrderDetails(data);
      if (trackToken && !params.get('t')) {
        window.history.replaceState({}, '', `/track?t=${encodeURIComponent(trackToken)}`);
      } else if (id && token && !params.get('t')) {
        window.history.replaceState({}, '', `/track?order_id=${id}`);
      }
    } catch (err) {
      setError(formatApiError(err?.message, 'Failed to track order'));
    } finally {
      setLoading(false);
    }
  };

  const trackOrder = async (idOverride) => {
    const raw =
      idOverride != null && (typeof idOverride === 'string' || typeof idOverride === 'number')
        ? idOverride
        : orderId;
    const id = String(raw ?? '').trim();
    if (!id) {
      setError('Please enter an order ID');
      return;
    }
    if (!/^\d+$/.test(id)) {
      setError('Order ID must be a number');
      return;
    }
    await fetchTrack({ id });
  };

  const requestRefund = async () => {
    if (!token || !orderDetails?.id) {
      setRefundMsg('Log in to request a refund for this order.');
      return;
    }
    setRefundBusy(true);
    setRefundMsg('');
    try {
      const res = await fetch(
        `${API_BASE}/api/orders/${orderDetails.id}/refund-request?token=${encodeURIComponent(token)}`,
        { method: 'POST' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(formatApiError(data.detail || data.error, 'Could not request refund'));
      }
      setRefundMsg(data.message || 'Refund requested.');
      await fetchTrack({
        trackToken: params.get('t') || undefined,
        id: orderDetails.id,
      });
    } catch (err) {
      setRefundMsg(formatApiError(err?.message, 'Could not request refund'));
    } finally {
      setRefundBusy(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (initialToken) {
      fetchTrack({ trackToken: initialToken });
    } else if (initialId && token) {
      fetchTrack({ id: initialId });
    } else if (initialId && !token) {
      setError('Please log in to track by order ID, or open the private link from WhatsApp.');
    }
  }, [authLoading, token]);

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
      'NO_SHOW': '👻',
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
      'NO_SHOW': '#f59e0b',
      'REJECTED': '#ef4444',
      'CANCELLED': '#ef4444'
    };
    return colors[status] || '#9ca3af';
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>
          <BrandLogo height={36} alt="Ekkilo" />
        </div>
        <button onClick={() => navigate('/')} style={styles.homeBtn}>
          Home
        </button>
      </div>

      {showPaidBanner && (
        <div
          style={{
            margin: '12px 16px 0',
            padding: '12px 14px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: 12,
            color: '#065f46',
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          ✅ Payment confirmed. Stores have been notified — show this screen at pickup.
          <button
            type="button"
            onClick={() => setShowPaidBanner(false)}
            style={{
              float: 'right',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: 800,
              color: '#047857',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Track Order Form */}
      <div style={styles.trackCard}>
        <h1 style={styles.title}>📦 Track Your Order</h1>
        <p style={styles.subtitle}>
          {user
            ? 'Enter your order ID (only your orders are shown)'
            : 'Open the private Track link from WhatsApp, or log in to track by order ID'}
        </p>

        {!user && !initialToken && (
          <button
            onClick={() => navigate('/')}
            style={{ ...styles.trackBtn, width: '100%', marginBottom: '16px' }}
          >
            Log in to track by order ID
          </button>
        )}

        <div style={styles.inputGroup}>
          <input
            type="number"
            placeholder="Enter Order ID (e.g. 123)"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && trackOrder()}
            style={styles.input}
            disabled={!user && !token}
          />
          <button
            onClick={() => trackOrder()}
            disabled={loading || (!user && !token)}
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
              {(orderDetails.payment_method || orderDetails.payment_status) && (
                <p style={{ ...styles.orderMeta, marginTop: 4 }}>
                  {(orderDetails.payment_method === 'pay_at_store' ||
                    orderDetails.payment_status === 'PAY_AT_STORE')
                    ? '💵 Pay at store on pickup'
                    : orderDetails.payment_status === 'PAID'
                    ? '✅ Paid online'
                    : orderDetails.payment_status === 'PENDING' ||
                      orderDetails.order_status === 'PENDING_PAYMENT'
                    ? '⏳ UPI payment pending — stores not notified yet'
                    : `Payment: ${orderDetails.payment_status || orderDetails.payment_method}`}
                </p>
              )}
            </div>
            <div style={styles.statusBadge}>
              {orderDetails.order_status}
            </div>
          </div>

          {(orderDetails.payment_status === 'PENDING' ||
            orderDetails.order_status === 'PENDING_PAYMENT') && (
            <div style={{
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              borderRadius: 12,
              padding: 14,
              marginBottom: 20,
              color: '#9a3412',
              fontSize: 14,
              lineHeight: 1.45,
            }}>
              <strong>Payment not completed.</strong> Kiranas have not been notified.
              Place the order again from Prices and finish UPI, or choose Pay at store.
            </div>
          )}

          {orderDetails.payment_status === 'PAID' &&
            !['CANCELLED', 'REJECTED'].includes((orderDetails.order_status || '').toUpperCase()) && (
            <div style={{
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: 12,
              padding: 14,
              marginBottom: 20,
              color: '#065f46',
              fontSize: 14,
              lineHeight: 1.45,
            }}>
              <strong>Paid online.</strong> Don’t pay the kirana again — Ekkilo settles with stores.
              Cancel before Ready and contact Ekkilo for a UPI refund.
            </div>
          )}

          {['CANCELLED', 'REJECTED'].includes((orderDetails.order_status || '').toUpperCase()) &&
            orderDetails.payment_status === 'PAID' && (
            <div style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 12,
              padding: 14,
              marginBottom: 20,
              color: '#1e3a8a',
              fontSize: 14,
              lineHeight: 1.45,
            }}>
              {orderDetails.refund_request ? (
                <>
                  <strong>Refund requested.</strong> Status: {orderDetails.refund_request.status}.
                  Ekkilo processes UPI refunds manually (not instant).
                </>
              ) : (
                <>
                  <strong>Order cancelled after UPI.</strong> Tap below to request your refund —
                  processed manually by Ekkilo (not instant auto-refund).
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={requestRefund}
                      disabled={refundBusy || !token}
                      style={{
                        background: '#2563eb',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '10px 14px',
                        fontWeight: 700,
                        cursor: refundBusy ? 'wait' : 'pointer',
                      }}
                    >
                      {refundBusy ? 'Requesting…' : 'Request UPI refund'}
                    </button>
                  </div>
                </>
              )}
              {refundMsg && (
                <div style={{ marginTop: 8, fontSize: 13 }}>{refundMsg}</div>
              )}
            </div>
          )}

          {/* Progress Bar */}
          <div style={styles.progressSection}>
            <h3 style={styles.sectionTitle}>Order Progress</h3>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${orderDetails.store_count
                    ? (orderDetails.ready_count / orderDetails.store_count) * 100
                    : 0}%`
                }}
              />
            </div>
            <p style={styles.progressText}>
              {orderDetails.ready_count} of {orderDetails.store_count} stores ready
            </p>
          </div>

          {orderDetails.has_delay && (
            <div style={{
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              borderRadius: 12,
              padding: 14,
              marginBottom: 20,
              color: '#9a3412',
              fontSize: 14,
            }}>
              ⏳ A store is taking longer than expected. We’ll notify you on WhatsApp when ready.
            </div>
          )}

          {/* Stores */}
          <div style={styles.storesSection}>
            <h3 style={styles.sectionTitle}>Stores ({orderDetails.stores.length})</h3>
            {orderDetails.stores.map((store) => (
              <div key={store.id} style={styles.storeCard}>
                <div style={styles.storeHeader}>
                  <div>
                    <div style={styles.storeName}>🏪 {store.store_name}</div>
                    <div style={styles.storeMeta}>📞 {store.store_phone}</div>
                    {(store.fulfillment === 'delivery' || store.delivery_fee > 0) && (
                      <div style={{ ...styles.storeMeta, marginTop: 4, color: '#166534', fontWeight: 600 }}>
                        {store.fulfillment === 'delivery'
                          ? (Number(store.delivery_fee) > 0
                              ? `🚚 Store delivery · ₹${money(store.delivery_fee)}`
                              : '🚚 Store delivery · Free')
                          : '🏪 Pickup'}
                        {store.delivery_note ? ` · ${store.delivery_note}` : ''}
                      </div>
                    )}
                    {store.fulfillment === 'pickup' && !store.delivery_fee && (
                      <div style={{ ...styles.storeMeta, marginTop: 4 }}>🏪 Pickup</div>
                    )}
                    {store.status === 'ACCEPTED' && (
                      <div style={{ ...styles.storeMeta, marginTop: 6, color: store.is_delayed ? '#c2410c' : '#4b5563' }}>
                        {store.is_delayed
                          ? `⏳ Delayed — packing for ${store.preparing_minutes ?? '?'} min`
                          : store.ready_by
                            ? `⏳ Expected ready by ${new Date(store.ready_by).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                            : store.preparing_minutes != null
                              ? `🔄 Preparing — ${store.preparing_minutes} min so far`
                              : '🔄 Preparing'}
                        {store.eta_minutes ? ` (ETA ${store.eta_minutes} min)` : ''}
                        {store.delay_note ? ` — ${store.delay_note}` : ''}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      ...styles.storeStatus,
                      background: store.is_delayed ? '#f97316' : getStoreStatusColor(store.status)
                    }}
                  >
                    {store.is_delayed ? 'DELAYED' : store.status}
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
    lineHeight: 0,
    background: 'rgba(255,255,255,0.95)',
    borderRadius: 10,
    padding: '6px 10px',
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
