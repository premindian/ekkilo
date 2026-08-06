import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = "https://ekkilo.onrender.com";

// Smart categories for auto-grouping
const CATEGORIES = {
  'dairy': ['milk', 'curd', 'butter', 'cheese', 'paneer', 'ghee'],
  'vegetables': ['potato', 'onion', 'tomato', 'carrot', 'cabbage', 'spinach', 'cauliflower'],
  'fruits': ['apple', 'banana', 'orange', 'mango', 'grapes', 'watermelon'],
  'grains': ['rice', 'wheat', 'flour', 'atta', 'maida', 'rava', 'sooji'],
  'pulses': ['dal', 'lentils', 'moong', 'toor', 'chana', 'rajma'],
  'oil': ['oil', 'ghee', 'butter'],
  'spices': ['salt', 'sugar', 'turmeric', 'chilli', 'masala', 'pepper', 'cumin'],
  'bakery': ['bread', 'bun', 'pav', 'cake', 'biscuit'],
  'beverages': ['tea', 'coffee', 'juice'],
  'other': []
};

const TEMPLATES = {
  'weekly': {
    name: '🗓️ Weekly Essentials',
    items: [
      { name: 'milk', qty: 7, unit: 'l' },
      { name: 'bread', qty: 7, unit: 'unit' },
      { name: 'eggs', qty: 12, unit: 'unit' },
      { name: 'vegetables', qty: 2, unit: 'kg' },
    ]
  },
  'monthly': {
    name: '📅 Monthly Groceries',
    items: [
      { name: 'rice', qty: 10, unit: 'kg' },
      { name: 'wheat flour', qty: 10, unit: 'kg' },
      { name: 'oil', qty: 5, unit: 'l' },
      { name: 'sugar', qty: 2, unit: 'kg' },
      { name: 'salt', qty: 1, unit: 'kg' },
      { name: 'dal', qty: 3, unit: 'kg' },
    ]
  },
  'quick': {
    name: '⚡ Quick Snacks',
    items: [
      { name: 'biscuits', qty: 2, unit: 'unit' },
      { name: 'chips', qty: 1, unit: 'unit' },
      { name: 'juice', qty: 2, unit: 'l' },
    ]
  }
};

