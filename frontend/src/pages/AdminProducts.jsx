import { useState, useEffect, useRef } from 'react';
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
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);
  const csvRef = useRef(null);

  useEffect(() => {
    if (token) loadProducts();
  }, [token, search]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const url = search
        ? `${API_BASE}/api/admin/products?token=${token}&search=${encodeURIComponent(search)}&limit=500`
        : `${API_BASE}/api/admin/products?token=${token}&limit=500`;
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
    setImageUrl('');
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setName(p.name || '');
    setBrand(p.brand || '');
    setVariant(p.variant || '');
    setSize(p.size ?? '');
    setUnit(p.unit || 'unit');
    setImageUrl(p.image_url || '');
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
          body: JSON.stringify({
            name,
            brand,
            variant,
            size: size || 1,
            unit,
            image_url: imageUrl.trim() || null,
          }),
        });
      } else {
        const res = await fetch(`${API_BASE}/api/admin/products?token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, brand, variant, size: size || 1, unit }),
        });
        const created = await res.json();
        if (created?.id && imageUrl.trim()) {
          await fetch(`${API_BASE}/api/admin/products/${created.id}?token=${token}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url: imageUrl.trim() }),
          });
        }
      }
      setShowModal(false);
      loadProducts();
    } catch (err) {
      alert('Failed to save product');
    }
  };

  const uploadImage = async (productId, file) => {
    if (!file || !productId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(
        `${API_BASE}/api/admin/products/${productId}/image?token=${token}`,
        { method: 'POST', body: fd }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Upload failed');
      }
      // Preview locally while list refreshes
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') setImageUrl(reader.result);
      };
      reader.readAsDataURL(file);
      await loadProducts();
    } catch (e) {
      alert(e.message || 'Upload failed (max ~350KB JPEG/PNG)');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const clearImage = async (productId) => {
    if (!productId) {
      setImageUrl('');
      return;
    }
    try {
      await fetch(`${API_BASE}/api/admin/products/${productId}/image?token=${token}`, {
        method: 'DELETE',
      });
      setImageUrl('');
      loadProducts();
    } catch (err) {
      alert('Failed to clear image');
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

  const downloadTemplate = (withSamples = true) => {
    window.location.href = `${API_BASE}/api/admin/products/import-template?token=${encodeURIComponent(token)}&samples=${withSamples ? 'true' : 'false'}`;
  };

  const importCsv = async (file) => {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE}/api/admin/products/import?token=${token}`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || 'Import failed');
      }
      setImportResult(data);
      loadProducts();
    } catch (e) {
      alert(e.message || 'Import failed');
    } finally {
      setImporting(false);
      if (csvRef.current) csvRef.current.value = '';
    }
  };

  const seedStarter = async () => {
    if (!window.confirm('Load built-in starter SKUs? Existing products are skipped.')) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/products/seed-starter?token=${encodeURIComponent(token)}`,
        { method: 'POST' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Seed failed');
      setImportResult(data);
      loadProducts();
    } catch (e) {
      alert(e.message || 'Seed failed');
    } finally {
      setImporting(false);
    }
  };

  const thumb = (url) => {
    if (!url) return null;
    return (
      <img
        src={url}
        alt=""
        style={styles.thumb}
        onError={(e) => {
          e.target.style.display = 'none';
        }}
      />
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>📦 Product Catalog</h1>
          <p style={styles.subtitle}>{products.length} products · photos show in Shop</p>
        </div>
        <div style={styles.headerActions}>
          <button onClick={openAdd} style={styles.addBtn}>+ Add Product</button>
          <button onClick={() => navigate('/admin')} style={styles.backBtn}>← Back</button>
        </div>
      </div>

      <div style={styles.importBox}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={styles.importTitle}>Bulk import (CSV)</div>
          <p style={styles.importHint}>
            Download starter list (~50 SKUs), edit in Excel, upload. Duplicates are skipped.
            Categories: vegetables-fruits, dairy, staples, oils, spices, snacks, bakery, beverages, personal-care, household.
          </p>
          {importResult && (
            <p style={styles.importStats}>
              Added {importResult.created} · skipped {importResult.skipped}
              {importResult.failed_count ? ` · failed ${importResult.failed_count}` : ''}
              {importResult.parse_error_count ? ` · warnings ${importResult.parse_error_count}` : ''}
            </p>
          )}
        </div>
        <div style={styles.importActions}>
          <button
            type="button"
            onClick={seedStarter}
            disabled={importing}
            style={styles.addBtn}
          >
            {importing ? 'Loading…' : 'Load starter catalog'}
          </button>
          <button type="button" onClick={() => downloadTemplate(true)} style={styles.templateBtn}>
            Download starter CSV
          </button>
          <button type="button" onClick={() => downloadTemplate(false)} style={styles.backBtn}>
            Empty template
          </button>
          <label style={{ ...styles.uploadBtn, opacity: importing ? 0.7 : 1 }}>
            {importing ? 'Importing…' : 'Upload CSV'}
            <input
              ref={csvRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCsv(f);
              }}
            />
          </label>
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
              <div style={styles.cardLeft}>
                {p.image_url ? (
                  thumb(p.image_url)
                ) : (
                  <div style={styles.thumbEmpty}>📷</div>
                )}
                <div>
                  <div style={styles.name}>{p.name}</div>
                  <div style={styles.meta}>
                    {[p.brand, p.variant, p.size && `${p.size}${p.unit || ''}`].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
              </div>
              <div style={styles.actions}>
                <label style={styles.uploadBtn}>
                  Photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadImage(p.id, f);
                      e.target.value = '';
                    }}
                  />
                </label>
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
            <div style={styles.photoBlock}>
              {imageUrl ? (
                <img src={imageUrl} alt="" style={styles.preview} />
              ) : (
                <div style={styles.previewEmpty}>No photo yet</div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {editing && (
                  <label style={styles.uploadBtn}>
                    {uploading ? 'Uploading…' : 'Upload photo'}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      style={{ display: 'none' }}
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadImage(editing.id, f);
                      }}
                    />
                  </label>
                )}
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => clearImage(editing?.id)}
                    style={styles.backBtn}
                  >
                    Clear photo
                  </button>
                )}
              </div>
              <input
                placeholder="Or paste image URL (https://…)"
                value={imageUrl.startsWith('data:') ? '' : imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                style={styles.input}
              />
              <p style={styles.hint}>Upload max ~350KB, or paste a lasting URL. Shop uses this photo.</p>
            </div>
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
  importBox: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 16,
    background: '#f0fdfa',
    border: '1px solid #99f6e4',
    borderRadius: 12,
  },
  importTitle: { fontWeight: 700, fontSize: 15, marginBottom: 4 },
  importHint: { margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.45 },
  importStats: { margin: '8px 0 0', fontSize: 13, fontWeight: 600, color: '#0f766e' },
  importActions: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  templateBtn: {
    padding: '10px 16px',
    background: '#0f766e',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
  },
  addBtn: { padding: '10px 16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  backBtn: { padding: '10px 16px', background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  searchBox: { marginBottom: 16 },
  searchInput: { width: '100%', padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' },
  empty: { textAlign: 'center', padding: 40, color: '#9ca3af' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  cardLeft: { display: 'flex', gap: 12, alignItems: 'center', minWidth: 0, flex: 1 },
  thumb: { width: 56, height: 56, objectFit: 'cover', borderRadius: 10, background: '#f3f4f6', flexShrink: 0 },
  thumbEmpty: {
    width: 56,
    height: 56,
    borderRadius: 10,
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    flexShrink: 0,
  },
  name: { fontWeight: 700, fontSize: 16 },
  meta: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  uploadBtn: {
    padding: '8px 12px',
    background: '#0f766e',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    display: 'inline-block',
  },
  editBtn: { padding: '8px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  deleteBtn: { padding: '8px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { background: '#fff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' },
  photoBlock: { marginBottom: 12 },
  preview: { width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 12, background: '#f9fafb', marginBottom: 8 },
  previewEmpty: {
    height: 100,
    borderRadius: 12,
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9ca3af',
    marginBottom: 8,
  },
  hint: { margin: '0 0 8px', fontSize: 12, color: '#6b7280' },
  input: { width: '100%', padding: 12, marginBottom: 10, border: '1px solid #e5e7eb', borderRadius: 8, boxSizing: 'border-box' },
};
