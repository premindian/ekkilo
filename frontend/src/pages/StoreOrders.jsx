import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

export default function StoreOrders() {
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, [filter]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const url = filter === 'ALL'
        ? `${API_BASE}/api/store/orders?token=${token}`
        : `${API_BASE}/api/store/orders?token=${token}&status=${filter}`;
      
      const res = await fetch(url);
      const data = await res.json();
      setOrders(data);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (orderId, status) => {
    if (!window.confirm(`${status} this order?`)) return;
    
    try {
      await fetch(`${API_BASE}/api/store/orders/${orderId}?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      loadOrders();
      alert(`✅ Order ${status.toLowerCase()}!`);
    } catch (err) {
      alert('❌ Failed to update order');
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>📋 Orders</h1>
        <button onClick={() => window.location.href = '/store'} style={styles.backBtn}>
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

      {/* Search */}
      <div style={styles.searchBox}>
        <input
          type="text"
          placeholder="🔍 Search by phone or order ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
        {search && (
          <button onClick={() => setSearch('')} style={styles.clearBtn}>
            ✕
          </button>
        )}
      </div>

      {/* Orders List */}
      {loading ? (
        <div style={styles.loading}>🔄 Loading...</div>
      ) : orders.length === 0 ? (
        <div style={styles.empty}>No {filter.toLowerCase()} orders</div>
      ) : (
        <div style={styles.ordersList}>
          {orders
            .filter(order => 
              !search || 
              order.customer_phone.includes(search) || 
              order.id.toString().includes(search)
            )
            .map(order => (
            <div key={order.id} style={styles.orderCard}>
              <div style={styles.orderHeader}>
                <div>
                  <div style={styles.orderId}>Order #{order.store_order_id || order.id}</div>
                  <div style={styles.orderMeta}>📞 {order.customer_phone}</div>
                  <div style={styles.orderMeta}>
                    🕐 {new Date(order.created_at).toLocaleString()}
                  </div>
                </div>
                <div style={getStatusStyle(order.status)}>
                  {order.status}
                </div>
              </div>

              {/* Items */}
              <div style={styles.orderItems}>
                {(Array.isArray(order.store_items)
                  ? order.store_items
                  : (typeof order.store_items === 'string' ? JSON.parse(order.store_items || '[]') : [])
                ).map((item, i) => (
                  <div key={i} style={styles.orderItem}>
                    • {item.name} × {item.packs || item.quantity || 1} - ₹{item.price}
                  </div>
                ))}
                {order.total_amount != null && (
                  <div style={{...styles.orderItem, fontWeight: 600, marginTop: 6}}>
                    Total: ₹{order.total_amount}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={styles.actions}>
                {order.status === 'PENDING' && (
                  <>
                    <button 
                      onClick={() => updateStatus(order.id, 'ACCEPTED')}
                      style={{...styles.actionBtn, background: '#22c55e'}}
                    >
                      ✓ Accept
                    </button>
                    <button 
                      onClick={() => updateStatus(order.id, 'REJECTED')}
                      style={{...styles.actionBtn, background: '#ef4444'}}
                    >
                      ✗ Reject
                    </button>
                  </>
                )}
                {order.status === 'ACCEPTED' && (
                  <button 
                    onClick={() => updateStatus(order.id, 'READY')}
                    style={{...styles.actionBtn, background: '#3b82f6', width: '100%'}}
                  >
                    📦 Mark as Ready
                  </button>
                )}
                {order.status === 'READY' && (
                  <button 
                    onClick={() => updateStatus(order.id, 'COMPLETED')}
                    style={{...styles.actionBtn, background: '#10b981', width: '100%'}}
                  >
                    ✅ Mark Completed
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getStatusStyle(status) {
  const baseStyle = {
    padding: '4px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
  };

  const colors = {
    'PENDING': { background: '#fef3c7', color: '#92400e' },
    'ACCEPTED': { background: '#d1fae5', color: '#065f46' },
    'READY': { background: '#dbeafe', color: '#1e40af' },
    'COMPLETED': { background: '#e0e7ff', color: '#3730a3' },
    'REJECTED': { background: '#fee2e2', color: '#991b1b' },
  };

  return { ...baseStyle, ...colors[status] };
}

const styles = {
  container: {
    maxWidth: 600,
    margin: 'auto',
    padding: 16,
    paddingBottom: 80,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  backBtn: {
    padding: '8px 16px',
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
    marginBottom: 16,
    overflowX: 'auto',
  },
  searchBox: {
    display: 'flex',
    gap: 10,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    padding: '10px 15px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
  },
  clearBtn: {
    padding: '10px 20px',
    background: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
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
    gap: 12,
  },
  orderCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 16,
  },
  orderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  orderMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
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
  actions: {
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
};
