import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = "https://ekkilo.onrender.com";

export default function ProfilePage({ onClose }) {
  const { user, token, logout, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState('profile'); // profile, favorites, preferences, stats
  
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>👤 My Profile</h2>
        {onClose && (
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        )}
      </div>

      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab('profile')}
          style={activeTab === 'profile' ? styles.activeTab : styles.tab}
        >
          Profile
        </button>
        <button
          onClick={() => setActiveTab('favorites')}
          style={activeTab === 'favorites' ? styles.activeTab : styles.tab}
        >
          Favorites
        </button>
        <button
          onClick={() => setActiveTab('preferences')}
          style={activeTab === 'preferences' ? styles.activeTab : styles.tab}
        >
          Settings
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          style={activeTab === 'stats' ? styles.activeTab : styles.tab}
        >
          Stats
        </button>
      </div>

      <div style={styles.content}>
        {activeTab === 'profile' && <ProfileTab user={user} token={token} updateUser={updateUser} />}
        {activeTab === 'favorites' && <FavoritesTab token={token} />}
        {activeTab === 'preferences' && <PreferencesTab token={token} />}
        {activeTab === 'stats' && <StatsTab token={token} user={user} />}
      </div>

      <button onClick={logout} style={styles.logoutBtn}>
        🚪 Logout
      </button>
    </div>
  );
}

// Profile Tab
function ProfileTab({ user, token, updateUser }) {
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/auth/profile?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email })
      });
      updateUser({ name, email });
      alert('Profile updated!');
    } catch (err) {
      alert('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={styles.formGroup}>
        <label style={styles.label}>Phone Number</label>
        <input value={user?.phone || ''} disabled style={styles.inputDisabled} />
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          style={styles.input}
        />
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Email (optional)</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          style={styles.input}
        />
      </div>

      <button onClick={saveProfile} disabled={saving} style={styles.saveBtn}>
        {saving ? 'Saving...' : '💾 Save Changes'}
      </button>
    </div>
  );
}

