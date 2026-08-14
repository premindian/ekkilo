import { useState, useEffect } from 'react';
import { navigate } from '../utils/navigate';
import { useAuth } from '../context/AuthContext';

const API_BASE = '';

export default function AdminAudit() {
  const { token } = useAuth();
  const [events, setEvents] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [phone, setPhone] = useState('');
  const [storeId, setStoreId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    if (token) {
      loadEvents();
      loadRefunds();
    }
  }, [token]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ token, limit: '150' });
      if (action.trim()) params.set('action', action.trim());
      if (phone.trim()) params.set('phone', phone.trim());
      if (storeId.trim()) params.set('store_id', storeId.trim());
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await fetch(`${API_BASE}/api/admin/audit?${params}`);
      const data = await res.json();
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch (e) {
      console.error(e);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRefunds = async () => {
    try {
      const params = new URLSearchParams({ token, limit: '40', status: 'REQUESTED' });
      const res = await fetch(`${API_BASE}/api/admin/refund-requests?${params}`);
      const data = await res.json();
      setRefunds(Array.isArray(data.requests) ? data.requests : []);
    } catch (e) {
      console.error(e);
      setRefunds([]);
    }
  };

  const fmtDetails = (d) => {
    if (!d) return '—';
    try {
      return typeof d === 'string' ? d : JSON.stringify(d);
    } catch {
      return String(d);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Staff audit log</h1>
          <p style={styles.sub}>Who changed what in admin & store portals</p>
        </div>
        <button type="button" onClick={() => navigate('/admin')} style={styles.backBtn}>
          ← Back
        </button>
      </div>

      {refunds.length > 0 && (
        <div style={styles.refundBox}>
          <div style={styles.refundTitle}>UPI refund requests ({refunds.length})</div>
          <p style={styles.refundNote}>
            Manual today — process in Razorpay / bank, then follow up with the customer.
          </p>
          {refunds.map((r) => (
            <div key={r.id} style={styles.refundRow}>
              <strong>Order #{r.final_order_id}</strong>
              {' · '}
              {r.customer_phone || '—'}
              {' · '}
              ₹{Number(r.amount ?? r.order_total ?? 0).toFixed(2)}
              {r.created_at ? ` · ${new Date(r.created_at).toLocaleString()}` : ''}
              {r.reason ? ` · ${r.reason}` : ''}
            </div>
          ))}
        </div>
      )}

      <div style={styles.filters}>
        <input
          placeholder="Filter action (e.g. product, order, user)"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          style={styles.input}
        />
        <input
          placeholder="Actor phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={styles.input}
        />
        <input
          placeholder="Store ID"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          style={{ ...styles.input, flex: '0 0 100px', minWidth: 100 }}
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          style={styles.input}
          title="From date"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          style={styles.input}
          title="To date"
        />
        <button type="button" onClick={loadEvents} style={styles.refreshBtn}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : events.length === 0 ? (
        <div style={styles.empty}>No audit events yet. Staff actions will appear here.</div>
      ) : (
        <div style={styles.list}>
          {events.map((ev) => (
            <div key={ev.id} style={styles.card}>
              <div style={styles.row}>
                <span style={styles.action}>{ev.action}</span>
                <span style={styles.time}>
                  {ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}
                </span>
              </div>
              <div style={styles.meta}>
                <span style={styles.role}>{ev.actor_role || 'staff'}</span>
                {ev.actor_phone ? ` · ${ev.actor_phone}` : ''}
                {ev.store_id ? ` · store #${ev.store_id}` : ''}
                {ev.entity_type
                  ? ` · ${ev.entity_type}${ev.entity_id ? ` #${ev.entity_id}` : ''}`
                  : ''}
              </div>
              <div style={styles.details}>{fmtDetails(ev.details)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 900, margin: 'auto', padding: 20, fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  title: { margin: 0, fontSize: 26, fontWeight: 800 },
  sub: { margin: '4px 0 0', color: '#6b7280', fontSize: 14 },
  backBtn: { padding: '10px 14px', background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  filters: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  input: { flex: 1, minWidth: 140, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 },
  refreshBtn: { padding: '10px 14px', background: '#667eea', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  empty: { textAlign: 'center', padding: 40, color: '#9ca3af' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  action: { fontWeight: 700, fontSize: 15, color: '#111827' },
  time: { fontSize: 12, color: '#6b7280' },
  meta: { marginTop: 6, fontSize: 13, color: '#4b5563' },
  role: {
    display: 'inline-block',
    background: '#eef2ff',
    color: '#3730a3',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  details: {
    marginTop: 8,
    fontSize: 12,
    color: '#6b7280',
    wordBreak: 'break-word',
    fontFamily: 'ui-monospace, monospace',
  },
  refundBox: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  refundTitle: { fontWeight: 800, color: '#1e3a8a', marginBottom: 4 },
  refundNote: { margin: '0 0 10px', fontSize: 13, color: '#1e40af' },
  refundRow: { fontSize: 13, color: '#1e3a8a', padding: '6px 0', borderTop: '1px solid #dbeafe' },
};
