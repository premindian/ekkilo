import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

export default function AdminDashboard() {
  const { token, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (token) {
      loadDashboard();
    }
  }, [token]);

  const loadDashboard = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/dashboard?token=${token}`);
      const data = await res.json();
      
      if (res.status === 403) {
        alert('Not authorized as admin');
        logout();
        return;
      }
      
      setStats(data);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={styles.loading}>🔄 Loading...</div>;
  }

  if (!stats) {
    return <div style={styles.error}>Failed to load dashboard</div>;
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>👑 Admin Portal</h1>
          <p style={styles.subtitle}>Platform Management</p>
        </div>
        <button onClick={logout} style={styles.logoutBtn}>
          🚪 Logout
        </button>
      </div>

      {/* Navigation */}
      <div style={styles.nav}>
        <button
          onClick={() => window.location.href = '/admin'}
          style={styles.navBtn}
        >
          📊 Dashboard
        </button>
        <button
          onClick={() => window.location.href = '/admin/stores'}
          style={styles.navBtn}
        >
          🏪 Stores
        </button>
        <button
          onClick={() => window.location.href = '/admin/users'}
          style={styles.navBtn}
        >
          👥 Users
        </button>
        <button
          onClick={() => window.location.href = '/admin/products'}
          style={styles.navBtn}
        >
          📦 Products
        </button>
        <button
          onClick={() => window.location.href = '/admin/orders'}
          style={styles.navBtn}
        >
          📋 Orders
        </button>
        <button
          onClick={() => window.location.href = '/admin/whatsapp'}
          style={styles.navBtn}
        >
          💬 WhatsApp
        </button>
      </div>

      {/* Stats Cards */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>🏪</div>
          <div style={styles.statValue}>{stats.total_stores || 0}</div>
          <div style={styles.statLabel}>Total Stores</div>
        </div>
        
        <div style={styles.statCard}>
          <div style={styles.statIcon}>👥</div>
          <div style={styles.statValue}>{stats.total_users || 0}</div>
          <div style={styles.statLabel}>Total Users</div>
        </div>
        
        <div style={styles.statCard}>
          <div style={styles.statIcon}>📋</div>
          <div style={styles.statValue}>{stats.total_orders || 0}</div>
          <div style={styles.statLabel}>Total Orders</div>
        </div>
        
        <div style={styles.statCard}>
          <div style={styles.statIcon}>💰</div>
          <div style={styles.statValue}>₹{stats.total_revenue?.toFixed(0) || 0}</div>
          <div style={styles.statLabel}>Total Revenue</div>
        </div>
      </div>

      {/* Today's Stats */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>📈 Today's Activity</h2>
        <div style={styles.todayStats}>
          <div style={styles.todayItem}>
            <span style={styles.todayLabel}>New Orders:</span>
            <span style={styles.todayValue}>{stats.today_orders || 0}</span>
          </div>
          <div style={styles.todayItem}>
            <span style={styles.todayLabel}>New Users:</span>
            <span style={styles.todayValue}>{stats.today_users || 0}</span>
          </div>
          <div style={styles.todayItem}>
            <span style={styles.todayLabel}>Revenue:</span>
            <span style={styles.todayValue}>₹{stats.today_revenue?.toFixed(0) || 0}</span>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      {stats.recent_activity && stats.recent_activity.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>🕐 Recent Activity</h2>
          <div style={styles.activityList}>
            {stats.recent_activity.map((activity, i) => (
              <div key={i} style={styles.activityItem}>
                <div style={styles.activityIcon}>{activity.icon || '📌'}</div>
                <div style={styles.activityInfo}>
                  <div style={styles.activityText}>{activity.text}</div>
                  <div style={styles.activityTime}>{activity.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Stores */}
      {stats.top_stores && stats.top_stores.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>🏆 Top Performing Stores</h2>
          <div style={styles.topStores}>
            {stats.top_stores.map((store, i) => (
              <div key={i} style={styles.topStoreItem}>
                <div style={styles.topStoreRank}>{i + 1}</div>
                <div style={styles.topStoreInfo}>
                  <div style={styles.topStoreName}>{store.name}</div>
                  <div style={styles.topStoreStats}>
                    {store.orders} orders • ₹{store.revenue?.toFixed(0)}
                  </div>
                </div>
              </div>
            ))}
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
    marginBottom: 24,
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
  logoutBtn: {
    padding: '10px 20px',
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  nav: {
    display: 'flex',
    gap: 8,
    marginBottom: 24,
    overflowX: 'auto',
    paddingBottom: 8,
  },
  navBtn: {
    padding: '10px 20px',
    background: '#f3f4f6',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 20,
    textAlign: 'center',
  },
  statIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  section: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    margin: '0 0 16px 0',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  todayStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 16,
  },
  todayItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  todayLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  todayValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  activityItem: {
    display: 'flex',
    gap: 12,
    padding: 12,
    background: '#f9fafb',
    borderRadius: 8,
  },
  activityIcon: {
    fontSize: 20,
  },
  activityInfo: {
    flex: 1,
  },
  activityText: {
    fontSize: 14,
    color: '#1f2937',
    marginBottom: 4,
  },
  activityTime: {
    fontSize: 12,
    color: '#6b7280',
  },
  topStores: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  topStoreItem: {
    display: 'flex',
    gap: 12,
    padding: 12,
    background: '#f9fafb',
    borderRadius: 8,
  },
  topStoreRank: {
    width: 32,
    height: 32,
    background: '#3b82f6',
    color: '#fff',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },
  topStoreInfo: {
    flex: 1,
  },
  topStoreName: {
    fontSize: 15,
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: 4,
  },
  topStoreStats: {
    fontSize: 13,
    color: '#6b7280',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    fontSize: 18,
    color: '#666',
  },
  error: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    fontSize: 18,
    color: '#ef4444',
  },
};
