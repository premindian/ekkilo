import { useState, useEffect, useMemo } from 'react';
import { navigate } from '../utils/navigate';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

const STATUS_TABS = [
  { key: 'ALL', label: 'Total', color: '#1f2937' },
  { key: 'PENDING', label: 'Pending', color: '#fbbf24' },
  { key: 'SENT', label: 'Sent', color: '#60a5fa' },
  { key: 'DELIVERED', label: 'Delivered', color: '#22c55e' },
  { key: 'READ', label: 'Read', color: '#16a34a' },
  { key: 'FAILED', label: 'Failed', color: '#ef4444' },
];

function normalizeStatus(status) {
  return String(status || 'PENDING').trim().toUpperCase();
}

export default function AdminWhatsApp() {
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [searchPhone, setSearchPhone] = useState('');
  const [live, setLive] = useState(false);
  const [inbound, setInbound] = useState([]);
  const [listError, setListError] = useState('');

  const loadMessages = async () => {
    if (!token) return;
    setLoading(true);
    setListError('');
    try {
      let url = `${API_BASE}/api/admin/whatsapp/messages?token=${encodeURIComponent(token)}&limit=200`;
      if (searchPhone.trim()) {
        url += `&phone=${encodeURIComponent(searchPhone.trim())}`;
      }

      const res = await fetch(url);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const detail =
          typeof data?.detail === 'string'
            ? data.detail
            : `Failed to load messages (${res.status})`;
        setListError(detail);
        return;
      }
      if (!Array.isArray(data)) {
        setListError('Unexpected response loading messages');
        setMessages([]);
        return;
      }
      setMessages(
        data.map((m) => ({
          ...m,
          status: normalizeStatus(m.status),
          last_error: m.last_error != null ? String(m.last_error) : null,
          message: m.message != null ? String(m.message) : '',
        }))
      );
    } catch (err) {
      console.error('Failed to load messages:', err);
      setListError('Cannot reach server for WhatsApp messages');
    } finally {
      setLoading(false);
    }
  };

  const loadInbound = async () => {
    if (!token) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/whatsapp/inbound?token=${encodeURIComponent(token)}&limit=20`
      );
      const data = await res.json();
      setInbound(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load inbound webhooks:', err);
    }
  };

  useEffect(() => {
    if (token) {
      loadMessages();
      loadInbound();
    }
  }, [token]);

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

  const counts = useMemo(() => {
    const c = { ALL: messages.length, PENDING: 0, SENT: 0, DELIVERED: 0, READ: 0, FAILED: 0 };
    for (const m of messages) {
      const s = normalizeStatus(m.status);
      if (c[s] != null) c[s] += 1;
      else c.PENDING += 1; // unknown statuses show under Pending bucket
    }
    return c;
  }, [messages]);

  const visibleMessages = useMemo(() => {
    if (filter === 'ALL') return messages;
    return messages.filter((m) => normalizeStatus(m.status) === filter);
  }, [messages, filter]);

  const resendMessage = async (messageId) => {
    if (!window.confirm('Resend this message?')) return;
    try {
      await fetch(
        `${API_BASE}/api/admin/whatsapp/resend/${messageId}?token=${encodeURIComponent(token)}`,
        { method: 'POST' }
      );
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
      FAILED: '#ef4444',
    };
    return colors[status] || '#9ca3af';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return String(dateStr);
    return date.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>💬 WhatsApp Messages</h1>
          <p style={styles.subtitle}>
            Showing {visibleMessages.length} of {messages.length}{' '}
            <span style={{ color: live ? '#22c55e' : '#9ca3af', fontSize: 12 }}>
              ● {live ? 'Live' : 'Connecting...'}
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadMessages} style={styles.searchBtn}>
            🔄 Refresh
          </button>
          <button onClick={() => navigate('/admin')} style={styles.backBtn}>
            ← Back
          </button>
        </div>
      </div>

      {/* Clickable status tabs (these are the numbered cards) */}
      <div style={styles.statsGrid}>
        {STATUS_TABS.map((tab) => {
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              style={{
                ...styles.statCard,
                cursor: 'pointer',
                border: active ? `2px solid ${tab.color}` : '2px solid transparent',
                boxShadow: active
                  ? `0 0 0 3px ${tab.color}33`
                  : '0 1px 3px rgba(0,0,0,0.1)',
                background: active ? '#f8fafc' : '#fff',
              }}
            >
              <div style={{ ...styles.statValue, color: tab.color }}>
                {counts[tab.key] || 0}
              </div>
              <div style={styles.statLabel}>{tab.label}</div>
            </button>
          );
        })}
      </div>

      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
          <b>📥 Inbound from Meta (STATUS# / ACCEPT#)</b>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={async () => {
                try {
                  const res = await fetch(
                    `${API_BASE}/api/admin/whatsapp/subscribe-waba?token=${encodeURIComponent(token)}`,
                    { method: 'POST' }
                  );
                  const data = await res.json();
                  alert(
                    data.ok
                      ? `✅ Subscribed to WABA ${data.waba_id}\nNow reply STATUS#1 on WhatsApp again.`
                      : `❌ ${data.error || JSON.stringify(data)}`
                  );
                  loadInbound();
                } catch (e) {
                  alert('Subscribe failed');
                }
              }}
              style={{ ...styles.searchBtn, background: '#ea580c' }}
            >
              Fix inbound (subscribe WABA)
            </button>
            <button onClick={loadInbound} style={styles.searchBtn}>
              Refresh
            </button>
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#9a3412', marginTop: 0 }}>
          Click a status card above to filter the table. Counts come from the loaded messages.
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

      <div style={styles.searchBox}>
        <input
          type="text"
          placeholder="Search by phone number..."
          value={searchPhone}
          onChange={(e) => setSearchPhone(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadMessages()}
          style={styles.searchInput}
        />
        <button onClick={loadMessages} style={styles.searchBtn}>
          🔍 Search
        </button>
      </div>

      {listError && (
        <div
          style={{
            ...styles.empty,
            color: '#b91c1c',
            background: '#fef2f2',
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          {listError}
        </div>
      )}

      {loading && messages.length === 0 ? (
        <div style={styles.loading}>Loading...</div>
      ) : visibleMessages.length === 0 ? (
        <div style={styles.empty}>
          {messages.length === 0
            ? 'No messages found'
            : `No ${filter} messages in the loaded list. Click Total to see all ${messages.length}.`}
        </div>
      ) : (
        <div style={styles.tableContainer}>
          {loading && (
            <div style={{ padding: 8, fontSize: 12, color: '#6b7280' }}>Refreshing…</div>
          )}
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
              {visibleMessages.map((msg) => (
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
                    <span
                      style={{
                        ...styles.statusBadge,
                        background: getStatusColor(normalizeStatus(msg.status)),
                      }}
                    >
                      {normalizeStatus(msg.status)}
                    </span>
                    {Number(msg.attempts) > 0 && (
                      <div style={styles.smallText}>Attempts: {msg.attempts}</div>
                    )}
                    {msg.last_error && (
                      <div style={{ ...styles.smallText, color: '#ef4444' }}>
                        {String(msg.last_error).slice(0, 80)}
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
                    ) : (
                      '-'
                    )}
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '12px',
    marginBottom: '30px',
  },
  statCard: {
    background: 'white',
    padding: '16px',
    borderRadius: '12px',
    textAlign: 'center',
    font: 'inherit',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1f2937',
  },
  statLabel: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '5px',
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
    background: 'white',
    borderRadius: '12px',
  },
  tableContainer: {
    background: 'white',
    borderRadius: '12px',
    overflow: 'auto',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '600',
    color: '#6b7280',
    borderBottom: '1px solid #e5e7eb',
    background: '#f9fafb',
  },
  tr: {
    borderBottom: '1px solid #f3f4f6',
  },
  td: {
    padding: '12px 16px',
    fontSize: '14px',
    verticalAlign: 'top',
  },
  dateCell: {
    whiteSpace: 'nowrap',
  },
  smallText: {
    fontSize: '11px',
    color: '#9ca3af',
    marginTop: '4px',
  },
  messageCell: {
    maxWidth: '320px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: '13px',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: '999px',
    color: 'white',
    fontSize: '11px',
    fontWeight: 600,
  },
  resendBtn: {
    padding: '6px 10px',
    background: '#eff6ff',
    color: '#1d4ed8',
    border: '1px solid #bfdbfe',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
  },
};
