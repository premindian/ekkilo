import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = "https://ekkilo.onrender.com";

// Quick templates for common items
const QUICK_ITEMS = [
  { name: 'Milk', qty: 1, unit: 'l' },
  { name: 'Rice', qty: 1, unit: 'kg' },
  { name: 'Oil', qty: 1, unit: 'l' },
  { name: 'Bread', qty: 1, unit: 'unit' },
  { name: 'Eggs', qty: 12, unit: 'unit' },
  { name: 'Sugar', qty: 1, unit: 'kg' },
  { name: 'Salt', qty: 1, unit: 'kg' },
  { name: 'Flour', qty: 1, unit: 'kg' },
];

export default function GroceryListsPage({ onSelectList }) {
  const { token } = useAuth();
  const [lists, setLists] = useState([]);
  const [currentList, setCurrentList] = useState(null);
  const [items, setItems] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLists();
  }, []);

  const loadLists = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists?token=${token}`);
      const data = await res.json();
      setLists(data);
      
      // Load default or first list
      const defaultList = data.find(l => l.is_default) || data[0];
      if (defaultList) {
        loadList(defaultList.id);
      }
    } catch (err) {
      console.error('Load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadList = async (listId) => {
    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists/${listId}?token=${token}`);
      const data = await res.json();
      setCurrentList(data.list);
      setItems(data.items || []);
    } catch (err) {
      console.error('Load list failed:', err);
    }
  };

  const createList = async () => {
    const name = prompt('New list name:');
    if (!name) return;
    
    try {
      await fetch(`${API_BASE}/api/grocery-lists?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      loadLists();
    } catch (err) {
      alert('Failed to create list');
    }
  };

  const parseItem = (text) => {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return null;

    // Pattern: "item quantity unit" like "milk 2 liters" or "rice 1kg"
    const pattern = /^(.+?)\s*([\d.]+)\s*([a-z]+)$/;
    const match = normalized.match(pattern);

    if (match) {
      const [, name, qty, unitText] = match;
      
      // Normalize units
      const unitMap = {
        'l': 'l', 'liter': 'l', 'litre': 'l', 'liters': 'l',
        'ml': 'ml',
        'kg': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
        'g': 'g', 'gram': 'g', 'grams': 'g',
        'pc': 'unit', 'piece': 'unit', 'pieces': 'unit'
      };

      return {
        product_name: name.trim(),
        quantity: parseFloat(qty),
        unit: unitMap[unitText] || unitText
      };
    }

    // No quantity - default to 1 unit
    return {
      product_name: normalized,
      quantity: 1,
      unit: 'unit'
    };
  };

  const addItem = async (itemData = null) => {
    const parsed = itemData || parseItem(input);
    if (!parsed || !currentList) return;

    // Check for duplicates
    const exists = items.find(i => 
      i.product_name.toLowerCase() === parsed.product_name.toLowerCase()
    );
    
    if (exists) {
      if (!window.confirm(`${parsed.product_name} already in list. Add anyway?`)) {
        return;
      }
    }

    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists/${currentList.id}/items?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });
      const data = await res.json();
      
      setItems([...items, data]);
      setInput('');
    } catch (err) {
      alert('Failed to add item');
    }
  };

  const deleteItem = async (itemId) => {
    if (!currentList) return;
    
    try {
      await fetch(`${API_BASE}/api/grocery-lists/${currentList.id}/items/${itemId}?token=${token}`, {
        method: 'DELETE'
      });
      setItems(items.filter(i => i.id !== itemId));
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const adjustQuantity = (item, change) => {
    const newQty = Math.max(0.5, item.quantity + change);
    // Simple update: delete and re-add
    deleteItem(item.id);
    setTimeout(() => {
      addItem({
        product_name: item.product_name,
        quantity: newQty,
        unit: item.unit
      });
    }, 200);
  };

  const quickOrder = async () => {
    if (!currentList || items.length === 0) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists/${currentList.id}/quick-order?token=${token}`, {
        method: 'POST'
      });
      const data = await res.json();
      
      if (onSelectList) {
        onSelectList(data.search_text);
      }
    } catch (err) {
      alert('Quick order failed');
    }
  };

  if (loading) {
    return <div style={s.loading}>Loading...</div>;
  }

  return (
    <div style={s.container}>
      <h2 style={s.title}>📝 My Grocery List</h2>

      {/* LIST SELECTOR */}
      <div style={s.listBar}>
        <select 
          value={currentList?.id || ''} 
          onChange={(e) => loadList(e.target.value)}
          style={s.select}
        >
          {lists.map(l => (
            <option key={l.id} value={l.id}>
              {l.name} {l.is_default && '⭐'}
            </option>
          ))}
        </select>
        <button onClick={createList} style={s.newBtn}>+ New List</button>
      </div>

      {/* QUICK ADD BUTTONS */}
      <div style={s.quickSection}>
        <p style={s.quickTitle}>Quick Add:</p>
        <div style={s.quickGrid}>
          {QUICK_ITEMS.map((item, i) => (
            <button
              key={i}
              onClick={() => addItem(item)}
              style={s.quickBtn}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>

      {/* ADD ITEM INPUT */}
      <div style={s.addBox}>
        <input
          type="text"
          placeholder='Add item: "milk 2l" or "rice 1kg" or just "bread"'
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && addItem()}
          style={s.input}
        />
        <button onClick={() => addItem()} style={s.addBtn}>
          + Add
        </button>
      </div>

      {/* ITEMS LIST */}
      <div style={s.itemsList}>
        {items.length === 0 ? (
          <div style={s.empty}>
            <p>📝 Your list is empty</p>
            <p style={s.emptyHint}>Try quick-add buttons or type an item above</p>
          </div>
        ) : (
          <>
            <div style={s.itemsHeader}>
              <span>{items.length} items</span>
            </div>
            {items.map((item) => (
              <div key={item.id} style={s.item}>
                <div style={s.itemLeft}>
                  <div style={s.itemName}>{item.product_name}</div>
                  <div style={s.qtyRow}>
                    <button 
                      onClick={() => adjustQuantity(item, -0.5)} 
                      style={s.qtyBtn}
                    >
                      −
                    </button>
                    <span style={s.qty}>{item.quantity} {item.unit}</span>
                    <button 
                      onClick={() => adjustQuantity(item, 0.5)} 
                      style={s.qtyBtn}
                    >
                      +
                    </button>
                  </div>
                </div>
                <button 
                  onClick={() => deleteItem(item.id)} 
                  style={s.delBtn}
                >
                  ×
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ORDER BUTTON */}
      {items.length > 0 && (
        <button onClick={quickOrder} style={s.orderBtn}>
          🛒 Order All ({items.length} items)
        </button>
      )}
    </div>
  );
}

const s = {
  container: {
    padding: 20,
    maxWidth: 600,
    margin: 'auto',
    background: '#f9fafb',
    minHeight: '100vh'
  },
  loading: {
    textAlign: 'center',
    padding: 40,
    color: '#999'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333'
  },

  listBar: {
    display: 'flex',
    gap: 8,
    marginBottom: 20
  },
  select: {
    flex: 1,
    padding: 12,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#fff',
    fontSize: 14,
    cursor: 'pointer'
  },
  newBtn: {
    padding: '12px 20px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 'bold'
  },

  quickSection: {
    background: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    border: '1px solid #e5e7eb'
  },
  quickTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
    margin: 0
  },
  quickGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 8,
    marginTop: 10
  },
  quickBtn: {
    padding: '8px 4px',
    background: '#f3f4f6',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    transition: 'all 0.2s'
  },

  addBox: {
    display: 'flex',
    gap: 8,
    marginBottom: 16
  },
  input: {
    flex: 1,
    padding: 14,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    background: '#fff'
  },
  addBtn: {
    padding: '14px 24px',
    background: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 'bold'
  },

  itemsList: {
    background: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    border: '1px solid #e5e7eb',
    minHeight: 200
  },
  itemsHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: '1px solid #f3f4f6'
  },
  empty: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#999'
  },
  emptyHint: {
    fontSize: 13,
    marginTop: 8
  },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid #f3f4f6'
  },
  itemLeft: {
    flex: 1
  },
  itemName: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 6,
    color: '#333',
    textTransform: 'capitalize'
  },
  qtyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  qtyBtn: {
    width: 28,
    height: 28,
    background: '#f3f4f6',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  qty: {
    fontSize: 14,
    color: '#666',
    minWidth: 70
  },
  delBtn: {
    width: 32,
    height: 32,
    background: '#fee2e2',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 20,
    color: '#dc2626',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },

  orderBtn: {
    width: '100%',
    padding: 16,
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
  }
};
