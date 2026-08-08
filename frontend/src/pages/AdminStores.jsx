import { useState, useEffect } from 'react';
import { navigate } from '../utils/navigate';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

export default function AdminStores() {
  const { token } = useAuth();
  const [stores, setStores] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  
  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  useEffect(() => {
    if (token) {
      loadStores();
    }
  }, [token, search]);

  const loadStores = async () => {
    try {
      const url = search
        ? `${API_BASE}/api/admin/stores?token=${token}&search=${search}`
        : `${API_BASE}/api/admin/stores?token=${token}`;
      
      const res = await fetch(url);
      const data = await res.json();
      setStores(data);
    } catch (err) {
      console.error('Failed to load stores:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setName('');
    setPhone('');
    setAddress('');
    setLat('');
    setLng('');
    setEditingStore(null);
    setShowAddModal(true);
  };

  const openEditModal = (store) => {
    setName(store.name);
    setPhone(store.phone);
    setAddress(store.address || '');
    setLat(store.lat || '');
    setLng(store.lng || '');
    setEditingStore(store);
    setShowAddModal(true);
  };

  const saveStore = async () => {
    try {
      if (editingStore) {
        // Update existing store
        await fetch(`${API_BASE}/api/admin/stores/${editingStore.id}?token=${token}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            phone,
            address,
            lat: lat ? parseFloat(lat) : null,
            lng: lng ? parseFloat(lng) : null
          })
        });
        alert('✅ Store updated!');
      } else {
        // Create new store
        await fetch(`${API_BASE}/api/admin/stores?token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            phone,
            address,
            lat: lat ? parseFloat(lat) : null,
            lng: lng ? parseFloat(lng) : null
          })
        });
        alert('✅ Store created!');
      }
      setShowAddModal(false);
      loadStores();
    } catch (err) {
      alert('❌ Failed to save store');
    }
  };

  const toggleStoreStatus = async (store) => {
    try {
      await fetch(`${API_BASE}/api/admin/stores/${store.id}?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_active: !store.is_active
        })
      });
      loadStores();
    } catch (err) {
      alert('❌ Failed to update store status');
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🏪 Store Management</h1>
          <p style={styles.subtitle}>{stores.length} stores</p>
        </div>
        <div style={styles.headerActions}>
          <button onClick={() => navigate('/admin')} style={styles.backBtn}>
            ← Back
          </button>
          <button onClick={openAddModal} style={styles.addBtn}>
            ➕ Add Store
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={styles.searchBox}>
        <input
          type="text"
          placeholder="Search stores by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      {/* Stores List */}
      {loading ? (
        <div style={styles.loading}>🔄 Loading...</div>
      ) : stores.length === 0 ? (
        <div style={styles.empty}>No stores found</div>
      ) : (
        <div style={styles.storesList}>
          {stores.map(store => (
            <div key={store.id} style={styles.storeCard}>
              <div style={styles.storeHeader}>
                <div style={styles.storeInfo}>
                  <h3 style={styles.storeName}>{store.name}</h3>
                  <p style={styles.storePhone}>📞 {store.phone}</p>
                  {store.address && <p style={styles.storeAddress}>📍 {store.address}</p>}
                </div>
                <div style={store.is_active ? styles.statusActive : styles.statusInactive}>
                  {store.is_active ? '🟢 Active' : '🔴 Inactive'}
                </div>
              </div>

              <div style={styles.storeStats}>
                <div style={styles.stat}>
                  <div style={styles.statValue}>{store.total_orders || 0}</div>
                  <div style={styles.statLabel}>Orders</div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statValue}>₹{parseFloat(store.total_revenue || 0).toFixed(0)}</div>
                  <div style={styles.statLabel}>Revenue</div>
                </div>
              </div>

              <div style={styles.storeActions}>
                <button onClick={() => openEditModal(store)} style={styles.editBtn}>
                  ✏️ Edit
                </button>
                <button 
                  onClick={() => toggleStoreStatus(store)} 
                  style={store.is_active ? styles.deactivateBtn : styles.activateBtn}
                >
                  {store.is_active ? '❌ Deactivate' : '✅ Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>
                {editingStore ? '✏️ Edit Store' : '➕ Add Store'}
              </h2>
              <button onClick={() => setShowAddModal(false)} style={styles.closeBtn}>✕</button>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Store Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={styles.input}
                placeholder="Store Name"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Phone Number *</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={styles.input}
                placeholder="917680928464"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Address</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                style={styles.textarea}
                placeholder="Full address"
                rows={3}
              />
            </div>

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Latitude</label>
                <input
                  type="text"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  style={styles.input}
                  placeholder="17.686815"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Longitude</label>
                <input
                  type="text"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  style={styles.input}
                  placeholder="83.218482"
                />
              </div>
            </div>

            <button onClick={saveStore} style={styles.saveBtn}>
              {editingStore ? '💾 Update Store' : '✅ Create Store'}
            </button>
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
  headerActions: {
    display: 'flex',
    gap: 8,
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
  addBtn: {
    padding: '10px 20px',
    background: '#22c55e',
    color: '#fff',
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
  storesList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: 16,
  },
  storeCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 20,
  },
  storeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  storeInfo: {
    flex: 1,
  },
  storeName: {
    margin: '0 0 8px 0',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  storePhone: {
    margin: '0 0 4px 0',
    fontSize: 14,
    color: '#6b7280',
  },
  storeAddress: {
    margin: 0,
    fontSize: 13,
    color: '#9ca3af',
  },
  statusActive: {
    padding: '4px 12px',
    background: '#d1fae5',
    color: '#065f46',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
  },
  statusInactive: {
    padding: '4px 12px',
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
  },
  storeStats: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    marginBottom: 16,
    paddingTop: 16,
    borderTop: '1px solid #f3f4f6',
  },
  stat: {
    textAlign: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3b82f6',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  storeActions: {
    display: 'flex',
    gap: 8,
  },
  editBtn: {
    flex: 1,
    padding: '10px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  activateBtn: {
    flex: 1,
    padding: '10px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  deactivateBtn: {
    flex: 1,
    padding: '10px',
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
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
    padding: 20,
  },
  modalContent: {
    background: '#fff',
    borderRadius: 16,
    padding: 24,
    maxWidth: 500,
    width: '100%',
    maxHeight: '80vh',
    overflow: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: '8px 12px',
    background: 'none',
    border: 'none',
    fontSize: 20,
    cursor: 'pointer',
    color: '#666',
  },
  formGroup: {
    marginBottom: 16,
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  label: {
    display: 'block',
    fontSize: 14,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '2px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '2px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  saveBtn: {
    width: '100%',
    padding: '12px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
  },
};
