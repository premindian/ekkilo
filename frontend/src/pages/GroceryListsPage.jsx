import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = "https://ekkilo.onrender.com";

export default function GroceryListsPage({ onSelectList }) {
  const { token } = useAuth();
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLists();
  }, []);

  const loadLists = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists?token=${token}`);
      const data = await res.json();
      setLists(data);
      
      // Auto-select default list or first list
      const defaultList = data.find(l => l.is_default);
      if (defaultList) {
        loadListDetail(defaultList.id);
      } else if (data.length > 0) {
        loadListDetail(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load lists:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadListDetail = async (listId) => {
    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists/${listId}?token=${token}`);
      const data = await res.json();
      setSelectedList(data);
    } catch (err) {
      console.error('Failed to load list details:', err);
    }
  };

  const createList = async (name) => {
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

  const quickOrder = async () => {
    if (!selectedList) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists/${selectedList.list.id}/quick-order?token=${token}`, {
        method: 'POST'
      });
      const data = await res.json();
      
      if (onSelectList) {
        onSelectList(data.search_text);
      }
    } catch (err) {
      alert('Failed to create quick order');
    }
  };

  if (loading) {
    return <div style={styles.loading}>Loading...</div>;
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>📝 My Lists</h2>
      
      {/* LIST TABS */}
      <div style={styles.tabs}>
        {lists.map(list => (
          <button
            key={list.id}
            onClick={() => loadListDetail(list.id)}
            style={{
              ...styles.tab,
              ...(selectedList?.list.id === list.id ? styles.activeTab : {})
            }}
          >
            {list.name} {list.is_default && '⭐'}
          </button>
        ))}
        <button
          onClick={() => {
            const name = prompt('New list name:');
            if (name) createList(name);
          }}
          style={styles.newTab}
        >
          + New
        </button>
      </div>

      {selectedList && (
        <ListEditor
          list={selectedList}
          token={token}
          onUpdate={() => loadListDetail(selectedList.list.id)}
          onQuickOrder={quickOrder}
        />
      )}
    </div>
  );
}

// Simple List Editor Component
function ListEditor({ list, token, onUpdate, onQuickOrder }) {
  const [items, setItems] = useState(list.items || []);
  const [input, setInput] = useState('');

  // Flexible parser: "milk 2L", "oil 500ml", "rice 1 kg", "bread", etc.
  const parseItem = (text) => {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return null;

    // Try to find quantity and unit patterns
    // Patterns: "2kg", "500ml", "1.5l", "2 kg", "500 ml", "1 liter", etc.
    const pattern = /^(.+?)\s*([\d.]+)\s*([a-z]+)$/;
    const match = normalized.match(pattern);

    if (match) {
      let [, name, qty, unitText] = match;
      
      // Normalize common unit variations
      const unitMap = {
        'l': 'l', 'ltr': 'l', 'liter': 'l', 'litre': 'l', 'liters': 'l', 'litres': 'l',
        'ml': 'ml', 'milliliter': 'ml', 'millilitre': 'ml',
        'kg': 'kg', 'kgs': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
        'g': 'g', 'gm': 'g', 'gms': 'g', 'gram': 'g', 'grams': 'g',
        'pc': 'unit', 'pcs': 'unit', 'piece': 'unit', 'pieces': 'unit',
        'dozen': 'dozen', 'dz': 'dozen'
      };

      const unit = unitMap[unitText] || unitText;
      const quantity = parseFloat(qty);

      return {
        product_name: name.trim(),
        quantity: quantity,
        unit: unit
      };
    }

    // No quantity/unit found - default to 1 unit
    return {
      product_name: normalized,
      quantity: 1,
      unit: 'unit'
    };
  };

  const addItem = async () => {
    if (!input.trim()) return;

    const parsed = parseItem(input);
    if (!parsed) return;

    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists/${list.list.id}/items?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });
      const data = await res.json();
      
      setItems([...items, data]);
      setInput('');
      onUpdate();
    } catch (err) {
      alert('Failed to add item');
    }
  };

  const deleteItem = async (itemId) => {
    try {
      await fetch(`${API_BASE}/api/grocery-lists/${list.list.id}/items/${itemId}?token=${token}`, {
        method: 'DELETE'
      });
      setItems(items.filter(i => i.id !== itemId));
      onUpdate();
    } catch (err) {
      alert('Failed to delete item');
    }
  };

  return (
    <div>
      {/* SIMPLE ADD INPUT */}
      <div style={styles.addBox}>
        <div style={styles.inputWrapper}>
          <input
            type="text"
            placeholder='Type: "milk 2 liters" or "oil 500ml" or "rice 1kg"'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addItem()}
            style={styles.input}
            autoFocus
          />
          <div style={styles.hint}>
            💡 Examples: "milk 2l", "oil 500ml", "rice 1 kg", "bread 2 pieces"
          </div>
        </div>
        <button onClick={addItem} style={styles.addBtn}>+ Add</button>
      </div>

      {/* ITEMS LIST */}
      <div style={styles.itemsList}>
        {items.length === 0 ? (
          <p style={styles.empty}>No items yet. Try typing "milk 2L" above!</p>
        ) : (
          items.map((item) => (
            <div key={item.id} style={styles.item}>
              <div>
                <b>{item.product_name}</b>
                <span style={styles.qty}>{item.quantity} {item.unit}</span>
              </div>
              <button onClick={() => deleteItem(item.id)} style={styles.deleteBtn}>
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* QUICK ORDER BUTTON */}
      {items.length > 0 && (
        <button onClick={onQuickOrder} style={styles.orderBtn}>
          🛒 Order All ({items.length} items)
        </button>
      )}
    </div>
  );
}

const styles = {
  container: { padding: 20, maxWidth: 600, margin: 'auto' },
  loading: { textAlign: 'center', padding: 40, color: '#999' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  
  tabs: { display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 8 },
  tab: { 
    padding: '10px 16px', 
    background: '#f3f4f6', 
    border: 'none', 
    borderRadius: 8, 
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontSize: 14
  },
  activeTab: { background: '#667eea', color: '#fff', fontWeight: 'bold' },
  newTab: { 
    padding: '10px 16px', 
    background: '#22c55e', 
    color: '#fff', 
    border: 'none', 
    borderRadius: 8, 
    cursor: 'pointer',
    fontSize: 14
  },

  addBox: { display: 'flex', gap: 8, marginBottom: 20 },
  inputWrapper: { flex: 1 },
  input: { 
    width: '100%',
    padding: 12, 
    border: '1px solid #e5e7eb', 
    borderRadius: 8, 
    fontSize: 14,
    boxSizing: 'border-box'
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic'
  },
  addBtn: { 
    padding: '12px 20px', 
    background: '#22c55e', 
    color: '#fff', 
    border: 'none', 
    borderRadius: 8, 
    cursor: 'pointer',
    fontWeight: 'bold'
  },

  itemsList: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 },
  item: { 
    background: '#fff', 
    border: '1px solid #e5e7eb', 
    borderRadius: 8, 
    padding: 12, 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  qty: { marginLeft: 8, color: '#666', fontSize: 14 },
  deleteBtn: { 
    background: '#fee', 
    border: 'none', 
    borderRadius: 6, 
    width: 28, 
    height: 28, 
    cursor: 'pointer',
    fontSize: 20,
    color: '#dc2626'
  },
  empty: { textAlign: 'center', color: '#999', padding: 40 },

  orderBtn: { 
    width: '100%', 
    padding: 14, 
    background: '#667eea', 
    color: '#fff', 
    border: 'none', 
    borderRadius: 8, 
    fontSize: 16, 
    fontWeight: 'bold', 
    cursor: 'pointer' 
  }
};