// Favorites Tab
function FavoritesTab({ token }) {
  const [favorites, setFavorites] = useState([]);
  const [allStores, setAllStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddStore, setShowAddStore] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [phoneSearchResult, setPhoneSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadFavorites();
    loadAllStores();
  }, []);

  const loadFavorites = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/favorites/stores?token=${token}`);
      const data = await res.json();
      setFavorites(data);
    } catch (err) {
      console.error('Failed to load favorites');
    } finally {
      setLoading(false);
    }
  };

  const loadAllStores = async () => {
    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'milk' }) // Dummy search to get stores
      });
      const data = await res.json();
      setAllStores(data.stores || []);
    } catch (err) {
      console.error('Failed to load stores');
    }
  };

  const searchByPhone = async () => {
    if (!phoneSearch || phoneSearch.length < 10) return;

    setSearching(true);
    try {
      const res = await fetch(`${API_BASE}/api/stores/by-phone/${phoneSearch}`);
      const data = await res.json();
      setPhoneSearchResult(data);
    } catch (err) {
      console.error('Search failed:', err);
      setPhoneSearchResult({ found: false });
    } finally {
      setSearching(false);
    }
  };

  const addFavorite = async (storeId) => {
    try {
      await fetch(`${API_BASE}/api/favorites/stores?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, rank: favorites.length + 1 })
      });
      loadFavorites();
      setShowAddStore(false);
      setPhoneSearch('');
      setPhoneSearchResult(null);
    } catch (err) {
      alert('Failed to add favorite');
    }
  };

  const removeFavorite = async (storeId) => {
    try {
      await fetch(`${API_BASE}/api/favorites/stores/${storeId}?token=${token}`, {
        method: 'DELETE'
      });
      loadFavorites();
    } catch (err) {
      alert('Failed to remove favorite');
    }
  };

  if (loading) return <p style={styles.loadingText}>Loading...</p>;

  return (
    <div>
      <p style={styles.helpText}>Select your top 3 favorite kiranas for quick access</p>

      <div style={styles.favoritesContainer}>
        {favorites.map((fav, idx) => (
          <div key={fav.id} style={styles.favoriteCard}>
            <div>
              <p style={styles.favRank}>#{idx + 1}</p>
              <p style={styles.favName}>{fav.store_name}</p>
              <p style={styles.favPhone}>{fav.store_phone}</p>
            </div>
            <button onClick={() => removeFavorite(fav.store_id)} style={styles.removeBtn}>
              Remove
            </button>
          </div>
        ))}

        {favorites.length < 3 && !showAddStore && (() => {
          const availableStores = allStores.filter(s => !favorites.find(f => f.store_name === s.store));
          
          if (availableStores.length === 0) {
            return (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666', background: '#f9f9f9', borderRadius: 12 }}>
                <p>🔍 No stores available yet</p>
                <p style={{ fontSize: 14, marginTop: 8 }}>Search for products on the home page to discover stores</p>
              </div>
            );
          }
          
          return (
            <button onClick={() => setShowAddStore(true)} style={styles.addFavBtn}>
              ➕ Add Favorite Store
            </button>
          );
        })()}

        {showAddStore && (
          <div style={styles.addStoreBox}>
            <p style={styles.addStoreTitle}>Add Favorite Store</p>
            
            {/* Phone Search */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 14, marginBottom: 8, color: '#666' }}>
                📱 Search by WhatsApp Number:
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="tel"
                  placeholder="10-digit number"
                  value={phoneSearch}
                  onChange={(e) => setPhoneSearch(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  style={{ ...styles.input, flex: 1 }}
                  maxLength={10}
                />
                <button
                  onClick={searchByPhone}
                  disabled={phoneSearch.length !== 10 || searching}
                  style={{
                    ...styles.saveBtn,
                    flex: 'none',
                    width: 'auto',
                    padding: '0 20px',
                    opacity: phoneSearch.length !== 10 ? 0.5 : 1
                  }}
                >
                  {searching ? '...' : '🔍'}
                </button>
              </div>

              {/* Phone Search Result */}
              {phoneSearchResult && (
                phoneSearchResult.found ? (
                  <div style={{ marginTop: 12, padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #22c55e' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                      ✅ Found: {phoneSearchResult.store.name}
                    </div>
                    <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
                      {phoneSearchResult.store.phone}
                    </div>
                    <button
                      onClick={() => addFavorite(phoneSearchResult.store.id)}
                      style={{ ...styles.saveBtn, width: '100%', padding: '10px' }}
                    >
                      ⭐ Add to Favorites
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', borderRadius: 8, border: '1px solid #ef4444' }}>
                    <div style={{ fontSize: 14, color: '#dc2626' }}>
                      ❌ Store not found
                    </div>
                  </div>
                )
              )}
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
              <p style={{ fontSize: 14, marginBottom: 12, color: '#666' }}>
                Or browse available stores:
              </p>
              
              {(() => {
                const availableStores = allStores.filter(s => !favorites.find(f => f.store_name === s.store));
                
                if (availableStores.length === 0) {
                  return (
                    <div style={{ padding: '20px 0', color: '#666', textAlign: 'center' }}>
                      <p style={{ fontSize: 14 }}>Search for products on the home page first</p>
                    </div>
                  );
                }
                
                return availableStores.slice(0, 5).map((store) => (
                  <button
                    key={store.store}
                    onClick={() => addFavorite(store.store_id)}
                    style={styles.storeOption}
                  >
                    {store.store}
                  </button>
                ));
              })()}
            </div>
            
            <button 
              onClick={() => {
                setShowAddStore(false);
                setPhoneSearch('');
                setPhoneSearchResult(null);
              }} 
              style={styles.cancelBtn}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Preferences Tab
function PreferencesTab({ token }) {
  const [prefs, setPrefs] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPreferences();
    loadFavorites();
  }, []);

  const loadPreferences = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/preferences?token=${token}`);
      const data = await res.json();
      setPrefs(data);
    } catch (err) {
      console.error('Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const loadFavorites = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/favorites/stores?token=${token}`);
      const data = await res.json();
      setFavorites(data);
    } catch (err) {
      console.error('Failed to load favorites');
    }
  };

  const updatePref = async (key, value) => {
    try {
      await fetch(`${API_BASE}/api/preferences?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      setPrefs({ ...prefs, [key]: value });
    } catch (err) {
      alert('Failed to update preference');
    }
  };

  if (loading) return <p style={styles.loadingText}>Loading...</p>;

  return (
    <div>
      <div style={styles.prefItem}>
        <div>
          <p style={styles.prefTitle}>Show Product Pictures</p>
          <p style={styles.prefDesc}>Display images in product listings</p>
        </div>
        <label style={styles.switch}>
          <input
            type="checkbox"
            checked={prefs?.show_product_pictures}
            onChange={(e) => updatePref('show_product_pictures', e.target.checked)}
          />
          <span style={styles.slider}></span>
        </label>
      </div>

      <div style={styles.prefItem}>
        <div>
          <p style={styles.prefTitle}>Default View Mode</p>
          <p style={styles.prefDesc}>How stores are displayed by default</p>
        </div>
        <select
          value={prefs?.default_view_mode || 'smart'}
          onChange={(e) => updatePref('default_view_mode', e.target.value)}
          style={styles.select}
        >
          <option value="smart">Smart (Best Price)</option>
          <option value="favorites">My Favorites</option>
          <option value="nearby">Nearby Stores</option>
          <option value="manual">Manual Selection</option>
          <option value="support">Support Local</option>
        </select>
      </div>

      <div style={styles.prefItem}>
        <div>
          <p style={styles.prefTitle}>Default Search Radius</p>
          <p style={styles.prefDesc}>Distance for nearby stores</p>
        </div>
        <select
          value={prefs?.default_radius || 5}
          onChange={(e) => updatePref('default_radius', parseInt(e.target.value))}
          style={styles.select}
        >
          <option value="3">3 km</option>
          <option value="5">5 km</option>
          <option value="7">7 km</option>
          <option value="10">10 km</option>
        </select>
      </div>

      {/* Regular Store Selection */}
      <div style={styles.prefItem}>
        <div>
          <p style={styles.prefTitle}>🏪 My Regular Store</p>
          <p style={styles.prefDesc}>Your go-to trusted kirana</p>
        </div>
        {favorites.length === 0 ? (
          <p style={{ fontSize: 14, color: '#999', fontStyle: 'italic' }}>
            Add favorites first →
          </p>
        ) : (
          <select
            value={prefs?.regular_store_id || ''}
            onChange={(e) => updatePref('regular_store_id', e.target.value ? parseInt(e.target.value) : null)}
            style={styles.select}
          >
            <option value="">None selected</option>
            {favorites.map(fav => (
              <option key={fav.id} value={fav.store_id}>
                {fav.store_name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// Stats Tab
function StatsTab({ token, user }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stats?token=${token}`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p style={styles.loadingText}>Loading...</p>;

  return (
    <div>
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <p style={styles.statValue}>{stats?.total_orders || 0}</p>
          <p style={styles.statLabel}>Total Orders</p>
        </div>

        <div style={styles.statCard}>
          <p style={styles.statValue}>₹{stats?.estimated_savings || 0}</p>
          <p style={styles.statLabel}>Total Savings</p>
        </div>

        <div style={styles.statCard}>
          <p style={styles.statValue}>{stats?.favorite_stores || 0}</p>
          <p style={styles.statLabel}>Favorite Stores</p>
        </div>

        <div style={styles.statCard}>
          <p style={styles.statValue}>{stats?.grocery_lists || 0}</p>
          <p style={styles.statLabel}>Grocery Lists</p>
        </div>
      </div>

      <div style={styles.userSince}>
        <p>Member since {new Date(user?.created_at || Date.now()).toLocaleDateString()}</p>
      </div>
    </div>
  );
}

// 🎨 Mobile-First Responsive Styles
const styles = {
  container: { padding: '16px', maxWidth: 600, margin: 'auto', fontSize: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', margin: 0 },
  closeBtn: { background: 'none', border: 'none', fontSize: 28, cursor: 'pointer', color: '#999', minWidth: 44, minHeight: 44, touchAction: 'manipulation' },
  tabs: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e5e7eb', overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  tab: { padding: '14px 20px', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontSize: 15, color: '#666', minHeight: 48, touchAction: 'manipulation', whiteSpace: 'nowrap' },
  activeTab: { padding: '14px 20px', background: 'none', border: 'none', borderBottom: '2px solid #667eea', cursor: 'pointer', fontSize: 15, fontWeight: 'bold', color: '#667eea', minHeight: 48, touchAction: 'manipulation', whiteSpace: 'nowrap' },
  content: { minHeight: 300, marginBottom: 20 },
  formGroup: { marginBottom: 20 },
  label: { display: 'block', fontSize: 15, fontWeight: 600, marginBottom: 8, color: '#374151' },
  input: { width: '100%', padding: '14px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 16, boxSizing: 'border-box', minHeight: 48 },
  inputDisabled: { width: '100%', padding: '14px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 16, background: '#f9fafb', color: '#999', boxSizing: 'border-box', minHeight: 48 },
  saveBtn: { width: '100%', padding: '16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 'bold', cursor: 'pointer', minHeight: 52, touchAction: 'manipulation' },
  logoutBtn: { width: '100%', padding: '16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 'bold', cursor: 'pointer', minHeight: 52, touchAction: 'manipulation', marginTop: 12 },
  loadingText: { textAlign: 'center', padding: 40, color: '#999', fontSize: 16 },
  helpText: { fontSize: 15, color: '#666', marginBottom: 16, lineHeight: 1.5 },
  favoritesContainer: { display: 'flex', flexDirection: 'column', gap: 12 },
  favoriteCard: { background: '#f9fafb', border: '2px solid #667eea', borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 80 },
  favRank: { fontSize: 28, fontWeight: 'bold', color: '#667eea', margin: '0 0 4px 0' },
  favName: { fontSize: 17, fontWeight: 600, margin: '0 0 4px 0' },
  favPhone: { fontSize: 15, color: '#666', margin: 0 },
  removeBtn: { padding: '10px 18px', background: '#fee', color: '#dc2626', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, minHeight: 44, touchAction: 'manipulation' },
  addFavBtn: { padding: '16px', background: '#667eea', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 15, minHeight: 52, touchAction: 'manipulation', fontWeight: 600 },
  addStoreBox: { background: '#f9fafb', padding: 16, borderRadius: 10, marginTop: 12 },
  addStoreTitle: { fontSize: 15, fontWeight: 600, marginBottom: 12 },
  storeOption: { width: '100%', padding: '14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 8, cursor: 'pointer', textAlign: 'left', fontSize: 15, minHeight: 48, touchAction: 'manipulation' },
  cancelBtn: { width: '100%', padding: '14px', background: '#e5e7eb', border: 'none', borderRadius: 8, cursor: 'pointer', marginTop: 8, fontSize: 15, minHeight: 48, touchAction: 'manipulation' },
  prefItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0', borderBottom: '1px solid #e5e7eb', gap: 16 },
  prefTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 4px 0' },
  prefDesc: { fontSize: 14, color: '#666', margin: 0, lineHeight: 1.4 },
  switch: { position: 'relative', display: 'inline-block', width: 56, height: 32, flexShrink: 0 },
  slider: { position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, background: '#ccc', borderRadius: 32, transition: '.4s' },
  select: { padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 16, minHeight: 48, touchAction: 'manipulation' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 },
  statCard: { background: '#f9fafb', borderRadius: 12, padding: '20px 16px', textAlign: 'center', minHeight: 100 },
  statValue: { fontSize: 28, fontWeight: 'bold', color: '#667eea', margin: '0 0 8px 0' },
  statLabel: { fontSize: 13, color: '#666', margin: 0 },
  userSince: { textAlign: 'center', padding: 20, color: '#999', fontSize: 14 }
};
