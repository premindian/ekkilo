import { useState, useEffect } from 'react';
import { navigate } from '../utils/navigate';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

export default function AdminProducts() {
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [variant, setVariant] = useState('');
  const [size, setSize] = useState('');
  const [unit, setUnit] = useState('unit');

  useEffect(() => {
    if (token) loadProducts();
  }, [token, search]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const url = search
        ? `${API_BASE}/api/admin/products?token=${token}&search=${encodeURIComponent(search)}`
        : `${API_BASE}/api/admin/products?token=${token}`;
      const res = await fetch(url);
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setName('');
    setBrand('');
    setVariant('');
    setSize('');
    setUnit('unit');
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setName(p.name || '');
    setBrand(p.brand || '');
    setVariant(p.variant || '');
    setSize(p.size ?? '');
    setUnit(p.unit || 'unit');
    setShowModal(true);
  };

  const saveProduct = async () => {
    if (!name.trim()) {
      alert('Product name required');
      return;
    }
    try {
      if (editing) {
        await fetch(`${API_BASE}/api/admin/products/${editing.id}?token=${token}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, brand, variant, size: size || 1, unit }),
        });
      } else {
        await fetch(`${API_BASE}/api/admin/products?token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, brand, variant, size: size || 1, unit }),
        });
      }
      setShowModal(false);
      loadProducts();
    } catch (err) {
      alert('Failed to save product');
    }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm('Delete this product from master catalog?')) return;
    try {
      await fetch(`${API_BASE}/api/admin/products/${id}?token=${token}`, { method: 'DELETE' });
      loadProducts();
    } catch (err) {
      alert('Failed to delete product');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>📦 Product Catalog</h1>
          <p style={styles.subtitle}>{products.length} products</p>
        </div>
        <div style={styles.headerActions}>
          <button onClick={openAdd} style={styles.addBtn}>+ Add Product</button>
          <button onClick={() => navigate('/admin')} style={styles.backBtn}>← Back</button>
        </div>
      </div>

      <div style={styles.searchBox}>
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      {loading ? (
        <div style={styles.empty}>Loading...</div>
      ) : products.length === 0 ? (
        <div style={styles.empty}>No products found</div>
      ) : (
        <div style={styles.list}>
          {products.map((p) => (
            <div key={p.id} style={styles.card}>
              <div>
                <div style={styles.name}>{p.name}</div>
                <div style={styles.meta}>
                  {[p.brand, p.variant, p.size && `${p.size}${p.unit || ''}`].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <div style={styles.actions}>
                <button onClick={() => openEdit(p)} style={styles.editBtn}>Edit</button>
                <button onClick={() => deleteProduct(p.id)} style={styles.deleteBtn}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={styles.modal} onClick={() => setShowModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{editing ? 'Edit Product' : 'Add Product'}</h2>
            <input placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} style={styles.input} />
            <input placeholder="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} style={styles.input} />
            <input placeholder="Variant" value={variant} onChange={(e) => setVariant(e.target.value)} style={styles.input} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input placeholder="Size" value={size} onChange={(e) => setSize(e.target.value)} style={{ ...styles.input, flex: 1 }} />
              <input placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ ...styles.input, flex: 1 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={saveProduct} style={styles.addBtn}>Save</button>
              <button onClick={() => setShowModal(false)} style={styles.backBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 1000, margin: 'auto', padding: 20, fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12, flexWrap: 'wrap' },
  title: { margin: 0, fontSize: 28, fontWeight: 'bold' },
  subtitle: { margin: '4px 0 0', color: '#6b7280' },
  headerActions: { display: 'flex', gap: 8 },
  addBtn: { padding: '10px 16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  backBtn: { padding: '10px 16px', background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  searchBox: { marginBottom: 16 },
  searchInput: { width: '100%', padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' },
  empty: { textAlign: 'center', padding: 40, color: '#9ca3af' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  name: { fontWeight: 700, fontSize: 16 },
  meta: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  actions: { display: 'flex', gap: 8 },
  editBtn: { padding: '8px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  deleteBtn: { padding: '8px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { background: '#fff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 480 },
  input: { width: '100%', padding: 12, marginBottom: 10, border: '1px solid #e5e7eb', borderRadius: 8, boxSizing: 'border-box' },
};
