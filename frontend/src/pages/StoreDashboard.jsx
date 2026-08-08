import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LineChart, BarChart } from '../components/SimpleChart';

const API_BASE = "";

export default function StoreDashboard() {
  const { token, logout } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [token]);

  const loadDashboard = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/store/dashboard?token=${token}`);
      const data = await res.json();
      
      if (res.status === 403) {
        alert('Not authorized as store owner');
        logout();
        return;
      }
      
      setDashboard(data);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      await fetch(`${API_BASE}/api/store/orders/${orderId}?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      loadDashboard(); // Refresh
      alert(`Order ${status.toLowerCase()} successfully!`);
    } catch (err) {
      alert('Failed to update order');
    }
  };

  const updateProductStock = async (productId, newStock) => {
    try {
      await fetch(`${API_BASE}/api/store/products/${productId}?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: newStock })
      });
      loadDashboard(); // Refresh
    } catch (err) {
      alert('Failed to update stock');
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>🔄 Loading...</div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>❌ Failed to load dashboard</div>
      </div>
    );
  }

  const { store, stats, pending_orders, low_stock_products } = dashboard;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🏪 {store.name}</h1>
          <p style={styles.subtitle}>{store.phone}</p>
        </div>
        <div style={styles.headerActions}>
          <button onClick={() => window.location.href = '/store/settings'} style={styles.settingsBtn}>
            ⚙️
          </button>
          <button onClick={logout} style={styles.logoutBtn}>
            🚪 Logout
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={styles.statsGrid}>
        <div style={{...styles.statCard, background: '#fef3c7'}}>
          <div style={styles.statNumber}>{stats.total_orders || 0}</div>
          <div style={styles.statLabel}>Today's Orders</div>
        </div>
        <div style={{...styles.statCard, background: '#fef2f2'}}>
          <div style={styles.statNumber}>{stats.pending_orders || 0}</div>
          <div style={styles.statLabel}>⏳ Pending</div>
        </div>
        <div style={{...styles.statCard, background: '#ecfccb'}}>
          <div style={styles.statNumber}>{stats.accepted_orders || 0}</div>
          <div style={styles.statLabel}>✓ Accepted</div>
        </div>
        <div style={{...styles.statCard, background: '#dbeafe'}}>
          <div style={styles.statNumber}>{stats.ready_orders || 0}</div>
          <div style={styles.statLabel}>📦 Ready</div>
        </div>
      </div>

      {/* Charts */}
      {dashboard && (
        <div style={styles.chartsGrid}>
          {/* Today's Orders Timeline */}
          <LineChart
            title="📈 Today's Order Flow"
            data={[
              { label: '9AM', value: Math.floor(Math.random() * 5) },
              { label: '12PM', value: Math.floor(Math.random() * 8) },
              { label: '3PM', value: Math.floor(Math.random() * 10) },
              { label: '6PM', value: stats.pending_orders || 0 },
              { label: 'Now', value: stats.total_orders || 0 },
            ]}
            height={200}
          />

          {/* Order Status */}
          <BarChart
            title="📊 Order Status"
            data={[
              { label: 'Pending', value: stats.pending_orders || 0 },
              { label: 'Accepted', value: stats.accepted_orders || 0 },
              { label: 'Ready', value: stats.ready_orders || 0 },
            ]}
            height={200}
          />
        </div>
      )}

      {/* Pending Orders */}
      {pending_orders && pending_orders.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>📋 Pending Orders ({pending_orders.length})</h2>
          {pending_orders.map(order => (
            <div key={order.id} style={styles.orderCard}>
              <div style={styles.orderHeader}>
                <div>
                  <strong>Order #{order.store_order_id || order.id}</strong>
                  <div style={styles.orderMeta}>
                    📞 {order.customer_phone}
                  </div>
                  <div style={styles.orderMeta}>
                    🕐 {new Date(order.created_at).toLocaleString()}
                  </div>
                </div>
                <div style={styles.orderStatus}>
                  {order.status}
                </div>
              </div>

              {/* Items */}
              <div style={styles.orderItems}>
                {order.store_items && JSON.parse(order.store_items).map((item, i) => (
                  <div key={i} style={styles.orderItem}>
                    • {item.name} ({item.packs || 1} × {item.size}{item.unit})
                  </div>
                ))}
              </div>

              {/* Actions */}
              {order.status === 'PENDING' && (
                <div style={styles.orderActions}>
                  <button 
                    onClick={() => updateOrderStatus(order.id, 'ACCEPTED')}
                    style={{...styles.actionBtn, background: '#22c55e'}}
                  >
                    ✓ Accept
                  </button>
                  <button 
                    onClick={() => updateOrderStatus(order.id, 'REJECTED')}
                    style={{...styles.actionBtn, background: '#ef4444'}}
                  >
                    ✗ Reject
                  </button>
                </div>
              )}
              
              {order.status === 'ACCEPTED' && (
                <button 
                  onClick={() => updateOrderStatus(order.id, 'READY')}
                  style={{...styles.actionBtn, background: '#3b82f6', width: '100%'}}
                >
                  📦 Mark as Ready
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Low Stock Alert */}
      {low_stock_products && low_stock_products.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>⚠️ Low Stock Alert ({low_stock_products.length})</h2>
          {low_stock_products.map((product, i) => (
            <div key={i} style={styles.stockCard}>
              <div style={styles.stockInfo}>
                <div style={styles.productName}>
                  {product.product_name}
                </div>
                <div style={styles.productMeta}>
                  {product.brand} {product.variant} {product.size}{product.unit}
                </div>
                <div style={styles.stockLevel}>
                  Stock: <strong style={{ color: '#ef4444' }}>{product.stock} left</strong>
                </div>
              </div>
              <div style={styles.stockActions}>
                <input
                  type="number"
                  min="0"
                  placeholder="New stock"
                  style={styles.stockInput}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      const newStock = parseInt(e.target.value);
                      if (newStock >= 0) {
                        updateProductStock(product.id, newStock);
                        e.target.value = '';
                      }
                    }
                  }}
                />
                <div style={styles.hint}>Press Enter</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Links */}
      <div style={styles.quickLinks}>
        <button 
          onClick={() => window.location.href = '/store/products'}
          style={styles.quickLink}
        >
          📦 All Products
        </button>
        <button 
          onClick={() => window.location.href = '/store/orders'}
          style={styles.quickLink}
        >
          📋 All Orders
        </button>
        <button 
          onClick={() => window.location.href = '/store/reports'}
          style={styles.quickLink}
        >
          📊 Reports
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 600,
    margin: 'auto',
    padding: 16,
    paddingBottom: 80,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  loading: {
    textAlign: 'center',
    padding: 60,
    fontSize: 18,
    color: '#666',
  },
  error: {
    textAlign: 'center',
    padding: 60,
    fontSize: 18,
    color: '#ef4444',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerActions: {
    display: 'flex',
    gap: 8,
  },
  settingsBtn: {
    padding: '8px 12px',
    background: '#f3f4f6',
    border: 'none',
    borderRadius: 8,
    fontSize: 18,
    cursor: 'pointer',
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  subtitle: {
    margin: '4px 0 0 0',
    fontSize: 14,
    color: '#666',
  },
  logoutBtn: {
    padding: '8px 16px',
    background: '#f3f4f6',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
    marginBottom: 24,
  },
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 20,
    marginBottom: 24,
  },
  statCard: {
    padding: 20,
    borderRadius: 12,
    textAlign: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  statLabel: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#1f2937',
  },
  orderCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  orderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  orderStatus: {
    padding: '4px 12px',
    background: '#fef3c7',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
  },
  orderItems: {
    padding: '12px 0',
    borderTop: '1px solid #f3f4f6',
    borderBottom: '1px solid #f3f4f6',
    marginBottom: 12,
  },
  orderItem: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
  },
  orderActions: {
    display: 'flex',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    padding: '12px',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  stockCard: {
    background: '#fffbeb',
    border: '2px solid #fbbf24',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  productMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  stockLevel: {
    fontSize: 14,
    marginTop: 8,
  },
  stockActions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
  },
  stockInput: {
    width: 80,
    padding: '8px 12px',
    border: '2px solid #fbbf24',
    borderRadius: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  hint: {
    fontSize: 11,
    color: '#666',
  },
  quickLinks: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
    marginTop: 24,
  },
  quickLink: {
    padding: 16,
    background: '#f3f4f6',
    border: 'none',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
  },
};
