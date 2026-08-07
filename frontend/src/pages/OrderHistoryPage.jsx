import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = "https://ekkilo.onrender.com";

export default function OrderHistoryPage({ onReorder }) {
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/orders?token=${token}`);
      const data = await res.json();
      setOrders(data);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadOrderDetails = async (orderId) => {
    setDetailsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}?token=${token}`);
      const data = await res.json();
      setSelectedOrder(data);
    } catch (err) {
      console.error('Failed to load order details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleReorder = async (orderId) => {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}/reorder?token=${token}`, {
        method: 'POST'
      });
      const data = await res.json();
      
      if (onReorder) {
        onReorder(data.search_text);
      }
    } catch (err) {
      alert('Failed to reorder');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'PENDING': '#f59e0b',
      'CONFIRMED': '#3b82f6',
      'READY': '#22c55e',
      'COMPLETED': '#10b981',
      'CANCELLED': '#ef4444'
    };
    return colors[status] || '#999';
  };

  const getStatusLabel = (status) => {
    const labels = {
      'PENDING': '⏳ Pending',
      'CONFIRMED': '✅ Confirmed',
      'READY': '📦 Ready',
      'COMPLETED': '🎉 Completed',
      'CANCELLED': '❌ Cancelled'
    };
    return labels[status] || status;
  };

  if (loading) {
    return <div style={styles.loading}>Loading orders...</div>;
  }

  if (selectedOrder) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <button onClick={() => setSelectedOrder(null)} style={styles.backBtn}>
            ← Back
          </button>
          <h2 style={styles.title}>Order #{selectedOrder.order.id}</h2>
        </div>

        {detailsLoading ? (
          <div style={styles.loading}>Loading details...</div>
        ) : (
          <>
            <div style={styles.orderMeta}>
              <div style={styles.metaRow}>
                <span style={styles.metaLabel}>Date:</span>
                <span>{new Date(selectedOrder.order.created_at).toLocaleString()}</span>
              </div>
              <div style={styles.metaRow}>
                <span style={styles.metaLabel}>Status:</span>
                <span style={{ 
                  color: getStatusColor(selectedOrder.order.status),
                  fontWeight: 600
                }}>
                  {getStatusLabel(selectedOrder.order.status)}
                </span>
              </div>
              <div style={styles.metaRow}>
                <span style={styles.metaLabel}>Total:</span>
                <span style={styles.totalAmount}>₹{selectedOrder.total.toFixed(2)}</span>
              </div>
            </div>

            {selectedOrder.stores.map((store, idx) => (
              <div key={idx} style={styles.storeCard}>
                <div style={styles.storeHeader}>
                  <div>
                    <h3 style={styles.storeName}>🏪 {store.store_name}</h3>
                    <p style={styles.storePhone}>{store.store_phone}</p>
                  </div>
                  <div style={styles.storeStatus}>
                    <span style={{ 
                      color: getStatusColor(store.status),
                      fontSize: 14,
                      fontWeight: 600
                    }}>
                      {getStatusLabel(store.status)}
                    </span>
                  </div>
                </div>

                <div style={styles.itemsList}>
                  {store.items.map((item, i) => (
                    <div key={i} style={styles.itemRow}>
                      <div style={styles.itemInfo}>
                        <div style={styles.itemName}>{item.product_name}</div>
                        <div style={styles.itemMeta}>
                          {item.quantity} × {item.size}{item.unit}
                        </div>
                      </div>
                      <div style={styles.itemPrice}>
                        ₹{parseFloat(item.price).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={styles.storeTotal}>
                  Subtotal: ₹{store.total_amount.toFixed(2)}
                </div>
              </div>
            ))}

            <button 
              onClick={() => handleReorder(selectedOrder.order.id)}
              style={styles.reorderBtn}
            >
              🔄 Reorder
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>📜 My Orders</h2>

      {orders.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>📦</div>
          <p>No orders yet</p>
          <p style={styles.emptyHint}>Your order history will appear here</p>
        </div>
      ) : (
        <div style={styles.ordersList}>
          {orders.map((order) => (
            <div 
              key={order.id} 
              style={styles.orderCard}
              onClick={() => loadOrderDetails(order.id)}
            >
              <div style={styles.orderCardHeader}>
                <div>
                  <div style={styles.orderId}>Order #{order.id}</div>
                  <div style={styles.orderDate}>
                    {new Date(order.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={styles.orderAmount}>
                  ₹{parseFloat(order.total_amount || 0).toFixed(2)}
                </div>
              </div>

              <div style={styles.orderCardFooter}>
                <span style={styles.storeCount}>
                  🏪 {order.store_count} store{order.store_count > 1 ? 's' : ''}
                </span>
                <span style={{ 
                  color: getStatusColor(order.status),
                  fontSize: 13,
                  fontWeight: 600
                }}>
                  {getStatusLabel(order.status)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 🎨 Mobile-First Styles
const styles = {
  container: {
    maxWidth: 520,
    margin: 'auto',
    padding: '16px',
    paddingBottom: 40,
    fontSize: 16
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20
  },
  backBtn: {
    background: 'none',
    border: '1px solid #ddd',
    padding: '10px 16px',
    borderRadius: 8,
    fontSize: 14,
    cursor: 'pointer',
    minHeight: 44,
    touchAction: 'manipulation'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    margin: 0
  },
  loading: {
    textAlign: 'center',
    padding: 60,
    color: '#999',
    fontSize: 16
  },
  empty: {
    textAlign: 'center',
    padding: 60,
    color: '#999'
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16
  },
  emptyHint: {
    fontSize: 14,
    marginTop: 8
  },
  ordersList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  orderCard: {
    background: '#fff',
    padding: 16,
    borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    touchAction: 'manipulation'
  },
  orderCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  orderId: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 4
  },
  orderDate: {
    fontSize: 13,
    color: '#666'
  },
  orderAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#22c55e'
  },
  orderCardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTop: '1px solid #f0f0f0'
  },
  storeCount: {
    fontSize: 13,
    color: '#666'
  },
  orderMeta: {
    background: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16
  },
  metaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    fontSize: 15
  },
  metaLabel: {
    color: '#666',
    fontWeight: 600
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#22c55e'
  },
  storeCard: {
    background: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  storeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottom: '1px solid #f0f0f0'
  },
  storeName: {
    fontSize: 17,
    fontWeight: 600,
    margin: '0 0 4px 0'
  },
  storePhone: {
    fontSize: 13,
    color: '#666',
    margin: 0
  },
  storeStatus: {
    fontSize: 13
  },
  itemsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0'
  },
  itemInfo: {
    flex: 1
  },
  itemName: {
    fontSize: 15,
    fontWeight: 500,
    marginBottom: 2
  },
  itemMeta: {
    fontSize: 13,
    color: '#888'
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: 600,
    color: '#374151'
  },
  storeTotal: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid #f0f0f0',
    fontSize: 16,
    fontWeight: 600,
    textAlign: 'right'
  },
  reorderBtn: {
    width: '100%',
    padding: '16px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 16,
    minHeight: 52,
    touchAction: 'manipulation'
  }
};
