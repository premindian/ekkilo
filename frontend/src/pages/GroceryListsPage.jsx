import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = "https://ekkilo.onrender.com";

export default function GroceryListsPage({ onSelectList, onClose }) {
  const { token } = useAuth();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [selectedList, setSelectedList] = useState(null);

  useEffect(() => {
    loadLists();
  }, []);

  const loadLists = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists?token=${token}`);
      const data = await res.json();
      setLists(data);
    } catch (err) {
      console.error('Failed to load lists:', err);
    } finally {
      setLoading(false);
    }
  };

  const createList = async () => {
    if (!newListName.trim()) return;

    try {
      await fetch(`${API_BASE}/api/grocery-lists?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newListName })
      });

      setNewListName('');
      setShowNewList(false);
      loadLists();
    } catch (err) {
      alert('Failed to create list');
    }
  };

  const deleteList = async (listId) => {
    if (!window.confirm('Delete this list?')) return;

    try {
      await fetch(`${API_BASE}/api/grocery-lists/${listId}?token=${token}`, {
        method: 'DELETE'
      });
      loadLists();
    } catch (err) {
      alert('Failed to delete list');
    }
  };

  const openListDetail = async (list) => {
    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists/${list.id}?token=${token}`);
      const data = await res.json();
      setSelectedList(data);
    } catch (err) {
      alert('Failed to load list details');
    }
  };

  const quickOrder = async (listId) => {
    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists/${listId}/quick-order?token=${token}`, {
        method: 'POST'
      });
      const data = await res.json();
      
      if (onSelectList) {
        onSelectList(data.search_text);
        onClose && onClose();
      }
    } catch (err) {
      alert('Failed to create quick order');
    }
  };

  if (selectedList) {
    return (
      <ListDetailView
        list={selectedList}
        token={token}
        onBack={() => { setSelectedList(null); loadLists(); }}
        onQuickOrder={() => quickOrder(selectedList.list.id)}
      />
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>📋 My Grocery Lists</h2>
        {onClose && (
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        )}
      </div>

      {loading ? (
        <p style={styles.loading}>Loading...</p>
      ) : (
        <>
          <button
            onClick={() => setShowNewList(true)}
            style={styles.newListBtn}
          >
            ➕ New List
          </button>

          {showNewList && (
            <div style={styles.newListBox}>
              <input
                type="text"
                placeholder="List name (e.g. Monthly Groceries)"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                style={styles.input}
                autoFocus
              />
              <div style={styles.buttonRow}>
                <button onClick={createList} style={styles.saveBtn}>Save</button>
                <button onClick={() => setShowNewList(false)} style={styles.cancelBtn}>Cancel</button>
              </div>
            </div>
          )}

          <div style={styles.listsContainer}>
            {lists.length === 0 ? (
              <p style={styles.emptyText}>No lists yet. Create your first one! 🎉</p>
            ) : (
              lists.map((list) => (
                <div key={list.id} style={styles.listCard}>
                  <div style={styles.listInfo} onClick={() => openListDetail(list)}>
                    <h3 style={styles.listName}>
                      {list.name}
                      {list.is_default && <span style={styles.defaultBadge}>Default</span>}
                    </h3>
                    <p style={styles.itemCount}>{list.item_count || 0} items</p>
                  </div>
                  <div style={styles.listActions}>
                    <button
                      onClick={() => quickOrder(list.id)}
                      style={styles.orderBtn}
                      disabled={!list.item_count}
                    >
                      🛒 Quick Order
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteList(list.id); }}
                      style={styles.deleteBtn}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Common grocery items for quick add
const COMMON_ITEMS = [
  { name: 'Milk', unit: 'l' },
  { name: 'Rice', unit: 'kg' },
  { name: 'Oil', unit: 'l' },
  { name: 'Sugar', unit: 'kg' },
  { name: 'Bread', unit: 'unit' },
  { name: 'Eggs', unit: 'unit' },
  { name: 'Flour', unit: 'kg' },
  { name: 'Salt', unit: 'kg' }
];

// List Detail Component
function ListDetailView({ list, token, onBack, onQuickOrder }) {
  const [items, setItems] = useState(list.items || []);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ product_name: '', quantity: 1, unit: 'kg' });

  const addItem = async () => {
    if (!newItem.product_name.trim()) {
      alert('Please enter a product name');
      return;
    }

    if (!newItem.quantity || newItem.quantity <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists/${list.list.id}/items?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newItem,
          quantity: parseFloat(newItem.quantity)
        })
      });
      const data = await res.json();
      
      setItems([...items, data]);
      setNewItem({ product_name: '', quantity: 1, unit: 'kg' });
      setShowAddItem(false);
    } catch (err) {
      alert('Failed to add item');
    }
  };

  const quickAddItem = (itemName, unit) => {
    setNewItem({ product_name: itemName, quantity: 1, unit });
    setShowAddItem(true);
  };

  const deleteItem = async (itemId) => {
    try {
      await fetch(`${API_BASE}/api/grocery-lists/${list.list.id}/items/${itemId}?token=${token}`, {
        method: 'DELETE'
      });
      setItems(items.filter(i => i.id !== itemId));
    } catch (err) {
      alert('Failed to delete item');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backBtn}>← Back</button>
        <h2 style={styles.title}>{list.list.name}</h2>
      </div>

      <button onClick={() => setShowAddItem(true)} style={styles.addItemBtn}>
        ➕ Add Item
      </button>

      {showAddItem ? (
        <div style={styles.addItemBox}>
          <h4 style={styles.formTitle}>Add New Item</h4>
          <input
            type="text"
            placeholder="Product name (e.g., Milk, Rice, Oil...)"
            value={newItem.product_name}
            onChange={(e) => setNewItem({ ...newItem, product_name: e.target.value })}
            onKeyPress={(e) => e.key === 'Enter' && addItem()}
            style={styles.input}
            autoFocus
          />
          <div style={styles.quantityRow}>
            <div style={styles.quantityGroup}>
              <label style={styles.label}>Quantity</label>
              <input
                type="number"
                min="0.1"
                step="0.5"
                placeholder="1"
                value={newItem.quantity}
                onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                onKeyPress={(e) => e.key === 'Enter' && addItem()}
                style={styles.quantityInput}
              />
            </div>
            <div style={styles.quantityGroup}>
              <label style={styles.label}>Unit</label>
              <select
                value={newItem.unit}
                onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                style={styles.unitSelect}
              >
                <option value="kg">kg</option>
                <option value="l">L</option>
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="unit">unit</option>
              </select>
            </div>
          </div>
          <div style={styles.buttonRow}>
            <button onClick={addItem} style={styles.saveBtn}>✓ Add</button>
            <button onClick={() => { setShowAddItem(false); setNewItem({ product_name: '', quantity: 1, unit: 'kg' }); }} style={styles.cancelBtn}>✕ Cancel</button>
          </div>
        </div>
      ) : (
        <div style={styles.quickAddSection}>
          <p style={styles.quickAddTitle}>Quick Add:</p>
          <div style={styles.quickAddGrid}>
            {COMMON_ITEMS.map((item, idx) => (
              <button
                key={idx}
                onClick={() => quickAddItem(item.name, item.unit)}
                style={styles.quickAddBtn}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={styles.itemsList}>
        {items.length === 0 ? (
          <p style={styles.emptyText}>No items in this list yet</p>
        ) : (
          items.map((item) => (
            <div key={item.id} style={styles.itemCard}>
              <div>
                <p style={styles.itemName}>{item.product_name}</p>
                <p style={styles.itemQty}>{item.quantity} {item.unit}</p>
              </div>
              <button onClick={() => deleteItem(item.id)} style={styles.deleteIconBtn}>
                🗑️
              </button>
            </div>
          ))
        )}
      </div>

      {items.length > 0 && (
        <button onClick={onQuickOrder} style={styles.quickOrderBtnLarge}>
          🛒 Order All Items
        </button>
      )}
    </div>
  );
}

const styles = {
  container: { padding: 20, maxWidth: 600, margin: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', margin: 0 },
  closeBtn: { background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999' },
  backBtn: { background: '#f3f4f6', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' },
  loading: { textAlign: 'center', padding: 40, color: '#999' },
  newListBtn: { width: '100%', padding: 14, background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer', marginBottom: 20 },
  newListBox: { background: '#f9fafb', padding: 16, borderRadius: 8, marginBottom: 20 },
  addItemBox: { background: '#f9fafb', padding: 20, borderRadius: 12, marginBottom: 20, border: '2px solid #e5e7eb' },
  formTitle: { fontSize: 16, fontWeight: '600', marginTop: 0, marginBottom: 12, color: '#333' },
  input: { width: '100%', padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' },
  quantityRow: { display: 'flex', gap: 12, marginBottom: 12 },
  quantityGroup: { flex: 1 },
  label: { display: 'block', fontSize: 12, color: '#666', marginBottom: 6, fontWeight: '500' },
  quantityInput: { width: '100%', padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 16, fontWeight: '500', boxSizing: 'border-box' },
  unitSelect: { width: '100%', padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', background: '#fff' },
  buttonRow: { display: 'flex', gap: 8 },
  quickAddSection: { marginBottom: 20 },
  quickAddTitle: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 10 },
  quickAddGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  quickAddBtn: { padding: '10px 8px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontSize: 13, transition: 'all 0.2s', ':hover': { background: '#f3f4f6' } },
  saveBtn: { flex: 1, padding: 10, background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  cancelBtn: { flex: 1, padding: 10, background: '#e5e7eb', border: 'none', borderRadius: 8, cursor: 'pointer' },
  listsContainer: { display: 'flex', flexDirection: 'column', gap: 12 },
  emptyText: { textAlign: 'center', color: '#999', padding: 40 },
  listCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' },
  listInfo: { flex: 1 },
  listName: { fontSize: 18, fontWeight: 'bold', margin: '0 0 4px 0' },
  defaultBadge: { marginLeft: 8, background: '#22c55e', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12 },
  itemCount: { fontSize: 14, color: '#666', margin: 0 },
  listActions: { display: 'flex', gap: 8 },
  orderBtn: { padding: '8px 16px', background: '#667eea', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 },
  deleteBtn: { padding: '8px 12px', background: '#fee', border: 'none', borderRadius: 8, cursor: 'pointer' },
  addItemBtn: { width: '100%', padding: 12, background: '#667eea', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', marginBottom: 16 },
  itemsList: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 },
  itemCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: 16, margin: '0 0 4px 0', fontWeight: 500 },
  itemQty: { fontSize: 14, color: '#666', margin: 0 },
  deleteIconBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' },
  quickOrderBtnLarge: { width: '100%', padding: 16, background: '#22c55e', color: '#fff', border: 'none', borderRadius: 12, fontSize: 18, fontWeight: 'bold', cursor: 'pointer' }
};
