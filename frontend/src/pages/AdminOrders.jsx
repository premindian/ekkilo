import { useState, useEffect } from 'react';
import { navigate } from '../utils/navigate';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

export default function AdminOrders() {
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);

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

  const viewOrderDetails = async (orderId) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/orders/${orderId}?token=${token}`);
      const data = await res.json();
      setOrderDetails(data);
      setSelectedOrder(orderId);
    } catch (err) {
      console.error('Failed to load order details:', err);
    }
  };

  const closeModal = () => {
    setSelectedOrder(null);
    setOrderDetails(null);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>📋 Order Management</h1>
          <p style={styles.subtitle}>{orders.length} orders</p>
        </div>
        <button onClick={() => navigate('/admin')} style={styles.backBtn}>
          ← Back
        </button>
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        {['ALL', 'CREATED', 'CONFIRMED', 'ACCEPTED', 'READY', 'PARTIAL_READY', 'PARTIAL', 'COMPLETED', 'REJECTED', 'CANCELLED'].map(f => (
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
          placeholder="🔍 Search by phone number or order ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
        {search && (
          <button onClick={() => setSearch('')} style={styles.clearBtn}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* Orders List */}
      {loading ? (
        <div style={styles.loading}>🔄 Loading...</div>
      ) : orders.length === 0 ? (
        <div style={styles.empty}>No orders found</div>
      ) : (
        <div style={styles.ordersList}>
          {orders
            .filter(order => 
              !search || 
              order.customer_phone.includes(search) || 
              order.id.toString().includes(search)
            )
            .map(order => (
            <div 
              key={order.id} 
              style={styles.orderCard}
              onClick={() => viewOrderDetails(order.id)}
            >
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
                <span style={styles.clickHint}>Click for details →</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && orderDetails && (
        <div style={styles.modal} onClick={closeModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2>Order #{selectedOrder} Details</h2>
              <button onClick={closeModal} style={styles.closeBtn}>✕</button>
            </div>

            <div style={styles.modalBody}>
              {/* Basic Info */}
              <div style={styles.section}>
                <h3>📋 Order Information</h3>
                <p>Customer: {orderDetails.customer_phone}</p>
                <p>Status: {orderDetails.status}</p>
                <p>Created: {new Date(orderDetails.created_at).toLocaleString()}</p>
                <p>Total: ₹{orderDetails.total_amount}</p>
              </div>

              {/* Stores */}
              {orderDetails.stores && orderDetails.stores.map((store, idx) => (
                <div key={idx} style={styles.section}>
                  <h3>🏪 {store.store_name}</h3>
                  <p>📞 {store.store_phone}</p>
                  <p>Status: <span style={{fontWeight: 'bold'}}>{store.status}</span></p>
                  <p>Amount: ₹{store.total_amount || 0}</p>
                  
                  <h4>Items:</h4>
                  {store.items && store.items.map((item, i) => (
                    <div key={i} style={styles.item}>
                      • {item.product_name} × {item.quantity} - ₹{item.price}
                    </div>
                  ))}
                </div>
              ))}

              {/* History */}
              {orderDetails.history && orderDetails.history.length > 0 && (
                <div style={styles.section}>
                  <h3>📜 Status History</h3>
                  {orderDetails.history.map((h, idx) => (
                    <div key={idx} style={styles.historyItem}>
                      {h.store_name}: {h.status} - {new Date(h.created_at).toLocaleString()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
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
    marginBottom: 16,
    overflowX: 'auto',
    paddingBottom: 8,
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
    fontSize: 13,
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
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      transform: 'translateY(-2px)',
    }
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
  clickHint: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginLeft: 'auto',
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: 'white',
    borderRadius: 16,
    maxWidth: 800,
    maxHeight: '90vh',
    overflow: 'auto',
    width: '90%',
  },
  modalHeader: {
    padding: 20,
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'sticky',
    top: 0,
    background: 'white',
    zIndex: 1,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 24,
    cursor: 'pointer',
    color: '#666',
  },
  modalBody: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
    paddingBottom: 24,
    borderBottom: '1px solid #f3f4f6',
  },
  item: {
    padding: '8px 0',
    fontSize: 14,
  },
  historyItem: {
    padding: '8px 12px',
    background: '#f9fafb',
    borderRadius: 8,
    marginBottom: 8,
    fontSize: 14,
  },
};
