import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../components/BrandLogo';

const API_BASE = "";

export default function GroceryListsPage({ onSelectList }) {
  const { token } = useAuth();
  const [lists, setLists] = useState([]);
  const [items, setItems] = useState([]);
  const [input, setInput] = useState('');
  const [listId, setListId] = useState(null);
  const [listName, setListName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showNewList, setShowNewList] = useState(false);
  const [confirm, setConfirm] = useState(null); // { title, body, actionLabel, onConfirm }

  useEffect(() => {
    loadLists();
  }, []);

  const loadLists = async (preferId) => {
    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists?token=${token}`);
      const data = await res.json();
      const all = Array.isArray(data) ? data : [];
      setLists(all);

      if (all.length === 0) {
        const created = await createList('My Monthly List', true);
        if (created) {
          setLists([{ ...created, item_count: 0 }]);
          await loadItems(created.id, created.name);
        }
      } else {
        const selected =
          all.find((l) => l.id === preferId) ||
          all.find((l) => l.id === listId) ||
          all.find((l) => l.is_default) ||
          all[0];
        await loadItems(selected.id, selected.name);
      }
    } catch (err) {
      console.error('Setup failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const createList = async (name, isDefault = false) => {
    const res = await fetch(`${API_BASE}/api/grocery-lists?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, is_default: isDefault })
    });
    if (!res.ok) return null;
    return res.json();
  };

  const loadItems = async (id, name) => {
    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists/${id}?token=${token}`);
      const data = await res.json();
      setListId(id);
      setListName(name || data.list?.name || 'List');
      // Show every row — hiding duplicates made Clear All / Delete feel broken
      // when the chip said "(8)" but only 3 unique names were visible.
      const rows = Array.isArray(data.items) ? data.items : [];
      setItems(rows);
      setLists((prev) =>
        prev.map((l) => (l.id === id ? { ...l, item_count: rows.length } : l))
      );
    } catch (err) {
      console.error('Load failed:', err);
    }
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    const created = await createList(newListName.trim());
    if (created) {
      setShowNewList(false);
      setNewListName('');
      await loadLists(created.id);
    }
  };

  const askDeleteList = () => {
    if (!listId) return;
    if (lists.length <= 1) {
      setConfirm({
        title: 'Cannot delete',
        body: 'Keep at least one list. You can Clear All items instead.',
        actionLabel: 'OK',
        onConfirm: () => setConfirm(null),
      });
      return;
    }
    setConfirm({
      title: `Delete “${listName}”?`,
      body: 'This permanently removes the list and every item in it.',
      actionLabel: 'Delete list',
      danger: true,
      onConfirm: runDeleteList,
    });
  };

  const runDeleteList = async () => {
    if (!listId || busy) return;
    setBusy(true);
    setConfirm(null);
    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists/${listId}?token=${token}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('delete failed');
      setListId(null);
      setItems([]);
      await loadLists();
    } catch (err) {
      alert('Could not delete list. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const addItem = async () => {
    if (!input.trim() || !listId || busy) return;
    const product_name = input.trim();
    const isDuplicate = items.some(
      (i) => i.product_name.toLowerCase().trim() === product_name.toLowerCase()
    );
    if (isDuplicate) {
      alert(`"${product_name}" is already in your list!`);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists/${listId}/items?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_name, quantity: 1, unit: 'item' })
      });
      if (res.ok) {
        const newItem = await res.json();
        const next = [...items, newItem];
        setItems(next);
        setLists((prev) =>
          prev.map((l) => (l.id === listId ? { ...l, item_count: next.length } : l))
        );
        setInput('');
      }
    } catch (err) {
      alert('Failed to add item');
    }
  };

  const deleteItem = async (itemId) => {
    if (!listId || busy) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/grocery-lists/${listId}/items/${itemId}?token=${token}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        const next = items.filter((i) => i.id !== itemId);
        setItems(next);
        setLists((prev) =>
          prev.map((l) => (l.id === listId ? { ...l, item_count: next.length } : l))
        );
      }
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const askClearAll = () => {
    if (!items.length) return;
    setConfirm({
      title: 'Clear all items?',
      body: `Remove all ${items.length} items from “${listName}”? The list itself will stay.`,
      actionLabel: 'Clear all',
      danger: true,
      onConfirm: runClearAll,
    });
  };

  const runClearAll = async () => {
    if (!listId || busy) return;
    setBusy(true);
    setConfirm(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/grocery-lists/${listId}/items?token=${token}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('clear failed');
      setItems([]);
      setLists((prev) =>
        prev.map((l) => (l.id === listId ? { ...l, item_count: 0 } : l))
      );
    } catch (err) {
      alert('Could not clear list. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const quickOrder = async () => {
    if (!listId || items.length === 0 || busy) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/grocery-lists/${listId}/quick-order?token=${token}`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (onSelectList) onSelectList(data.search_text);
    } catch (err) {
      alert('Order failed');
    }
  };

  if (loading) return <div style={s.loading}>Loading...</div>;

  return (
    <div style={s.page}>
      <div style={s.container}>
        <div style={s.titleRow}>
          <h2 style={s.title}>📋 Grocery Lists</h2>
          <button onClick={() => setShowNewList(true)} style={s.newBtn} disabled={busy}>
            + New List
          </button>
        </div>

        <div style={s.listPicker}>
          {lists.map((l) => (
            <button
              key={l.id}
              onClick={() => loadItems(l.id, l.name)}
              style={l.id === listId ? s.chipActive : s.chip}
              disabled={busy}
            >
              {l.name} ({l.item_count || 0})
            </button>
          ))}
        </div>

        <div style={s.currentListBar}>
          <strong style={{ fontSize: 18 }}>{listName}</strong>
          <div style={s.listActions}>
            {items.length > 0 && (
              <button onClick={askClearAll} style={s.clearBtn} disabled={busy}>
                Clear items
              </button>
            )}
            {lists.length > 1 && (
              <button onClick={askDeleteList} style={s.deleteListBtn} disabled={busy}>
                {busy ? 'Working…' : 'Delete list'}
              </button>
            )}
          </div>
        </div>

        <div style={s.addBox}>
          <input
            type="text"
            placeholder='Type: "rice 5kg", "amul milk 2 liters"...'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addItem()}
            style={s.input}
            disabled={busy}
          />
          <button onClick={addItem} style={s.addBtn} disabled={busy}>+ Add</button>
        </div>

        {items.length > 0 && (
          <div style={s.header}>
            <span style={s.count}>{items.length} items</span>
          </div>
        )}

        <div style={s.list}>
          {items.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>📝</div>
              <p>This list is empty</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} style={s.item}>
                <div style={s.itemName}>{item.product_name}</div>
                <button
                  onClick={() => deleteItem(item.id)}
                  style={s.deleteBtn}
                  disabled={busy}
                  aria-label={`Remove ${item.product_name}`}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <button onClick={quickOrder} style={s.orderBtn} disabled={busy}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <BrandLogo variant="icon" height={18} alt="" />
              Order All ({items.length} items)
            </span>
          </button>
        )}
      </div>

      {showNewList && (
        <div style={s.modal} onClick={() => setShowNewList(false)}>
          <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Create new list</h3>
            <input
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="e.g. Weekly veggies"
              style={s.input}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={handleCreateList} style={s.addBtn}>Create</button>
              <button onClick={() => setShowNewList(false)} style={s.clearBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div style={s.modal} onClick={() => !busy && setConfirm(null)}>
          <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>{confirm.title}</h3>
            <p style={{ margin: '0 0 16px', color: '#4b5563', fontSize: 14, lineHeight: 1.45 }}>
              {confirm.body}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => confirm.onConfirm?.()}
                style={confirm.danger ? s.dangerBtn : s.addBtn}
                disabled={busy}
              >
                {confirm.actionLabel}
              </button>
              <button
                onClick={() => setConfirm(null)}
                style={s.secondaryBtn}
                disabled={busy}
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

const s = {
  page: {
    background: '#f9fafb',
    minHeight: '100vh',
    padding: '20px 0',
    width: '100%',
    maxWidth: '100%',
    overflowX: 'hidden',
    boxSizing: 'border-box',
  },
  container: {
    maxWidth: 600,
    margin: 'auto',
    padding: 20,
    width: '100%',
    boxSizing: 'border-box',
  },
  loading: { textAlign: 'center', padding: 60, color: '#999' },
  titleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 },
  title: { fontSize: 28, fontWeight: 'bold', margin: 0, color: '#111' },
  newBtn: { padding: '8px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  listPicker: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { padding: '8px 12px', borderRadius: 20, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13 },
  chipActive: { padding: '8px 12px', borderRadius: 20, border: 'none', background: '#667eea', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  currentListBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  listActions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  deleteListBtn: {
    padding: '8px 12px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    color: '#dc2626',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
  addBox: { display: 'flex', gap: 10, marginBottom: 20 },
  input: { flex: 1, width: '100%', padding: 16, border: '2px solid #e5e7eb', borderRadius: 12, fontSize: 15, background: '#fff', boxSizing: 'border-box' },
  addBtn: { padding: '16px 28px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 'bold' },
  header: { display: 'flex', justifyContent: 'space-between', marginBottom: 12 },
  count: { color: '#666', fontSize: 14 },
  clearBtn: {
    padding: '8px 12px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    color: '#b91c1c',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  secondaryBtn: {
    padding: '12px 16px',
    background: '#f3f4f6',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
  dangerBtn: {
    padding: '12px 16px',
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  empty: { textAlign: 'center', padding: 40, color: '#999' },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: 14, borderRadius: 10, border: '1px solid #eee' },
  itemName: { fontSize: 15, fontWeight: 500 },
  deleteBtn: { background: 'none', border: 'none', fontSize: 22, color: '#999', cursor: 'pointer' },
  orderBtn: { width: '100%', marginTop: 20, padding: 16, background: '#22c55e', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modalBox: { background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, boxSizing: 'border-box' },
};
