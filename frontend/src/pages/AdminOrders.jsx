import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

export default function AdminOrders() {
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      loadOrders();
    }
  }, [token, filter]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const url = filter === 'ALL'
        ? `${API_BASE}/api/admin/orders?token=${token}`
        : `${API_BASE}/api/admin/orders?token=${token}&status=${filter}`;
      
      const res = await fetch(url);
      const data = await res.json();
      setOrders(data);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>📋 Order Management</h1>
          <p style={styles.subtitle}>{orders.length} orders</p>
        </div>
        <button onClick={() => window.location.href = '/admin'} style={styles.backBtn}>
          ← Back
        </button>
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        {['ALL', 'PENDING', 'ACCEPTED', 'READY', 'COMPLETED', 'REJECTED'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={filter === f ? styles.filterActive : styles.filterBtn}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Orders List */}
      {loading ? (
        <div style={styles.loading}>🔄 Loading...</div>
      ) : orders.length === 0 ? (
        <div style={styles.empty}>No orders found</div>
      ) : (
        <div style={styles.ordersList}>
          {orders.map(order => (
            <div key={order.id} style={styles.orderCard}>
              <div style={styles.orderHeader}>
                <div style={styles.orderInfo}>
                  <h3 style={styles.orderId}>Order #{order.id}</h3>
                  <p style={styles.orderPhone}>📞 {order.customer_phone}</p>
                  <p style={styles.orderTime}>
                    🕐 {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
                <div style={styles.orderAmount}>
                  ₹{parseFloat(order.total_amount || 0).toFixed(2)}
                </div>
              </div>

              <div style={styles.orderStats}>
                <div style={styles.stat}>
                  <span style={styles.statLabel}>Stores:</span>
                  <span style={styles.statValue}>{order.store_count || 0}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 1200,
    margin: 'auto',
    padding: 20,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    paddingBottom: 80,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  subtitle: {
    margin: '4px 0 0 0',
    fontSize: 14,
    color: '#6b7280',
  },
  backBtn: {
    padding: '10px 20px',
    background: '#f3f4f6',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  filters: {
    display: 'flex',
    gap: 8,
    marginBottom: 20,
    overflowX: 'auto',
    paddingBottom: 8,
  },
  filterBtn: {
    padding: '8px 16px',
    background: '#f3f4f6',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  filterActive: {
    padding: '8px 16px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  loading: {
    textAlign: 'center',
    padding: 60,
    color: '#666',
  },
  empty: {
    textAlign: 'center',
    padding: 60,
    color: '#999',
  },
  ordersList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  orderCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 20,
  },
  orderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  orderInfo: {
    flex: 1,
  },
  orderId: {
    margin: '0 0 8px 0',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  orderPhone: {
    margin: '0 0 4px 0',
    fontSize: 14,
    color: '#6b7280',
  },
  orderTime: {
    margin: 0,
    fontSize: 13,
    color: '#9ca3af',
  },
  orderAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#22c55e',
  },
  orderStats: {
    display: 'flex',
    gap: 16,
    paddingTop: 16,
    borderTop: '1px solid #f3f4f6',
  },
  stat: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
};