export default function GroceryListsPage({ onSelectList }) {
  const { token } = useAuth();
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list', 'templates', 'recent'
  const [recentItems, setRecentItems] = useState([]);

  useEffect(() => {
    loadLists();
    loadRecentItems();
  }, []);

  const loadLists = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists?token=${token}`);
      const data = await res.json();
      setLists(data);
      
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

  const loadRecentItems = async () => {
    // Mock recent items - in production, fetch from order history
    setRecentItems([
      { name: 'milk', qty: 2, unit: 'l', frequency: 8 },
      { name: 'rice', qty: 1, unit: 'kg', frequency: 5 },
      { name: 'oil', qty: 500, unit: 'ml', frequency: 4 },
      { name: 'bread', qty: 2, unit: 'unit', frequency: 6 },
    ]);
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
      <h2 style={styles.title}>🛒 Smart Grocery Lists</h2>
      
      {/* VIEW TOGGLE */}
      <div style={styles.viewToggle}>
        <button 
          onClick={() => setView('list')} 
          style={{...styles.viewBtn, ...(view==='list' ? styles.viewBtnActive : {})}}
        >
          📝 My Lists
        </button>
        <button 
          onClick={() => setView('recent')} 
          style={{...styles.viewBtn, ...(view==='recent' ? styles.viewBtnActive : {})}}
        >
          🕐 Recent
        </button>
        <button 
          onClick={() => setView('templates')} 
          style={{...styles.viewBtn, ...(view==='templates' ? styles.viewBtnActive : {})}}
        >
          ⭐ Templates
        </button>
      </div>

      {view === 'templates' && (
        <TemplateView onApplyTemplate={(items) => {
          if (selectedList) {
            items.forEach(item => {
              // Add to current list
              fetch(`${API_BASE}/api/grocery-lists/${selectedList.list.id}/items?token=${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product_name: item.name, quantity: item.qty, unit: item.unit })
              });
            });
            setTimeout(() => loadListDetail(selectedList.list.id), 500);
          }
        }} />
      )}

      {view === 'recent' && (
        <RecentItemsView 
          items={recentItems} 
          onAddItem={(item) => {
            if (selectedList) {
              fetch(`${API_BASE}/api/grocery-lists/${selectedList.list.id}/items?token=${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product_name: item.name, quantity: item.qty, unit: item.unit })
              });
              setTimeout(() => loadListDetail(selectedList.list.id), 300);
            }
          }}
        />
      )}

      {view === 'list' && (
        <>
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
              recentItems={recentItems}
            />
          )}
        </>
      )}
    </div>
  );
}

// Template View
function TemplateView({ onApplyTemplate }) {
  return (
    <div style={styles.templatesGrid}>
      {Object.entries(TEMPLATES).map(([key, template]) => (
        <div key={key} style={styles.templateCard}>
          <h3 style={styles.templateName}>{template.name}</h3>
          <div style={styles.templateItems}>
            {template.items.map((item, i) => (
              <div key={i} style={styles.templateItem}>
                • {item.name} {item.qty}{item.unit}
              </div>
            ))}
          </div>
          <button 
            onClick={() => onApplyTemplate(template.items)}
            style={styles.applyBtn}
          >
            ➕ Add to List
          </button>
        </div>
      ))}
    </div>
  );
}

// Recent Items View
function RecentItemsView({ items, onAddItem }) {
  return (
    <div style={styles.recentList}>
      <p style={styles.sectionTitle}>🕐 Your Most Ordered Items</p>
      {items.map((item, i) => (
        <div key={i} style={styles.recentItem}>
          <div>
            <b>{item.name}</b>
            <span style={styles.recentMeta}>
              {item.qty} {item.unit} • Ordered {item.frequency}x
            </span>
          </div>
          <button onClick={() => onAddItem(item)} style={styles.quickAddBtn}>
            + Add
          </button>
        </div>
      ))}
    </div>
  );
}

// Advanced List Editor
function ListEditor({ list, token, onUpdate, onQuickOrder, recentItems }) {
  const [items, setItems] = useState(list.items || []);
  const [input, setInput] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const categorizeItem = (name) => {
    for (const [category, keywords] of Object.entries(CATEGORIES)) {
      if (keywords.some(kw => name.toLowerCase().includes(kw))) {
        return category;
      }
    }
    return 'other';
  };

  const parseItem = (text) => {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return null;

    const pattern = /^(.+?)\s*([\d.]+)\s*([a-z]+)$/;
    const match = normalized.match(pattern);

    if (match) {
      let [, name, qty, unitText] = match;
      
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

  const bulkAdd = async () => {
    const lines = bulkText.split('\n').filter(l => l.trim());
    
    for (const line of lines) {
      const parsed = parseItem(line);
      if (parsed) {
        try {
          await fetch(`${API_BASE}/api/grocery-lists/${list.list.id}/items?token=${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed)
          });
        } catch (err) {
          console.error('Failed to add:', line);
        }
      }
    }
    
    setBulkText('');
    setBulkMode(false);
    onUpdate();
    setTimeout(() => window.location.reload(), 500);
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

  const updateQuantity = async (item, change) => {
    const newQty = Math.max(0.5, item.quantity + change);
    // Update via delete and re-add for simplicity
    await deleteItem(item.id);
    
    try {
      const res = await fetch(`${API_BASE}/api/grocery-lists/${list.list.id}/items?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_name: item.product_name, quantity: newQty, unit: item.unit })
      });
      const data = await res.json();
      setItems([...items.filter(i => i.id !== item.id), data]);
      onUpdate();
    } catch (err) {
      console.error('Failed to update');
    }
  };

  // Group items by category
  const groupedItems = items.reduce((acc, item) => {
    const category = categorizeItem(item.product_name);
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  const filteredSuggestions = recentItems.filter(r => 
    !items.some(i => i.product_name.toLowerCase() === r.name.toLowerCase()) &&
    r.name.toLowerCase().includes(input.toLowerCase())
  );

  return (
    <div>
      {/* ADD INPUT */}
      {!bulkMode ? (
        <div style={styles.addBox}>
          <div style={styles.inputWrapper}>
            <input
              type="text"
              placeholder='Type: "milk 2 liters" or "oil 500ml"'
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setShowSuggestions(e.target.value.length > 0);
              }}
              onKeyPress={(e) => e.key === 'Enter' && addItem()}
              style={styles.input}
              autoFocus
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div style={styles.suggestions}>
                {filteredSuggestions.slice(0, 3).map((item, i) => (
                  <div
                    key={i}
                    style={styles.suggestionItem}
                    onClick={() => {
                      setInput(`${item.name} ${item.qty}${item.unit}`);
                      setShowSuggestions(false);
                    }}
                  >
                    💡 {item.name} {item.qty}{item.unit}
                  </div>
                ))}
              </div>
            )}
            <div style={styles.hint}>
              💡 Or try: <button onClick={() => setBulkMode(true)} style={styles.linkBtn}>📋 Bulk Add</button>
            </div>
          </div>
          <button onClick={addItem} style={styles.addBtn}>+ Add</button>
        </div>
      ) : (
        <div style={styles.bulkBox}>
          <h4 style={styles.bulkTitle}>📋 Bulk Add Items</h4>
          <textarea
            placeholder={'Paste your list here (one item per line):\nmilk 2l\nrice 1kg\noil 500ml\nbread 2 pieces'}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            style={styles.textarea}
            rows={6}
          />
          <div style={styles.buttonRow}>
            <button onClick={bulkAdd} style={styles.saveBtn}>➕ Add All</button>
            <button onClick={() => setBulkMode(false)} style={styles.cancelBtn}>Cancel</button>
          </div>
        </div>
      )}

      {/* CATEGORIZED ITEMS */}
      <div style={styles.itemsList}>
        {items.length === 0 ? (
          <p style={styles.empty}>No items yet. Try adding some!</p>
        ) : (
          Object.entries(groupedItems).map(([category, categoryItems]) => (
            <div key={category}>
              <h4 style={styles.categoryTitle}>
                {category === 'dairy' && '🥛'}
                {category === 'vegetables' && '🥬'}
                {category === 'fruits' && '🍎'}
                {category === 'grains' && '🌾'}
                {category === 'pulses' && '🫘'}
                {category === 'oil' && '🫗'}
                {category === 'spices' && '🌶️'}
                {category === 'bakery' && '🍞'}
                {category === 'beverages' && '☕'}
                {category === 'other' && '📦'}
                {' '}{category.charAt(0).toUpperCase() + category.slice(1)}
              </h4>
              {categoryItems.map((item) => (
                <div key={item.id} style={styles.item}>
                  <div style={styles.itemInfo}>
                    <b>{item.product_name}</b>
                    <div style={styles.qtyControls}>
                      <button onClick={() => updateQuantity(item, -0.5)} style={styles.qtyBtn}>−</button>
                      <span style={styles.qty}>{item.quantity} {item.unit}</span>
                      <button onClick={() => updateQuantity(item, 0.5)} style={styles.qtyBtn}>+</button>
                    </div>
                  </div>
                  <button onClick={() => deleteItem(item.id)} style={styles.deleteBtn}>×</button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* QUICK ORDER */}
      {items.length > 0 && (
        <button onClick={onQuickOrder} style={styles.orderBtn}>
          🛒 Order All ({items.length} items)
        </button>
      )}
    </div>
  );
}

const styles = {
  container: { padding: 20, maxWidth: 700, margin: 'auto' },
  loading: { textAlign: 'center', padding: 40, color: '#999' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  
  viewToggle: { display: 'flex', gap: 8, marginBottom: 20 },
  viewBtn: { flex: 1, padding: 10, background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 },
  viewBtnActive: { background: '#667eea', color: '#fff', fontWeight: 'bold' },

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
  inputWrapper: { flex: 1, position: 'relative' },
  input: { 
    width: '100%',
    padding: 12, 
    border: '1px solid #e5e7eb', 
    borderRadius: 8, 
    fontSize: 14,
    boxSizing: 'border-box'
  },
  suggestions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    marginTop: 4,
    zIndex: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  suggestionItem: {
    padding: 10,
    cursor: 'pointer',
    borderBottom: '1px solid #f3f4f6',
    ':hover': { background: '#f9fafb' }
  },
  hint: { fontSize: 12, color: '#666', marginTop: 4 },
  linkBtn: { background: 'none', border: 'none', color: '#667eea', cursor: 'pointer', textDecoration: 'underline', padding: 0 },
  addBtn: { 
    padding: '12px 20px', 
    background: '#22c55e', 
    color: '#fff', 
    border: 'none', 
    borderRadius: 8, 
    cursor: 'pointer',
    fontWeight: 'bold'
  },

  bulkBox: { background: '#f9fafb', padding: 16, borderRadius: 12, marginBottom: 20, border: '2px dashed #e5e7eb' },
  bulkTitle: { margin: '0 0 12px 0', fontSize: 16 },
  textarea: { width: '100%', padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'monospace' },
  buttonRow: { display: 'flex', gap: 8, marginTop: 12 },
  saveBtn: { flex: 1, padding: 10, background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' },
  cancelBtn: { flex: 1, padding: 10, background: '#e5e7eb', border: 'none', borderRadius: 8, cursor: 'pointer' },

  categoryTitle: { fontSize: 14, fontWeight: '600', color: '#666', marginTop: 16, marginBottom: 8 },
  itemsList: { marginBottom: 20 },
  item: { 
    background: '#fff', 
    border: '1px solid #e5e7eb', 
    borderRadius: 8, 
    padding: 12, 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 8
  },
  itemInfo: { flex: 1 },
  qtyControls: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 },
  qtyBtn: { background: '#f3f4f6', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 16 },
  qty: { fontSize: 14, color: '#666', minWidth: 80 },
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
  },

  // Templates
  templatesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 20 },
  templateCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 },
  templateName: { margin: '0 0 12px 0', fontSize: 16 },
  templateItems: { fontSize: 13, color: '#666', marginBottom: 12 },
  templateItem: { marginBottom: 4 },
  applyBtn: { width: '100%', padding: 8, background: '#22c55e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 },

  // Recent Items
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  recentList: { marginTop: 20 },
  recentItem: { 
    background: '#fff', 
    border: '1px solid #e5e7eb', 
    borderRadius: 8, 
    padding: 12, 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 8
  },
  recentMeta: { display: 'block', fontSize: 12, color: '#999', marginTop: 4 },
  quickAddBtn: { padding: '8px 16px', background: '#667eea', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }
};
