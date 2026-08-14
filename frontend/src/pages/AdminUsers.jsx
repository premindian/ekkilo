import { useState, useEffect } from 'react';
import { navigate } from '../utils/navigate';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

export default function AdminUsers() {
  const { token, user: me, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [assignUser, setAssignUser] = useState(null);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [passwordUser, setPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [adminTarget, setAdminTarget] = useState(null); // { user, mode: 'make'|'remove' }
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPhone, setAdminConfirmPhone] = useState('');
  const [adminConfirmPhrase, setAdminConfirmPhrase] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);

  useEffect(() => {
    if (token) {
      loadUsers();
      loadStores();
    }
  }, [token, search]);

  const loadUsers = async () => {
    try {
      setLoadError('');
      const url = search
        ? `${API_BASE}/api/admin/users?token=${encodeURIComponent(token)}&search=${encodeURIComponent(search)}`
        : `${API_BASE}/api/admin/users?token=${encodeURIComponent(token)}`;

      const res = await fetch(url);
      const data = await res.json().catch(() => null);

      // Never setUsers(errorObject) — that causes "t.map is not a function"
      if (!res.ok) {
        setUsers([]);
        const detail =
          typeof data?.detail === 'string'
            ? data.detail
            : 'Failed to load users (not authorized or server error)';
        setLoadError(detail);
        if (res.status === 401 || res.status === 403) {
          // Session lost admin rights (e.g. demoted) — don't crash the page
          setTimeout(() => {
            logout?.();
            navigate('/');
          }, 1500);
        }
        return;
      }

      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load users:', err);
      setUsers([]);
      setLoadError('Failed to load users');
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

  const setStaffPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/users/${passwordUser.id}/password?token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: newPassword }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        alert(data.detail || 'Failed to set password');
        return;
      }
      alert('✅ Staff password set! They can use Staff Login.');
      setPasswordUser(null);
      setNewPassword('');
    } catch (err) {
      alert('Failed to set password');
    }
  };

  const toggleAdmin = (user) => {
    if (user.is_admin) {
      const list = Array.isArray(users) ? users : [];
      const count = list.filter((u) => u.is_admin).length;
      if (count <= 1) {
        alert(
          'Cannot remove the last admin.\n\n' +
            'That would lock everyone out of /admin.\n\n' +
            '1) Make another trusted phone an admin first\n' +
            '2) Then remove this one\n\n' +
            'Emergency recovery: database or BREAK_GLASS_SECRET (see ADMIN_RECOVERY.md).'
        );
        return;
      }
      setAdminTarget({ user, mode: 'remove' });
    } else {
      setAdminTarget({ user, mode: 'make' });
    }
    setAdminPassword('');
    setAdminConfirmPhone('');
    setAdminConfirmPhrase('');
  };

  const submitAdminChange = async () => {
    if (!adminTarget?.user) return;
    const { user, mode } = adminTarget;
    const expectedPhrase = mode === 'make' ? 'MAKE ADMIN' : 'REMOVE ADMIN';
    if (!adminPassword || adminPassword.length < 6) {
      alert('Enter your staff password (min 6 characters)');
      return;
    }
    if (!adminConfirmPhone.trim()) {
      alert("Type the user's phone number to confirm");
      return;
    }
    if (adminConfirmPhrase.trim().toUpperCase() !== expectedPhrase) {
      alert(`Type ${expectedPhrase} exactly to confirm`);
      return;
    }

    setAdminBusy(true);
    try {
      const path = mode === 'make' ? 'make-admin' : 'remove-admin';
      const res = await fetch(
        `${API_BASE}/api/admin/users/${user.id}/${path}?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password: adminPassword,
            confirm_phone: adminConfirmPhone.trim(),
            confirm_phrase: adminConfirmPhrase.trim(),
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.detail === 'string' ? data.detail : 'Failed to update admin');
        return;
      }
      alert(mode === 'make' ? '✅ User is now an admin' : '✅ Admin access removed');
      setAdminTarget(null);
      // Demoting yourself clears your session — don't reload users with a dead token
      if (mode === 'remove' && me?.id && user.id === me.id) {
        logout?.();
        navigate('/');
        return;
      }
      loadUsers();
    } catch (err) {
      alert('❌ Failed to update user');
    } finally {
      setAdminBusy(false);
    }
  };

  const toggleBlock = async (user) => {
    if (user.is_blocked) {
      if (!window.confirm(`Unblock ${user.name || user.phone}? They will be able to order again.`)) return;
      try {
        const res = await fetch(
          `${API_BASE}/api/admin/users/${user.id}/unblock?token=${token}`,
          { method: 'POST' }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(data.detail || 'Failed to unblock');
          return;
        }
        alert('✅ User unblocked');
        loadUsers();
      } catch (err) {
        alert('❌ Failed to unblock user');
      }
      return;
    }

    if (!window.confirm(
      `Block ${user.name || user.phone}?\n\nThey won't be able to log in via OTP or place orders.`
    )) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/users/${user.id}/block?token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Blocked by admin' }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.detail || 'Failed to block');
        return;
      }
      alert('🚫 User blocked');
      loadUsers();
    } catch (err) {
      alert('❌ Failed to block user');
    }
  };

  const userList = Array.isArray(users) ? users : [];
  const adminCount = userList.filter((u) => u.is_admin).length;
  const isSoleAdmin = (user) => Boolean(user?.is_admin) && adminCount <= 1;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>👥 User Management</h1>
          <p style={styles.subtitle}>
            {userList.length} users · {adminCount} admin{adminCount === 1 ? '' : 's'}
          </p>
        </div>
        <button onClick={() => navigate('/admin')} style={styles.backBtn}>
          ← Back
        </button>
      </div>

      <div style={styles.policyBox}>
        <strong>Last-admin protection:</strong> you cannot remove or block the only remaining
        admin in the app — that would lock everyone out of /admin. Promote a second trusted
        admin first, then demote. Emergency recovery still works via database or{' '}
        <code>BREAK_GLASS_SECRET</code>.
      </div>

      {loadError && (
        <div style={styles.errorBox}>
          {loadError}
          {(loadError.toLowerCase().includes('admin') ||
            loadError.toLowerCase().includes('authorized')) && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              If you locked yourself out, restore via DB or{' '}
              <code>POST /api/auth/break-glass</code> with <code>BREAK_GLASS_SECRET</code>.
            </div>
          )}
        </div>
      )}

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
      ) : userList.length === 0 ? (
        <div style={styles.empty}>{loadError ? '—' : 'No users found'}</div>
      ) : (
        <div style={styles.usersList}>
          {userList.map(user => (
            <div key={user.id} style={styles.userCard}>
              <div style={styles.userHeader}>
                <div style={styles.userInfo}>
                  <h3 style={styles.userName}>{user.name || 'Unnamed User'}</h3>
                  <p style={styles.userPhone}>📞 {user.phone}</p>
                  {user.email && <p style={styles.userEmail}>✉️ {user.email}</p>}
                </div>
                <div style={styles.badges}>
                  {user.is_blocked && <span style={styles.badgeBlocked}>🚫 Blocked</span>}
                  {user.is_admin && <span style={styles.badgeAdmin}>👑 Admin</span>}
                  {isSoleAdmin(user) && (
                    <span style={styles.badgeSole}>Only admin — protected</span>
                  )}
                  {user.is_store_owner && <span style={styles.badgeOwner}>🏪 Owner</span>}
                </div>
              </div>

              {isSoleAdmin(user) && (
                <div style={styles.soleNote}>
                  This is the last admin. Remove Admin and Block are disabled until another
                  admin exists. You can still recover via DB / break-glass if needed.
                </div>
              )}

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
                  onClick={() => {
                    if (isSoleAdmin(user) && !user.is_blocked) {
                      alert(
                        'Cannot block the last admin.\n\nPromote another trusted admin first, then block if needed.\n\nEmergency: DB access or BREAK_GLASS_SECRET.'
                      );
                      return;
                    }
                    toggleBlock(user);
                  }}
                  disabled={isSoleAdmin(user) && !user.is_blocked}
                  style={{
                    ...(user.is_blocked ? styles.unblockBtn : styles.blockBtn),
                    ...((isSoleAdmin(user) && !user.is_blocked) ? styles.btnDisabled : {}),
                  }}
                  title={
                    isSoleAdmin(user) && !user.is_blocked
                      ? 'Cannot block the last admin'
                      : undefined
                  }
                >
                  {user.is_blocked ? '✅ Unblock' : '🚫 Block'}
                </button>
                <button 
                  onClick={() => toggleStoreOwner(user)} 
                  style={user.is_store_owner ? styles.removeOwnerBtn : styles.makeOwnerBtn}
                >
                  {user.is_store_owner ? '❌ Remove Owner' : '🏪 Make Owner'}
                </button>
                <button 
                  onClick={() => toggleAdmin(user)} 
                  disabled={isSoleAdmin(user)}
                  style={{
                    ...(user.is_admin ? styles.removeAdminBtn : styles.makeAdminBtn),
                    ...(isSoleAdmin(user) ? styles.btnDisabled : {}),
                  }}
                  title={isSoleAdmin(user) ? 'Cannot remove the last admin' : undefined}
                >
                  {user.is_admin
                    ? isSoleAdmin(user)
                      ? '🔒 Last admin'
                      : '❌ Remove Admin'
                    : '👑 Make Admin'}
                </button>
              </div>
              {(user.is_admin || user.is_store_owner) && (
                <button
                  onClick={() => { setPasswordUser(user); setNewPassword(''); }}
                  style={styles.passwordBtn}
                >
                  🔑 Set Staff Password
                </button>
              )}

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

      {passwordUser && (
        <div style={styles.modal} onClick={() => setPasswordUser(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Set Staff Password</h2>
            <p style={{ color: '#6b7280' }}>
              For <strong>{passwordUser.name || passwordUser.phone}</strong>
            </p>
            <input
              type="password"
              placeholder="New password (min 6 chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={styles.select}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={setStaffPassword} style={styles.makeOwnerBtn}>Save Password</button>
              <button onClick={() => setPasswordUser(null)} style={styles.backBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {adminTarget && (
        <div style={styles.modal} onClick={() => !adminBusy && setAdminTarget(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>
              {adminTarget.mode === 'make' ? 'Make Admin' : 'Remove Admin'}
            </h2>
            <p style={{ color: '#6b7280', lineHeight: 1.45 }}>
              This is a sensitive action for{' '}
              <strong>{adminTarget.user.name || adminTarget.user.phone}</strong>
              {' '}({adminTarget.user.phone}).
              You must re-enter <strong>your</strong> staff password and type confirmation fields.
            </p>
            <label style={styles.fieldLabel}>Your staff password</label>
            <input
              type="password"
              placeholder="Your staff password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              style={styles.select}
              autoComplete="current-password"
            />
            <label style={styles.fieldLabel}>Type their phone to confirm</label>
            <input
              type="text"
              placeholder={adminTarget.user.phone || 'Phone number'}
              value={adminConfirmPhone}
              onChange={(e) => setAdminConfirmPhone(e.target.value)}
              style={styles.select}
            />
            <label style={styles.fieldLabel}>
              Type{' '}
              <code>{adminTarget.mode === 'make' ? 'MAKE ADMIN' : 'REMOVE ADMIN'}</code>
            </label>
            <input
              type="text"
              placeholder={adminTarget.mode === 'make' ? 'MAKE ADMIN' : 'REMOVE ADMIN'}
              value={adminConfirmPhrase}
              onChange={(e) => setAdminConfirmPhrase(e.target.value)}
              style={styles.select}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                onClick={submitAdminChange}
                disabled={adminBusy}
                style={adminTarget.mode === 'make' ? styles.makeAdminBtn : styles.removeAdminBtn}
              >
                {adminBusy
                  ? 'Working…'
                  : adminTarget.mode === 'make'
                  ? 'Confirm make admin'
                  : 'Confirm remove admin'}
              </button>
              <button
                onClick={() => setAdminTarget(null)}
                disabled={adminBusy}
                style={styles.backBtn}
              >
                Cancel
              </button>
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
  policyBox: {
    background: '#fff7ed',
    border: '1px solid #fed7aa',
    borderRadius: 12,
    padding: '12px 14px',
    marginBottom: 16,
    fontSize: 13,
    color: '#9a3412',
    lineHeight: 1.45,
  },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 12,
    padding: '12px 14px',
    marginBottom: 16,
    fontSize: 13,
    color: '#991b1b',
    lineHeight: 1.45,
  },
  soleNote: {
    background: '#fef3c7',
    border: '1px solid #fde68a',
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 12,
    fontSize: 12,
    color: '#92400e',
    lineHeight: 1.4,
  },
  badgeSole: {
    display: 'inline-block',
    background: '#fef3c7',
    color: '#92400e',
    padding: '4px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
  },
  btnDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
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
  badgeBlocked: {
    padding: '4px 8px',
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
  },
  blockBtn: {
    padding: '8px 12px',
    background: '#fef2f2',
    color: '#b91c1c',
    border: '1px solid #fecaca',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  unblockBtn: {
    padding: '8px 12px',
    background: '#ecfdf5',
    color: '#047857',
    border: '1px solid #a7f3d0',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
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
  passwordBtn: {
    width: '100%',
    padding: '8px',
    marginBottom: 12,
    background: '#8b5cf6',
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
  fieldLabel: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    marginTop: 12,
    marginBottom: 6,
  },
  select: {
    width: '100%',
    padding: 12,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
  },
};
