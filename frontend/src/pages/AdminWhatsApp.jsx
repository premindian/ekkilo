import { useState, useEffect } from 'react';
import { navigate } from '../utils/navigate';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

export default function AdminWhatsApp() {
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [searchPhone, setSearchPhone] = useState('');
  const [live, setLive] = useState(false);
  const [inbound, setInbound] = useState([]);
  const [listError, setListError] = useState('');

  useEffect(() => {
    if (token) {
      loadStats();
      loadMessages();
      loadInbound();
    }
  }, [token]);

  // Live updates via WebSocket
  useEffect(() => {
    if (!token) return undefined;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${window.location.host}/ws/admin`;
    let ws;
    let closed = false;
    let retryTimer;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => setLive(true);
        ws.onclose = () => {
          setLive(false);
          if (!closed) retryTimer = setTimeout(connect, 4000);
        };
        ws.onerror = () => setLive(false);
        ws.onmessage = () => {
          // Refresh on any admin broadcast (message_update / new_order / inbound)
          loadStats();
          loadMessages();
          loadInbound();
        };
      } catch (err) {
        setLive(false);
        retryTimer = setTimeout(connect, 4000);
      }
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      if (ws) ws.close();
    };
  }, [token]);

  const loadStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/whatsapp/stats?token=${token}`);
      const data = await res.json();
      if (!res.ok) {
        console.error('Failed to load stats:', data);
        return;
      }
      setStats(data || {});
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadMessages = async () => {
    setLoading(true);
    setListError('');
    try {
      // Always load the full recent list; status tabs filter client-side
      let url = `${API_BASE}/api/admin/whatsapp/messages?token=${token}&limit=200`;
      if (searchPhone) {
        url += `&phone=${encodeURIComponent(searchPhone)}`;
      }

      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof data.detail === 'string' ? data.detail : `Failed to load messages (${res.status})`;
        console.error('Failed to load messages:', data);
        setListError(detail);
        setMessages([]);
        return;
      }
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load messages:', err);
      setListError('Cannot reach server for WhatsApp messages');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const normalizeStatus = (status) => String(status || 'PENDING').trim().toUpperCase();

  const statusCount = (key) => {
    if (key === 'ALL') return messages.length;
    return messages.filter((m) => normalizeStatus(m.status) === key).length;
  };

  const visibleMessages =
    filter === 'ALL'
      ? messages
      : messages.filter((m) => normalizeStatus(m.status) === filter);

  const loadInbound = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/whatsapp/inbound?token=${token}&limit=20`);
      const data = await res.json();
      setInbound(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load inbound webhooks:', err);
    }
  };

  const resendMessage = async (messageId) => {
    if (!window.confirm('Resend this message?')) return;
    
    try {
      await fetch(`${API_BASE}/api/admin/whatsapp/resend/${messageId}?token=${token}`, {
        method: 'POST'
      });
      alert('Message queued for resend!');
      loadMessages();
    } catch (err) {
      alert('Failed to resend message');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      PENDING: '#fbbf24',
      SENT: '#60a5fa',
      DELIVERED: '#34d399',
      READ: '#22c55e',
      FAILED: '#ef4444'
    };
    return colors[status] || '#9ca3af';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>💬 WhatsApp Messages</h1>
          <p style={styles.subtitle}>
            {visibleMessages.length}
            {filter !== 'ALL' ? ` ${filter}` : ''} / {messages.length} messages{' '}
            <span style={{ color: live ? '#22c55e' : '#9ca3af', fontSize: 12 }}>
              ● {live ? 'Live' : 'Connecting...'}
            </span>
          </p>
        </div>
        <button onClick={() => navigate('/admin')} style={styles.backBtn}>
          ← Back
        </button>
      </div>

      {/* Stats Cards */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{stats.total_messages || 0}</div>
          <div style={styles.statLabel}>Total</div>
        </div>
        <div style={styles.statCard}>
          <div style={{...styles.statValue, color: '#fbbf24'}}>{stats.pending || 0}</div>
          <div style={styles.statLabel}>Pending</div>
        </div>
        <div style={styles.statCard}>
          <div style={{...styles.statValue, color: '#60a5fa'}}>{stats.sent || 0}</div>
          <div style={styles.statLabel}>Sent</div>
        </div>
        <div style={styles.statCard}>
          <div style={{...styles.statValue, color: '#22c55e'}}>{stats.delivered || 0}</div>
          <div style={styles.statLabel}>Delivered</div>
        </div>
        <div style={styles.statCard}>
          <div style={{...styles.statValue, color: '#16a34a'}}>{stats.read || 0}</div>
          <div style={styles.statLabel}>Read</div>
        </div>
        <div style={styles.statCard}>
          <div style={{...styles.statValue, color: '#ef4444'}}>{stats.failed || 0}</div>
          <div style={styles.statLabel}>Failed</div>
        </div>
      </div>

      {/* Inbound webhook diagnostic */}
      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
          <b>📥 Inbound from Meta (STATUS# / ACCEPT#)</b>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`${API_BASE}/api/admin/whatsapp/subscribe-waba?token=${token}`, { method: 'POST' });
                  const data = await res.json();
                  alert(data.ok
                    ? `✅ Subscribed to WABA ${data.waba_id}\nNow reply STATUS#1 on WhatsApp again.`
                    : `❌ ${data.error || JSON.stringify(data)}`);
                  loadInbound();
                } catch (e) {
                  alert('Subscribe failed');
                }
              }}
              style={{ ...styles.searchBtn, background: '#ea580c' }}
            >
              Fix inbound (subscribe WABA)
            </button>
            <button onClick={loadInbound} style={styles.searchBtn}>Refresh</button>
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#9a3412', marginTop: 0 }}>
          <b>messages</b> can be toggled ON in Meta but inbound still fails until the app is subscribed to the WhatsApp Business Account.
          Click <b>Fix inbound</b>, wait for redeploy/startup, then reply <code>STATUS#1</code> again.
          If this list stays empty, Meta is still not delivering.
        </p>
        {inbound.length === 0 ? (
          <div style={{ fontSize: 13, color: '#666' }}>No inbound webhook events yet.</div>
        ) : (
          <div style={{ maxHeight: 180, overflow: 'auto', fontSize: 13 }}>
            {inbound.map((ev) => (
              <div key={ev.id} style={{ padding: '6px 0', borderBottom: '1px solid #ffedd5' }}>
                <b>{ev.kind}</b> · {formatDate(ev.created_at)} · {ev.phone || '-'} · {ev.text || ''}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        {['ALL', 'PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={filter === f ? styles.filterBtnActive : styles.filterBtn}
          >
            {f} ({statusCount(f)})
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={styles.searchBox}>
        <input
          type="text"
          placeholder="Search by phone number..."
          value={searchPhone}
          onChange={(e) => setSearchPhone(e.target.value)}
          style={styles.searchInput}
        />
        <button onClick={loadMessages} style={styles.searchBtn}>
          🔍 Search
        </button>
      </div>

      {listError && (
        <div style={{ ...styles.empty, color: '#b91c1c', background: '#fef2f2', borderRadius: 8, marginBottom: 12 }}>
          {listError}
        </div>
      )}

      {/* Messages Table */}
      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : visibleMessages.length === 0 ? (
        <div style={styles.empty}>
          {messages.length === 0
            ? 'No messages found'
            : `No ${filter} messages (try ALL — ${messages.length} total loaded)`}
        </div>
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Time</th>
                <th style={styles.th}>Phone</th>
                <th style={styles.th}>Message</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Order</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleMessages.map(msg => (
                <tr key={msg.id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={styles.dateCell}>
                      <div>{formatDate(msg.created_at)}</div>
                      {msg.delivered_at && (
                        <div style={styles.smallText}>✓ {formatDate(msg.delivered_at)}</div>
                      )}
                    </div>
                  </td>
                  <td style={styles.td}>{msg.phone}</td>
                  <td style={styles.td}>
                    <div style={styles.messageCell}>{msg.message}</div>
                  </td>
                  <td style={styles.td}>
                    <span style={{...styles.statusBadge, background: getStatusColor(normalizeStatus(msg.status))}}>
                      {normalizeStatus(msg.status)}
                    </span>
                    {msg.attempts > 0 && (
                      <div style={styles.smallText}>Attempts: {msg.attempts}</div>
                    )}
                    {msg.last_error && (
                      <div style={{...styles.smallText, color: '#ef4444'}}>
                        {msg.last_error.substring(0, 50)}...
                      </div>
                    )}
                  </td>
                  <td style={styles.td}>
                    {msg.final_order_id ? (
                      <div>
                        <div>Order #{msg.final_order_id}</div>
                        {msg.order_customer && (
                          <div style={styles.smallText}>{msg.order_customer}</div>
                        )}
                      </div>
                    ) : '-'}
                  </td>
                  <td style={styles.td}>
                    {normalizeStatus(msg.status) === 'FAILED' && (
                      <button 
                        onClick={() => resendMessage(msg.id)}
                        style={styles.resendBtn}
                      >
                        🔄 Resend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '20px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    margin: 0,
  },
  subtitle: {
    color: '#666',
    margin: '5px 0 0 0',
  },
  backBtn: {
    padding: '10px 20px',
    background: '#f3f4f6',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  },
  statCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1f2937',
  },
  statLabel: {
    fontSize: '14px',
    color: '#6b7280',
    marginTop: '5px',
  },
  filters: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  filterBtn: {
    padding: '10px 20px',
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  filterBtnActive: {
    padding: '10px 20px',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  searchBox: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
  },
  searchInput: {
    flex: 1,
    padding: '10px 15px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
  },
  searchBtn: {
    padding: '10px 20px',
    background: '#22c55e',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#9ca3af',
  },
  empty: {
    textAlign: 'center',
    padding: '40px',
    color: '#9ca3af',
  },
  tableContainer: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    overflow: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '15px',
    textAlign: 'left',
    borderBottom: '2px solid #e5e7eb',
    fontWeight: '600',
    color: '#374151',
    background: '#f9fafb',
  },
  tr: {
    borderBottom: '1px solid #f3f4f6',
  },
  td: {
    padding: '15px',
    verticalAlign: 'top',
  },
  dateCell: {
    fontSize: '14px',
  },
  messageCell: {
    maxWidth: '300px',
    whiteSpace: 'pre-wrap',
    fontSize: '14px',
    lineHeight: '1.5',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'white',
  },
  smallText: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  },
  resendBtn: {
    padding: '6px 12px',
    background: '#f59e0b',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
  },
};
