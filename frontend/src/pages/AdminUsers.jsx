import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

export default function AdminUsers() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [assignUser, setAssignUser] = useState(null);
  const [selectedStoreId, setSelectedStoreId] = useState('');

  useEffect(() => {
    if (token) {
      loadUsers();
      loadStores();
    }
  }, [token, search]);

  const loadUsers = async () => {
    try {
      const url = search
        ? `${API_BASE}/api/admin/users?token=${token}&search=${search}`
        : `${API_BASE}/api/admin/users?token=${token}`;
      
      const res = await fetch(url);
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStores = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/stores?token=${token}`);
      const data = await res.json();
      setStores(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load stores:', err);
    }
  };

  const toggleStoreOwner = async (user) => {
    if (user.is_store_owner) {
      if (!window.confirm(`Remove store owner access for ${user.name || user.phone}?`)) return;
      try {
        await fetch(`${API_BASE}/api/admin/users/${user.id}?token=${token}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_store_owner: false, store_id: null }),
        });
        alert('✅ Store owner removed');
        loadUsers();
      } catch (err) {
        alert('❌ Failed to update user');
      }
      return;
    }

    // Making owner requires assigning a store
    setAssignUser(user);
    setSelectedStoreId(user.store_id ? String(user.store_id) : '');
  };

  const confirmMakeOwner = async () => {
    if (!selectedStoreId) {
      alert('Please select a store');
      return;
    }
    try {
      await fetch(`${API_BASE}/api/admin/users/${assignUser.id}?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_store_owner: true,
          store_id: parseInt(selectedStoreId, 10),
        }),
      });
      alert('✅ User assigned as store owner!');
      setAssignUser(null);
      loadUsers();
    } catch (err) {
      alert('❌ Failed to update user');
    }
  };

  const toggleAdmin = async (user) => {
    if (!window.confirm(`Make ${user.name || user.phone} an admin?`)) return;
    
    try {
      await fetch(`${API_BASE}/api/admin/users/${user.id}?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_admin: !user.is_admin
        })
      });
      alert('✅ User updated!');
      loadUsers();
    } catch (err) {
      alert('❌ Failed to update user');
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>👥 User Management</h1>
          <p style={styles.subtitle}>{users.length} users</p>
        </div>
        <button onClick={() => window.location.href = '/admin'} style={styles.backBtn}>
          ← Back
        </button>
      </div>

      {/* Search */}
      <div style={styles.searchBox}>
        <input
          type="text"
          placeholder="Search users by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      {/* Users List */}
      {loading ? (
        <div style={styles.loading}>🔄 Loading...</div>
      ) : users.length === 0 ? (
        <div style={styles.empty}>No users found</div>
      ) : (
        <div style={styles.usersList}>
          {users.map(user => (
            <div key={user.id} style={styles.userCard}>
              <div style={styles.userHeader}>
                <div style={styles.userInfo}>
                  <h3 style={styles.userName}>{user.name || 'Unnamed User'}</h3>
                  <p style={styles.userPhone}>📞 {user.phone}</p>
                  {user.email && <p style={styles.userEmail}>✉️ {user.email}</p>}
                </div>
                <div style={styles.badges}>
                  {user.is_admin && <span style={styles.badgeAdmin}>👑 Admin</span>}
                  {user.is_store_owner && <span style={styles.badgeOwner}>🏪 Owner</span>}
                </div>
              </div>

              <div style={styles.userStats}>
                <div style={styles.stat}>
                  <div style={styles.statValue}>{user.total_orders || 0}</div>
                  <div style={styles.statLabel}>Orders</div>
                </div>
                {user.store_name && (
                  <div style={styles.stat}>
                    <div style={styles.statValue}>🏪</div>
                    <div style={styles.statLabel}>{user.store_name}</div>
                  </div>
                )}
              </div>

              <div style={styles.userActions}>
                <button 
                  onClick={() => toggleStoreOwner(user)} 
                  style={user.is_store_owner ? styles.removeOwnerBtn : styles.makeOwnerBtn}
                >
                  {user.is_store_owner ? '❌ Remove Owner' : '🏪 Make Owner'}
                </button>
                <button 
                  onClick={() => toggleAdmin(user)} 
                  style={user.is_admin ? styles.removeAdminBtn : styles.makeAdminBtn}
                >
                  {user.is_admin ? '❌ Remove Admin' : '👑 Make Admin'}
                </button>
              </div>

              <div style={styles.userMeta}>
                Joined {new Date(user.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {assignUser && (
        <div style={styles.modal} onClick={() => setAssignUser(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Assign Store Owner</h2>
            <p style={{ color: '#6b7280' }}>
              Select a store for <strong>{assignUser.name || assignUser.phone}</strong>
            </p>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              style={styles.select}
            >
              <option value="">Select store...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.phone})
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={confirmMakeOwner} style={styles.makeOwnerBtn}>Confirm</button>
              <button onClick={() => setAssignUser(null)} style={styles.backBtn}>Cancel</button>
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
  usersList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: 16,
  },
  userCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 20,
  },
  userHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    margin: '0 0 8px 0',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  userPhone: {
    margin: '0 0 4px 0',
    fontSize: 14,
    color: '#6b7280',
  },
  userEmail: {
    margin: 0,
    fontSize: 13,
    color: '#9ca3af',
  },
  badges: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  badgeAdmin: {
    padding: '4px 8px',
    background: '#fef3c7',
    color: '#92400e',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
  },
  badgeOwner: {
    padding: '4px 8px',
    background: '#dbeafe',
    color: '#1e40af',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
  },
  userStats: {
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
  userActions: {
    display: 'flex',
    gap: 8,
    marginBottom: 12,
  },
  makeOwnerBtn: {
    flex: 1,
    padding: '8px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  removeOwnerBtn: {
    flex: 1,
    padding: '8px',
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  makeAdminBtn: {
    flex: 1,
    padding: '8px',
    background: '#f59e0b',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  removeAdminBtn: {
    flex: 1,
    padding: '8px',
    background: '#6b7280',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  userMeta: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
  modal: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 420,
  },
  select: {
    width: '100%',
    padding: 12,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
  },
};
