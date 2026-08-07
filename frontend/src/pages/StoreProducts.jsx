import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

export default function StoreProducts() {
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');

  useEffect(() => {
    loadProducts();
  }, [search]);

  const loadProducts = async () => {
    try {
      const url = search 
        ? `${API_BASE}/api/store/products?token=${token}&search=${search}`
        : `${API_BASE}/api/store/products?token=${token}`;
      
      const res = await fetch(url);
      const data = await res.json();
      setProducts(data);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (product) => {
    setEditingId(product.id);
    setEditPrice(product.price);
    setEditStock(product.stock);
  };

  const saveEdit = async (productId) => {
    try {
      await fetch(`${API_BASE}/api/store/products/${productId}?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: parseFloat(editPrice),
          stock: parseInt(editStock)
        })
      });
      
      setEditingId(null);
      loadProducts();
      alert('✅ Product updated!');
    } catch (err) {
      alert('❌ Failed to update product');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPrice('');
    setEditStock('');
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>📦 Products</h1>
        <button onClick={() => window.location.href = '/store'} style={styles.backBtn}>
          ← Back
        </button>
      </div>

      {/* Search */}
      <div style={styles.searchBox}>
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      {/* Products List */}
      {loading ? (
        <div style={styles.loading}>🔄 Loading...</div>
      ) : products.length === 0 ? (
        <div style={styles.empty}>No products found</div>
      ) : (
        <div style={styles.productsList}>
          {products.map(product => (
            <div key={product.id} style={styles.productCard}>
              <div style={styles.productInfo}>
                <div style={styles.productName}>{product.product_name}</div>
                <div style={styles.productMeta}>
                  {product.brand} {product.variant} {product.size}{product.unit}
                </div>
              </div>

              {editingId === product.id ? (
                // Edit Mode
                <div style={styles.editMode}>
                  <div style={styles.editRow}>
                    <label style={styles.editLabel}>Price:</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      style={styles.editInput}
                    />
                  </div>
                  <div style={styles.editRow}>
                    <label style={styles.editLabel}>Stock:</label>
                    <input
                      type="number"
                      value={editStock}
                      onChange={(e) => setEditStock(e.target.value)}
                      style={styles.editInput}
                    />
                  </div>
                  <div style={styles.editActions}>
                    <button 
                      onClick={() => saveEdit(product.id)}
                      style={{...styles.editBtn, background: '#22c55e'}}
                    >
                      ✓ Save
                    </button>
                    <button 
                      onClick={cancelEdit}
                      style={{...styles.editBtn, background: '#6b7280'}}
                    >
                      ✗ Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div style={styles.viewMode}>
                  <div style={styles.productDetails}>
                    <div style={styles.priceTag}>₹{product.price}</div>
                    <div style={styles.stockTag}>
                      Stock: <strong>{product.stock}</strong>
                    </div>
                  </div>
                  <button 
                    onClick={() => startEdit(product)}
                    style={styles.editButton}
                  >
                    ✏️ Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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
  searchBox: {
    marginBottom: 20,
  },
  searchInput: {
    width: '100%',
    padding: '12px 16px',
    border: '2px solid #e5e7eb',
    borderRadius: 12,
    fontSize: 16,
    boxSizing: 'border-box',
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
  productsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  productCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 16,
  },
  productInfo: {
    marginBottom: 12,
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
  viewMode: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productDetails: {
    display: 'flex',
    gap: 16,
    alignItems: 'center',
  },
  priceTag: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#22c55e',
  },
  stockTag: {
    fontSize: 14,
    color: '#666',
  },
  editButton: {
    padding: '8px 16px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  editMode: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  editRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  editLabel: {
    fontSize: 14,
    fontWeight: 600,
    minWidth: 50,
  },
  editInput: {
    flex: 1,
    padding: '8px 12px',
    border: '2px solid #3b82f6',
    borderRadius: 8,
    fontSize: 14,
  },
  editActions: {
    display: 'flex',
    gap: 8,
  },
  editBtn: {
    flex: 1,
    padding: '10px',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
