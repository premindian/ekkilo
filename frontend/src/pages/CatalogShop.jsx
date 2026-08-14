import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = '';

/**
 * Ekkilo Shop — Blinkit-class browse, but for local kiranas.
 * Browse categories → pick products → Daily/Monthly cart → Order (store compare).
 */
export default function CatalogShop({ onOrder }) {
  const { token } = useAuth();
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('all');
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [cart, setCart] = useState({}); // id -> { product, qty }
  const [listTarget, setListTarget] = useState('daily'); // daily | monthly
  const [saving, setSaving] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [toast, setToast] = useState('');
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 720 : true
  );
  const [showPictures, setShowPictures] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadProducts();
  }, [category, query]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/preferences?token=${encodeURIComponent(token)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.show_product_pictures === 'boolean') {
          setShowPictures(data.show_product_pictures);
        }
      } catch (e) {
        /* keep default */
      }
    })();
  }, [token]);

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 720);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadCategories = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/catalog/categories`);
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadProducts = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams();
      if (category && category !== 'all') params.set('category', category);
      if (query) params.set('search', query);
      params.set('limit', '80');
      const res = await fetch(`${API_BASE}/api/catalog/products?${params}`);
      if (!res.ok) {
        setProducts([]);
        setLoadError('Could not load products. Please try again.');
        return;
      }
      const data = await res.json();
      if (!data || !Array.isArray(data.items)) {
        setProducts([]);
        setLoadError('Could not load products. Please try again.');
        return;
      }
      setProducts(data.items);
    } catch (e) {
      console.error(e);
      setProducts([]);
      setLoadError('Could not load products. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartCount = useMemo(
    () => cartItems.reduce((s, x) => s + (x.qty || 0), 0),
    [cartItems]
  );

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  const addProduct = (p) => {
    setCart((prev) => {
      const cur = prev[p.id];
      const qty = (cur?.qty || 0) + 1;
      return { ...prev, [p.id]: { product: p, qty } };
    });
    setShowCart(true);
  };

  const setQty = (id, qty) => {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else if (next[id]) next[id] = { ...next[id], qty };
      return next;
    });
  };

  const ensureList = async (kind) => {
    const name = kind === 'daily' ? 'Daily List' : 'Monthly List';
    const res = await fetch(`${API_BASE}/api/grocery-lists?token=${token}`);
    const lists = await res.json();
    const all = Array.isArray(lists) ? lists : [];
    let found = all.find((l) => (l.name || '').toLowerCase() === name.toLowerCase());
    if (!found) {
      const create = await fetch(`${API_BASE}/api/grocery-lists?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, is_default: kind === 'monthly' }),
      });
      found = await create.json();
    }
    return found;
  };

  const saveToList = async () => {
    if (!cartCount) {
      flash('Add items first');
      return;
    }
    if (!token) {
      flash('Please log in');
      return;
    }
    setSaving(true);
    try {
      const list = await ensureList(listTarget);
      if (!list?.id) throw new Error('list');
      for (const row of cartItems) {
        const p = row.product;
        await fetch(`${API_BASE}/api/grocery-lists/${list.id}/items?token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_name: p.name,
            quantity: row.qty || 1,
            unit: p.unit || 'item',
          }),
        });
      }
      flash(`Saved to ${listTarget === 'daily' ? 'Daily' : 'Monthly'} list`);
    } catch (e) {
      flash('Could not save list');
    } finally {
      setSaving(false);
    }
  };

  const orderNow = async () => {
    if (!cartCount) {
      flash('Add items first');
      return;
    }
    // Persist to chosen list, then hand off search text to Order page
    try {
      await saveToList();
    } catch (e) {
      /* still allow order */
    }
    const text = cartItems
      .map((row) => {
        const n = row.product.name;
        const q = row.qty > 1 ? ` ${row.qty}` : '';
        return `${n}${q}`;
      })
      .join(', ');
    if (onOrder) onOrder(text);
  };

  const activeCat = categories.find((c) => c.slug === category) || categories[0];

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes ekkiloPulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
      `}</style>
      {/* Hero — Ekkilo, not Blinkit yellow */}
      <div style={styles.hero}>
        <div style={styles.heroTag}>Shop local kiranas</div>
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon}>🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setQuery(search.trim())}
            placeholder='Search "milk", "atta", "onion"…'
            style={styles.searchInput}
          />
          <button
            type="button"
            onClick={() => setQuery(search.trim())}
            style={styles.searchBtn}
          >
            Go
          </button>
        </div>
        <p style={styles.heroSub}>
          Pick for Daily or Monthly — then compare prices across your kiranas. Nothing is auto-added.
          {' '}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('app:show-onboarding'))}
            style={styles.howLink}
          >
            How it works
          </button>
        </p>
      </div>

      {/* Category chips (horizontal bestsellers feel) */}
      <div style={styles.catScroll}>
        {categories.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => setCategory(c.slug)}
            style={{
              ...styles.catChip,
              ...(category === c.slug ? styles.catChipActive : {}),
            }}
          >
            <span style={styles.catIcon}>{c.icon || '🛒'}</span>
            <span style={styles.catLabel}>{c.name}</span>
            {c.product_count > 0 && category !== c.slug ? (
              <span style={styles.catCount}>{c.product_count}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Split: sidebar + grid (Blinkit pattern, Ekkilo colors) */}
      <div style={styles.split}>
        {!isNarrow && (
          <aside style={styles.sidebar}>
            {categories
              .filter((c) => c.slug !== 'all')
              .map((c) => (
                <button
                  key={`side-${c.slug}`}
                  type="button"
                  onClick={() => setCategory(c.slug)}
                  style={{
                    ...styles.sideItem,
                    ...(category === c.slug ? styles.sideItemActive : {}),
                  }}
                >
                  <span style={styles.sideEmoji}>{c.icon}</span>
                  <span style={styles.sideText}>{c.name}</span>
                </button>
              ))}
          </aside>
        )}

        <main style={styles.main}>
          <div style={styles.mainHead}>
            <h2 style={styles.mainTitle}>
              {activeCat?.icon} {activeCat?.name || 'All'}
            </h2>
            <span style={styles.mainMeta}>{products.length} shown</span>
          </div>

          {loading ? (
            <div style={styles.skelGrid} aria-busy="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ ...styles.card, ...styles.skelCard, animationDelay: `${i * 0.08}s` }}>
                  <div style={styles.skelImg} />
                  <div style={styles.cardBody}>
                    <div style={styles.skelLine} />
                    <div style={{ ...styles.skelLine, width: '60%' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div style={styles.empty}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
              {loadError}
              <div style={{ marginTop: 12 }}>
                <button type="button" onClick={loadProducts} style={styles.retryBtn}>
                  Retry
                </button>
              </div>
            </div>
          ) : products.length === 0 ? (
            <div style={styles.empty}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🧺</div>
              <div style={{ fontWeight: 800, color: '#334155', marginBottom: 6 }}>
                {query ? 'No matches' : 'Catalog is still filling up'}
              </div>
              <div style={{ maxWidth: 280, margin: '0 auto', lineHeight: 1.45 }}>
                {query
                  ? 'Try another category or a shorter search.'
                  : 'Browse Prices and search milk, atta, oil — or ask admin to import the starter CSV.'}
              </div>
            </div>
          ) : (
            <div style={styles.grid}>
              {products.map((p) => {
                const inCart = cart[p.id];
                return (
                  <article key={p.id} style={styles.card}>
                    {showPictures && (
                      <div style={styles.imgWrap}>
                        <img
                          src={p.image_url}
                          alt={p.name}
                          style={styles.img}
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.opacity = '0.35';
                          }}
                        />
                      </div>
                    )}
                    <div style={styles.cardBody}>
                      <div style={styles.metaRow}>
                        <span style={styles.unit}>{p.unit_note || ' '}</span>
                        {inCart ? (
                          <div style={styles.qtyCtrl}>
                            <button
                              type="button"
                              style={styles.qtyBtn}
                              onClick={() => setQty(p.id, inCart.qty - 1)}
                            >
                              −
                            </button>
                            <span style={styles.qtyNum}>{inCart.qty}</span>
                            <button
                              type="button"
                              style={styles.qtyBtn}
                              onClick={() => setQty(p.id, inCart.qty + 1)}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            style={styles.addBtn}
                            onClick={() => addProduct(p)}
                          >
                            ADD
                          </button>
                        )}
                      </div>
                      <div style={styles.name}>{p.name}</div>
                      {p.brand ? <div style={styles.brand}>{p.brand}</div> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Sticky selection bar */}
      {cartCount > 0 && (
        <div style={styles.sticky}>
          <div style={styles.stickyInner}>
            <div style={styles.targetRow}>
              <span style={styles.targetLabel}>Add to</span>
              <button
                type="button"
                onClick={() => setListTarget('daily')}
                style={{
                  ...styles.targetChip,
                  ...(listTarget === 'daily' ? styles.targetChipOn : {}),
                }}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => setListTarget('monthly')}
                style={{
                  ...styles.targetChip,
                  ...(listTarget === 'monthly' ? styles.targetChipOn : {}),
                }}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setShowCart((v) => !v)}
                style={styles.viewCart}
              >
                {cartCount} selected ▾
              </button>
            </div>
            {showCart && (
              <div style={styles.cartPanel}>
                {cartItems.map((row) => (
                  <div key={row.product.id} style={styles.cartRow}>
                    <span style={{ flex: 1 }}>{row.product.name}</span>
                    <div style={styles.qtyCtrl}>
                      <button
                        type="button"
                        style={styles.qtyBtn}
                        onClick={() => setQty(row.product.id, row.qty - 1)}
                      >
                        −
                      </button>
                      <span style={styles.qtyNum}>{row.qty}</span>
                      <button
                        type="button"
                        style={styles.qtyBtn}
                        onClick={() => setQty(row.product.id, row.qty + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={styles.stickyActions}>
              <button
                type="button"
                disabled={saving}
                onClick={saveToList}
                style={styles.secondaryCta}
              >
                Save to list
              </button>
              <button type="button" onClick={orderNow} style={styles.primaryCta}>
                Find kirana prices →
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

const green = '#16a34a';
const orange = '#ea580c';

const styles = {
  page: {
    minHeight: '100vh',
    width: '100%',
    maxWidth: '100%',
    overflowX: 'hidden',
    boxSizing: 'border-box',
    background: 'linear-gradient(180deg, #ecfdf5 0%, #f8fafc 28%, #f8fafc 100%)',
    paddingBottom: 140,
    fontSize: 16,
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
  },
  hero: {
    padding: '16px 16px 8px',
    background: 'linear-gradient(135deg, #14532d 0%, #166534 45%, #ea580c 160%)',
    color: '#fff',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  heroTag: {
    display: 'inline-block',
    fontSize: 12,
    fontWeight: 700,
    background: 'rgba(255,255,255,0.18)',
    padding: '6px 10px',
    borderRadius: 999,
    marginBottom: 12,
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#fff',
    borderRadius: 14,
    padding: '4px 4px 4px 12px',
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
  },
  searchIcon: { fontSize: 16 },
  searchInput: {
    flex: 1,
    minWidth: 0,
    border: 'none',
    outline: 'none',
    fontSize: 15,
    padding: '10px 0',
    color: '#111',
    background: 'transparent',
  },
  searchBtn: {
    border: 'none',
    background: green,
    color: '#fff',
    fontWeight: 700,
    borderRadius: 10,
    padding: '10px 14px',
    cursor: 'pointer',
  },
  heroSub: {
    margin: '10px 2px 4px',
    fontSize: 13,
    opacity: 0.9,
    lineHeight: 1.4,
  },
  howLink: {
    display: 'inline',
    padding: 0,
    margin: 0,
    border: 'none',
    background: 'none',
    color: '#fff',
    fontWeight: 700,
    textDecoration: 'underline',
    cursor: 'pointer',
    fontSize: 13,
  },
  catScroll: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: '14px 12px 6px',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    WebkitOverflowScrolling: 'touch',
    overscrollBehaviorX: 'contain',
  },
  catChip: {
    flex: '0 0 auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    width: 76,
    border: '1px solid #e5e7eb',
    background: '#fff',
    borderRadius: 14,
    padding: '10px 6px',
    cursor: 'pointer',
  },
  catChipActive: {
    borderColor: green,
    boxShadow: `0 0 0 2px ${green}33`,
    background: '#f0fdf4',
  },
  catIcon: { fontSize: 22 },
  catLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 1.2,
  },
  catCount: { fontSize: 10, color: '#9ca3af' },
  split: {
    display: 'flex',
    gap: 0,
    marginTop: 8,
    minHeight: 420,
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflowX: 'hidden',
  },
  sidebar: {
    width: 84,
    flexShrink: 0,
    background: '#fff',
    borderRight: '1px solid #e5e7eb',
    maxHeight: '70vh',
    overflowY: 'auto',
    position: 'sticky',
    top: 0,
    boxSizing: 'border-box',
  },
  sideItem: {
    width: '100%',
    border: 'none',
    background: 'transparent',
    padding: '12px 6px',
    cursor: 'pointer',
    borderLeft: '3px solid transparent',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  sideItemActive: {
    background: '#f0fdf4',
    borderLeft: `3px solid ${green}`,
  },
  sideEmoji: { fontSize: 20 },
  sideText: {
    fontSize: 10,
    fontWeight: 600,
    color: '#4b5563',
    textAlign: 'center',
    lineHeight: 1.15,
  },
  main: {
    flex: '1 1 0%',
    minWidth: 0,
    padding: '6px 8px 16px',
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '100%',
  },
  mainHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
    padding: '0 2px',
    minWidth: 0,
  },
  mainTitle: { margin: 0, fontSize: 16, fontWeight: 800, color: '#111' },
  mainMeta: { fontSize: 11, color: '#6b7280' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
    columnGap: 8,
    rowGap: 10,
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  card: {
    background: '#fff',
    borderRadius: 10,
    border: '1px solid #eceff3',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    boxSizing: 'border-box',
  },
  retryBtn: {
    border: `1.5px solid ${green}`,
    background: '#fff',
    color: green,
    fontWeight: 700,
    borderRadius: 10,
    padding: '8px 16px',
    cursor: 'pointer',
  },
  imgWrap: {
    aspectRatio: '1 / 0.92',
    background: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
  cardBody: {
    padding: '6px 8px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    flex: 1,
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    minHeight: 28,
  },
  unit: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: 600,
    lineHeight: 1.2,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  name: {
    fontSize: 12,
    fontWeight: 600,
    color: '#111',
    lineHeight: 1.25,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  brand: {
    fontSize: 10,
    color: '#9ca3af',
    lineHeight: 1.2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  addBtn: {
    flexShrink: 0,
    border: `1.5px solid ${green}`,
    background: '#fff',
    color: green,
    fontWeight: 800,
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    letterSpacing: 0.3,
    cursor: 'pointer',
    lineHeight: 1.2,
  },
  qtyCtrl: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    background: green,
    borderRadius: 6,
    padding: '1px 2px',
    color: '#fff',
    flexShrink: 0,
  },
  qtyBtn: {
    border: 'none',
    background: 'transparent',
    color: '#fff',
    fontWeight: 800,
    fontSize: 14,
    width: 22,
    height: 22,
    cursor: 'pointer',
    lineHeight: 1,
    padding: 0,
  },
  qtyNum: { minWidth: 14, textAlign: 'center', fontWeight: 800, fontSize: 12 },
  empty: {
    textAlign: 'center',
    padding: 40,
    color: '#6b7280',
    fontSize: 14,
  },
  sticky: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    padding: '0 10px max(10px, env(safe-area-inset-bottom, 0px))',
    pointerEvents: 'none',
  },
  skelGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 10,
  },
  skelCard: {
    animation: 'ekkiloPulse 1.2s ease-in-out infinite',
  },
  skelImg: {
    height: 110,
    background: '#e5e7eb',
    borderRadius: '12px 12px 0 0',
  },
  skelLine: {
    height: 12,
    width: '80%',
    background: '#e5e7eb',
    borderRadius: 6,
    marginBottom: 8,
  },
  stickyInner: {
    pointerEvents: 'auto',
    maxWidth: 560,
    margin: '0 auto',
    background: '#fff',
    borderRadius: 16,
    boxShadow: '0 12px 40px rgba(15,23,42,0.18)',
    border: '1px solid #e5e7eb',
    padding: 12,
  },
  targetRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  targetLabel: { fontSize: 12, color: '#6b7280', fontWeight: 600 },
  targetChip: {
    border: '1px solid #d1d5db',
    background: '#f9fafb',
    borderRadius: 999,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  targetChipOn: {
    background: '#fff7ed',
    borderColor: orange,
    color: orange,
  },
  viewCart: {
    marginLeft: 'auto',
    border: 'none',
    background: 'transparent',
    color: '#166534',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  },
  cartPanel: {
    maxHeight: 160,
    overflowY: 'auto',
    borderTop: '1px solid #f3f4f6',
    borderBottom: '1px solid #f3f4f6',
    marginBottom: 8,
    padding: '6px 0',
  },
  cartRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
    fontSize: 13,
  },
  stickyActions: { display: 'flex', gap: 8 },
  secondaryCta: {
    flex: 1,
    border: '1px solid #d1d5db',
    background: '#fff',
    borderRadius: 12,
    padding: '12px 10px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  primaryCta: {
    flex: 1.4,
    border: 'none',
    background: `linear-gradient(90deg, ${green}, #15803d)`,
    color: '#fff',
    borderRadius: 12,
    padding: '12px 10px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  toast: {
    position: 'fixed',
    left: '50%',
    bottom: 120,
    transform: 'translateX(-50%)',
    background: '#111827',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: 999,
    fontSize: 13,
    zIndex: 50,
    whiteSpace: 'nowrap',
  },
};
