import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

export default function GroceryListsPage({ onSelectList }) {
  const { token } = useAuth();
  const [lists, setLists] = useState([]);
  const [items, setItems] = useState([]);
  const [input, setInput] = useState('');
  const [listId, setListId] = useState(null);
  const [listName, setListName] = useState('');
  const [loading, setLoading] = useState(true);
  const [newListName, setNewListName] = useState('');
  const [showNewList, setShowNewList] = useState(false);

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
          setLists([created]);
          await loadItems(created.id, created.name);
        }
      } else {
        const selected =
          all.find((l) => l.id === preferId) ||
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

      const uniqueItems = [];
      const seen = new Set();
      for (const item of data.items || []) {
        const key = item.product_name.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          uniqueItems.push(item);
        }
      }
      setItems(uniqueItems);
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

  const handleDeleteList = async () => {
    if (!listId) return;
    if (lists.length <= 1) {
      alert('Keep at least one list');
      return;
    }
    if (!window.confirm(`Delete list "${listName}"?`)) return;
    await fetch(`${API_BASE}/api/grocery-lists/${listId}?token=${token}`, {
      method: 'DELETE'
    });
    await loadLists();
  };

  const addItem = async () => {
    if (!input.trim() || !listId) return;
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
        setItems([...items, newItem]);
        setInput('');
      }
    } catch (err) {
      alert('Failed to add item');
    }
  };

  const deleteItem = async (itemId) => {
    if (!listId) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/grocery-lists/${listId}/items/${itemId}?token=${token}`,
        { method: 'DELETE' }
      );
      if (res.ok) setItems(items.filter((i) => i.id !== itemId));
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const clearAll = async () => {
    if (!window.confirm('Remove all items from list?')) return;
    for (const item of items) {
      await deleteItem(item.id);
    }
  };

  const quickOrder = async () => {
    if (!listId || items.length === 0) return;
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
          <button onClick={() => setShowNewList(true)} style={s.newBtn}>+ New List</button>
        </div>

        <div style={s.listPicker}>
          {lists.map((l) => (
            <button
              key={l.id}
              onClick={() => loadItems(l.id, l.name)}
              style={l.id === listId ? s.chipActive : s.chip}
            >
              {l.name} ({l.item_count || 0})
            </button>
          ))}
        </div>

        <div style={s.currentListBar}>
          <strong>{listName}</strong>
          {lists.length > 1 && (
            <button onClick={handleDeleteList} style={s.deleteListBtn}>Delete list</button>
          )}
        </div>

        <div style={s.addBox}>
          <input
            type="text"
            placeholder='Type: "rice 5kg", "amul milk 2 liters"...'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addItem()}
            style={s.input}
          />
          <button onClick={addItem} style={s.addBtn}>+ Add</button>
        </div>

        {items.length > 0 && (
          <div style={s.header}>
            <span style={s.count}>{items.length} items</span>
            <button onClick={clearAll} style={s.clearBtn}>Clear All</button>
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
                <button onClick={() => deleteItem(item.id)} style={s.deleteBtn}>×</button>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <button onClick={quickOrder} style={s.orderBtn}>
            🛒 Order All ({items.length} items)
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCreateList} style={s.addBtn}>Create</button>
              <button onClick={() => setShowNewList(false)} style={s.clearBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page: { background: '#f9fafb', minHeight: '100vh', padding: '20px 0' },
  container: { maxWidth: 600, margin: 'auto', padding: 20 },
  loading: { textAlign: 'center', padding: 60, color: '#999' },
  titleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 28, fontWeight: 'bold', margin: 0, color: '#111' },
  newBtn: { padding: '8px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  listPicker: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { padding: '8px 12px', borderRadius: 20, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13 },
  chipActive: { padding: '8px 12px', borderRadius: 20, border: 'none', background: '#667eea', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  currentListBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  deleteListBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 },
  addBox: { display: 'flex', gap: 10, marginBottom: 20 },
  input: { flex: 1, width: '100%', padding: 16, border: '2px solid #e5e7eb', borderRadius: 12, fontSize: 15, background: '#fff', boxSizing: 'border-box' },
  addBtn: { padding: '16px 28px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 'bold' },
  header: { display: 'flex', justifyContent: 'space-between', marginBottom: 12 },
  count: { color: '#666', fontSize: 14 },
  clearBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  empty: { textAlign: 'center', padding: 40, color: '#999' },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: 14, borderRadius: 10, border: '1px solid #eee' },
  itemName: { fontSize: 15, fontWeight: 500 },
  deleteBtn: { background: 'none', border: 'none', fontSize: 22, color: '#999', cursor: 'pointer' },
  orderBtn: { width: '100%', marginTop: 20, padding: 16, background: '#22c55e', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalBox: { background: '#fff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 400 },
};
