import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

export default function GroceryListsPage({ onSelectList }) {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [input, setInput] = useState('');
  const [listId, setListId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrCreateList();
  }, []);

  const loadOrCreateList = async () => {
    try {
      // Get all lists
      const res = await fetch(`${API_BASE}/api/grocery-lists?token=${token}`);
      const lists = await res.json();
      
      // Find "My Monthly List" or create it
      let monthlyList = lists.find(l => l.name === 'My Monthly List');
      
      if (!monthlyList) {
        // Create it
        await fetch(`${API_BASE}/api/grocery-lists?token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'My Monthly List' })
        });
        
        // Reload
        const res2 = await fetch(`${API_BASE}/api/grocery-lists?token=${token}`);
        const lists2 = await res2.json();
        monthlyList = lists2.find(l => l.name === 'My Monthly List');
      }
      
      if (monthlyList) {
        loadItems(monthlyList.id);
      }
    } catch (err) {
      console.error('Setup failed:', err);
      setLoading(false);
    }
  };

  const loadItems = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists/${id}?token=${token}`);
      const data = await res.json();
      setListId(id);
      
      // Remove duplicates if any exist
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
    } finally {
      setLoading(false);
    }
  };

  const parseItem = (text) => {
    const normalized = text.trim();
    if (!normalized) return null;

    // Store EXACTLY what user types as product_name
    // Backend search will parse it intelligently
    return {
      product_name: normalized,
      quantity: 1,  // Backend uses this for internal tracking
      unit: 'item'   // Backend uses this for internal tracking
    };
  };

  const addItem = async () => {
    if (!input.trim() || !listId) return;

    const parsed = parseItem(input);
    if (!parsed) return;

    // Check for duplicate
    const nameKey = parsed.product_name.toLowerCase().trim();
    const isDuplicate = items.some(i => 
      i.product_name.toLowerCase().trim() === nameKey
    );

    if (isDuplicate) {
      alert(`"${parsed.product_name}" is already in your list!`);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists/${listId}/items?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
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
      const res = await fetch(`${API_BASE}/api/grocery-lists/${listId}/items/${itemId}?token=${token}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        setItems(items.filter(i => i.id !== itemId));
      }
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
      const res = await fetch(`${API_BASE}/api/grocery-lists/${listId}/quick-order?token=${token}`, {
        method: 'POST'
      });
      const data = await res.json();
      
      if (onSelectList) {
        onSelectList(data.search_text);
      }
    } catch (err) {
      alert('Order failed');
    }
  };

  if (loading) {
    return <div style={s.loading}>Loading...</div>;
  }

  return (
    <div style={s.page}>
      <div style={s.container}>
        <h2 style={s.title}>📝 My Monthly List</h2>

        {/* ADD ITEM */}
        <div style={s.addBox}>
          <input
            type="text"
            placeholder='Type: "rice 5kg", "basmati rice 10kg bag", "amul milk 2 liters"...'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addItem()}
            style={s.input}
            autoFocus
          />
          <button onClick={addItem} style={s.addBtn}>
            + Add
          </button>
        </div>

        {/* ITEMS COUNT */}
        {items.length > 0 && (
          <div style={s.header}>
            <span style={s.count}>{items.length} items</span>
            <button onClick={clearAll} style={s.clearBtn}>
              Clear All
            </button>
          </div>
        )}

        {/* ITEMS LIST */}
        <div style={s.list}>
          {items.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>📝</div>
              <p>Your list is empty</p>
              <p style={s.hint}>Type exactly what you need: "rice 5kg", "basmati rice 10kg bag", etc.</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} style={s.item}>
                <div style={s.itemContent}>
                  <div style={s.itemName}>{item.product_name}</div>
                </div>
                <button
                  onClick={() => deleteItem(item.id)}
                  style={s.deleteBtn}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        {/* ORDER BUTTON */}
        {items.length > 0 && (
          <button onClick={quickOrder} style={s.orderBtn}>
            🛒 Order All ({items.length} items)
          </button>
        )}
      </div>
    </div>
  );
}

const s = {
  page: {
    background: '#f9fafb',
    minHeight: '100vh',
    padding: '20px 0'
  },
  container: {
    maxWidth: 600,
    margin: 'auto',
    padding: 20
  },
  loading: {
    textAlign: 'center',
    padding: 60,
    color: '#999'
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#111'
  },

  addBox: {
    display: 'flex',
    gap: 10,
    marginBottom: 20
  },
  input: {
    flex: 1,
    padding: 16,
    border: '2px solid #e5e7eb',
    borderRadius: 12,
    fontSize: 15,
    background: '#fff'
  },
  addBtn: {
    padding: '16px 28px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
    fontSize: 15,
    fontWeight: 'bold'
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    padding: '0 4px'
  },
  count: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666'
  },
  clearBtn: {
    padding: '6px 12px',
    background: '#fee2e2',
    color: '#dc2626',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: '500'
  },

  list: {
    background: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    border: '2px solid #e5e7eb',
    minHeight: 300
  },
  empty: {
    textAlign: 'center',
    padding: '80px 20px',
    color: '#999'
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16
  },
  hint: {
    fontSize: 13,
    marginTop: 8,
    color: '#bbb'
  },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 12px',
    borderBottom: '1px solid #f3f4f6'
  },
  itemContent: {
    flex: 1
  },
  itemName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
    color: '#333',
    textTransform: 'capitalize'
  },
  itemQty: {
    fontSize: 14,
    color: '#999'
  },
  deleteBtn: {
    width: 36,
    height: 36,
    background: '#fee2e2',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 24,
    color: '#dc2626',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold'
  },

  orderBtn: {
    width: '100%',
    padding: 18,
    background: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 17,
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(102, 126, 234, 0.4)'
  }
};
