import { useState, useEffect } from 'react';
import { navigate } from '../utils/navigate';
import { useAuth } from '../context/AuthContext';

const API_BASE = '';

const emptyRow = () => ({ product_key: '', display_name: '', price: '', unit_note: '' });

export default function AdminQcBenchmarks() {
  const { token } = useAuth();
  const [baskets, setBaskets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [city, setCity] = useState('Visakhapatnam');
  const [source, setSource] = useState('blinkit');
  const [sampledOn, setSampledOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [items, setItems] = useState([emptyRow(), emptyRow(), emptyRow()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (token) loadBaskets();
  }, [token]);

  const loadBaskets = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/qc-benchmarks?token=${token}`);
      const data = await res.json();
      setBaskets(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const cleanItems = () =>
    items
      .map((it) => ({
        product_key: (it.product_key || it.display_name || '').trim(),
        display_name: (it.display_name || it.product_key || '').trim(),
        price: it.price,
        unit_note: (it.unit_note || '').trim(),
      }))
      .filter((it) => it.product_key && String(it.price).trim() !== '');

  const runSanity = async () => {
    const payload = {
      city,
      source,
      items: cleanItems(),
    };
    const res = await fetch(`${API_BASE}/api/admin/qc-benchmarks/sanity?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
    return data.warnings || [];
  };

  const saveDraft = async () => {
    const rows = cleanItems();
    if (!city.trim()) {
      alert('City required');
      return;
    }
    if (rows.length === 0) {
      alert('Add at least one item with a price');
      return;
    }
    setSaving(true);
    try {
      const warns = await runSanity();
      const hard = (warns || []).filter((w) => w.level === 'error');
      if (hard.length) {
        alert(hard[0].message);
        setSaving(false);
        return;
      }
      if ((warns || []).length) {
        const ok = window.confirm(
          `${warns.length} sanity warning(s).\n\nSave as DRAFT anyway?\n(Customers only see published baskets.)`
        );
        if (!ok) {
          setSaving(false);
          return;
        }
      }
      const res = await fetch(`${API_BASE}/api/admin/qc-benchmarks?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city,
          source,
          sampled_on: sampledOn,
          note,
          proof_url: proofUrl,
          proof_note: proofNote,
          status: 'draft',
          items: rows,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.detail || 'Save failed');
        return;
      }
      setShowForm(false);
      setItems([emptyRow(), emptyRow(), emptyRow()]);
      setWarnings([]);
      loadBaskets();
      alert('Saved as draft. Review, then Publish when ready.');
    } catch (e) {
      alert('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const publish = async (id) => {
    if (!window.confirm('Publish this sample? Customers will use it for estimates.')) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/qc-benchmarks/${id}/publish?token=${token}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.detail || 'Publish failed');
        return;
      }
      if (data.warnings?.length) {
        alert(`Published with ${data.warnings.length} warning(s) — spot-check proof if needed.`);
      }
      loadBaskets();
    } catch (e) {
      alert('Publish failed');
    }
  };

  const unpublish = async (id) => {
    if (!window.confirm('Unpublish? Customers will stop seeing this sample.')) return;
    await fetch(`${API_BASE}/api/admin/qc-benchmarks/${id}/unpublish?token=${token}`, {
      method: 'POST',
    });
    loadBaskets();
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this basket permanently?')) return;
    await fetch(`${API_BASE}/api/admin/qc-benchmarks/${id}?token=${token}`, { method: 'DELETE' });
    loadBaskets();
  };

  const updateItem = (idx, field, value) => {
    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>📊 QC Price Samples</h1>
          <p style={styles.subtitle}>
            Weekly Blinkit / Instamart estimates — draft → review → publish. Not live prices.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/admin')} style={styles.secondaryBtn}>← Admin</button>
          <button
            onClick={() => {
              setShowForm(true);
              setWarnings([]);
            }}
            style={styles.primaryBtn}
          >
            + New sample
          </button>
        </div>
      </div>

      <div style={styles.hint}>
        Tip: keep a screenshot link in Proof URL. Second person should Publish only after checking warnings.
      </div>

      {showForm && (
        <div style={styles.card}>
          <h3 style={{ marginTop: 0 }}>New weekly sample (starts as draft)</h3>
          <div style={styles.formGrid}>
            <label style={styles.label}>
              City
              <input value={city} onChange={(e) => setCity(e.target.value)} style={styles.input} />
            </label>
            <label style={styles.label}>
              Source
              <select value={source} onChange={(e) => setSource(e.target.value)} style={styles.input}>
                <option value="blinkit">Blinkit</option>
                <option value="instamart">Instamart</option>
                <option value="zepto">Zepto</option>
                <option value="typical_qc">Typical QC (blend)</option>
              </select>
            </label>
            <label style={styles.label}>
              Sampled on
              <input type="date" value={sampledOn} onChange={(e) => setSampledOn(e.target.value)} style={styles.input} />
            </label>
          </div>
          <label style={styles.label}>
            Note
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Vizag evening prices" style={styles.input} />
          </label>
          <label style={styles.label}>
            Proof URL (Drive / photo link)
            <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="https://..." style={styles.input} />
          </label>
          <label style={styles.label}>
            Proof note
            <input value={proofNote} onChange={(e) => setProofNote(e.target.value)} placeholder="Screenshot on my phone, Aug 13" style={styles.input} />
          </label>

          <div style={{ marginTop: 16, fontWeight: 600 }}>Items</div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
            product key = short match name (milk, rice 5kg). Display name optional.
          </div>
          {items.map((row, idx) => (
            <div key={idx} style={styles.itemRow}>
              <input
                placeholder="product key"
                value={row.product_key}
                onChange={(e) => updateItem(idx, 'product_key', e.target.value)}
                style={{ ...styles.input, flex: 1.2 }}
              />
              <input
                placeholder="display name"
                value={row.display_name}
                onChange={(e) => updateItem(idx, 'display_name', e.target.value)}
                style={{ ...styles.input, flex: 1.2 }}
              />
              <input
                placeholder="₹ price"
                value={row.price}
                onChange={(e) => updateItem(idx, 'price', e.target.value)}
                style={{ ...styles.input, flex: 0.7 }}
              />
              <input
                placeholder="unit"
                value={row.unit_note}
                onChange={(e) => updateItem(idx, 'unit_note', e.target.value)}
                style={{ ...styles.input, flex: 0.6 }}
              />
            </div>
          ))}
          <button type="button" onClick={() => setItems((p) => [...p, emptyRow()])} style={styles.linkBtn}>
            + Add row
          </button>

          {warnings.length > 0 && (
            <div style={styles.warnBox}>
              <strong>Sanity checks</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {warnings.map((w, i) => (
                  <li key={i} style={{ color: w.level === 'error' ? '#b91c1c' : '#b45309' }}>
                    {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={runSanity} style={styles.secondaryBtn} disabled={saving}>Check sanity</button>
            <button onClick={saveDraft} style={styles.primaryBtn} disabled={saving}>
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button onClick={() => setShowForm(false)} style={styles.linkBtn}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, color: '#666' }}>Loading…</div>
      ) : baskets.length === 0 ? (
        <div style={styles.empty}>No samples yet. Add a weekly Blinkit/Instamart basket.</div>
      ) : (
        <div style={styles.list}>
          {baskets.map((b) => (
            <div key={b.id} style={styles.card}>
              <div style={styles.rowBetween}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    {b.city} · {b.source}
                    <span style={b.status === 'published' ? styles.badgeLive : styles.badgeDraft}>
                      {b.status || 'draft'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                    Sampled {b.sampled_on} · {b.item_count} items · ₹{Number(b.basket_total || 0).toFixed(2)}
                  </div>
                  {b.note && <div style={{ fontSize: 13, marginTop: 4 }}>{b.note}</div>}
                  {(b.proof_url || b.proof_note) && (
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                      Proof: {b.proof_note || ''}{' '}
                      {b.proof_url ? (
                        <a href={b.proof_url} target="_blank" rel="noreferrer">open link</a>
                      ) : null}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {b.status !== 'published' ? (
                    <button onClick={() => publish(b.id)} style={styles.primaryBtn}>Publish</button>
                  ) : (
                    <button onClick={() => unpublish(b.id)} style={styles.secondaryBtn}>Unpublish</button>
                  )}
                  <button onClick={() => remove(b.id)} style={styles.dangerBtn}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 900, margin: '0 auto', padding: 20 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  title: { margin: 0, fontSize: 26, fontWeight: 'bold' },
  subtitle: { margin: '4px 0 0', color: '#6b7280', fontSize: 14 },
  hint: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 12, fontSize: 13, color: '#1e3a8a', marginBottom: 16 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, marginBottom: 10 },
  input: { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, fontWeight: 400 },
  itemRow: { display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  primaryBtn: { padding: '10px 14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' },
  secondaryBtn: { padding: '10px 14px', background: '#f3f4f6', color: '#111', border: '1px solid #e5e7eb', borderRadius: 8, fontWeight: 600, cursor: 'pointer' },
  dangerBtn: { padding: '10px 14px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' },
  linkBtn: { padding: '8px 10px', background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600 },
  warnBox: { marginTop: 12, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 12, fontSize: 13 },
  list: { display: 'flex', flexDirection: 'column', gap: 0 },
  rowBetween: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  badgeLive: { marginLeft: 8, fontSize: 11, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 999, fontWeight: 700, textTransform: 'uppercase' },
  badgeDraft: { marginLeft: 8, fontSize: 11, background: '#f3f4f6', color: '#4b5563', padding: '2px 8px', borderRadius: 999, fontWeight: 700, textTransform: 'uppercase' },
  empty: { padding: 40, textAlign: 'center', color: '#999' },
};
