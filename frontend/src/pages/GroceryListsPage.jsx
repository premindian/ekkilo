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

  // Parse simple format: "milk 2L" or "rice 1kg" or just "bread"
  const parseItem = (text) => {
    const parts = text.trim().toLowerCase().split(/\s+/);
    if (parts.length === 0) return null;

    let product_name = parts[0];
    let quantity = 1;
    let unit = 'unit';

    if (parts.length >= 2) {
      // Try to parse quantity and unit from second part
      const quantityPart = parts[1];
      const match = quantityPart.match(/^([\d.]+)([a-z]+)$/);
      
      if (match) {
        quantity = parseFloat(match[1]);
        unit = match[2];
      } else {
        // Maybe just a number, use default unit
        const num = parseFloat(quantityPart);
        if (!isNaN(num)) {
          quantity = num;
        } else {
          // It's part of the name
          product_name = parts.join(' ');
        }
      }
    }

    // If there are more parts, they're part of the name
    if (parts.length > 2 && !quantityPart.match(/^[\d.]+[a-z]+$/)) {
      product_name = parts.join(' ');
      quantity = 1;
      unit = 'unit';
    }

    return { product_name, quantity, unit };
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
        <input
          type="text"
          placeholder='Type items: "milk 2L" or "rice 1kg" or just "bread"'
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && addItem()}
          style={styles.input}
          autoFocus
        />
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
  input: { 
    flex: 1, 
    padding: 12, 
    border: '1px solid #e5e7eb', 
    borderRadius: 8, 
    fontSize: 14 
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
