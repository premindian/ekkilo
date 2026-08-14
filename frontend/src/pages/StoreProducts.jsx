import { useState, useEffect, useRef } from 'react';
import { navigate } from '../utils/navigate';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

export default function StoreProducts() {
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]); // For add product
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');
  
  // Bulk actions
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [bulkPriceChange, setBulkPriceChange] = useState('');
  const [bulkStockChange, setBulkStockChange] = useState('');
  
  // Add product
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [addProductSearch, setAddProductSearch] = useState('');
  const [selectedNewProduct, setSelectedNewProduct] = useState(null);
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const csvRef = useRef(null);
  
  // Filters
  const [filterLowStock, setFilterLowStock] = useState(false);

  useEffect(() => {
    if (token) {
      loadProducts();
    }
  }, [search, token]);

  const loadProducts = async () => {
    console.log('🔍 Loading products...');
    try {
      const url = search 
        ? `${API_BASE}/api/store/products?token=${token}&search=${search}`
        : `${API_BASE}/api/store/products?token=${token}`;
      
      const res = await fetch(url);
      const data = await res.json();
      setProducts(data);
    } catch (err) {
      console.error('❌ Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllProducts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/products?search=${addProductSearch}`);
      const data = await res.json();
      setAllProducts(data);
    } catch (err) {
      console.error('Failed to load master products:', err);
    }
  };

  useEffect(() => {
    if (showAddProduct && addProductSearch) {
      loadAllProducts();
    }
  }, [addProductSearch, showAddProduct]);

  const toggleSelect = (productId) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const selectAll = () => {
    const filtered = getFilteredProducts();
    if (selectedProducts.size === filtered.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filtered.map(p => p.id)));
    }
  };

  const applyBulkPriceChange = async () => {
    if (!bulkPriceChange || selectedProducts.size === 0) {
      alert('Select products and enter percentage');
      return;
    }

    const change = parseFloat(bulkPriceChange);
    if (isNaN(change)) {
      alert('Enter valid percentage');
      return;
    }

    try {
      for (const productId of selectedProducts) {
        const product = products.find(p => p.id === productId);
        if (!product) continue;
        
        const newPrice = product.price * (1 + change / 100);
        
        await fetch(`${API_BASE}/api/store/products/${productId}?token=${token}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price: newPrice })
        });
      }
      
      alert(`✅ Updated ${selectedProducts.size} products!`);
      setSelectedProducts(new Set());
      setBulkPriceChange('');
      loadProducts();
    } catch (err) {
      alert('❌ Failed to update prices');
    }
  };

  const applyBulkStockChange = async () => {
    if (!bulkStockChange || selectedProducts.size === 0) {
      alert('Select products and enter stock change');
      return;
    }

    const change = parseInt(bulkStockChange);
    if (isNaN(change)) {
      alert('Enter valid stock number');
      return;
    }

    try {
      for (const productId of selectedProducts) {
        const product = products.find(p => p.id === productId);
        if (!product) continue;
        
        const newStock = Math.max(0, product.stock + change);
        
        await fetch(`${API_BASE}/api/store/products/${productId}?token=${token}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stock: newStock })
        });
      }
      
      alert(`✅ Updated ${selectedProducts.size} products!`);
      setSelectedProducts(new Set());
      setBulkStockChange('');
      loadProducts();
    } catch (err) {
      alert('❌ Failed to update stock');
    }
  };

  const addProduct = async () => {
    if (!selectedNewProduct || !newPrice || !newStock) {
      alert('Please fill all fields');
      return;
    }

    try {
      await fetch(`${API_BASE}/api/store/products?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedNewProduct.id,
          price: parseFloat(newPrice),
          stock: parseInt(newStock)
        })
      });
      
      alert('✅ Product added!');
      setShowAddProduct(false);
      setSelectedNewProduct(null);
      setNewPrice('');
      setNewStock('');
      setAddProductSearch('');
      loadProducts();
    } catch (err) {
      alert('❌ Failed to add product');
    }
  };

  const removeProduct = async (productId) => {
    if (!window.confirm('Remove this product from your store?')) return;
    
    try {
      await fetch(`${API_BASE}/api/store/products/${productId}?token=${token}`, {
        method: 'DELETE'
      });
      alert('✅ Product removed!');
      loadProducts();
    } catch (err) {
      alert('❌ Failed to remove product');
    }
  };

  const startEdit = (product) => {
    setEditingId(product.id);
    setEditPrice(product.price);
    setEditStock(product.stock);
  };

  const saveEdit = async (productId) => {
    try {
      await fetch(`${API_BASE}/api/store/products/${productId}?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: parseFloat(editPrice),
          stock: parseInt(editStock)
        })
      });
      
      setEditingId(null);
      loadProducts();
      alert('✅ Product updated!');
    } catch (err) {
      alert('❌ Failed to update product');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPrice('');
    setEditStock('');
  };

  const uploadPhoto = async (storeProductId, file) => {
    if (!file || !storeProductId) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(
        `${API_BASE}/api/store/products/${storeProductId}/image?token=${token}`,
        { method: 'POST', body: fd }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Upload failed');
      }
      loadProducts();
    } catch (e) {
      alert(e.message || 'Upload failed (max ~350KB)');
    }
  };

  const getFilteredProducts = () => {
    let filtered = products;
    if (filterLowStock) {
      filtered = filtered.filter(p => p.stock < 5);
    }
    return filtered;
  };

  const downloadInventoryTemplate = (sample = 'a') => {
    window.location.href =
      `${API_BASE}/api/store/products/import-template?token=${encodeURIComponent(token)}&sample=${sample}`;
  };

  const importInventoryCsv = async (file) => {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE}/api/store/products/import?token=${token}`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || 'Import failed');
      }
      setImportResult(data);
      loadProducts();
      if (data.failed_count) {
        alert(
          `Imported with ${data.failed_count} unmatched row(s). ` +
            `Added ${data.created}, updated ${data.updated}. ` +
            'Names must match the master catalog.'
        );
      }
    } catch (e) {
      alert(e.message || 'Import failed');
    } finally {
      setImporting(false);
      if (csvRef.current) csvRef.current.value = '';
    }
  };

  const filteredProducts = getFilteredProducts();

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>📦 Products</h1>
        <button onClick={() => navigate('/store')} style={styles.backBtn}>
          ← Back
        </button>
      </div>

      <div style={styles.importBox}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={styles.importTitle}>Upload inventory (Excel / CSV)</div>
          <p style={styles.importHint}>
            Columns: name, brand, size, unit, price, stock. Names must match Admin catalog.
            Edit in Excel → Save as CSV UTF-8 → upload.
          </p>
          {importResult && (
            <p style={styles.importStats}>
              Added {importResult.created} · updated {importResult.updated}
              {importResult.failed_count ? ` · unmatched ${importResult.failed_count}` : ''}
            </p>
          )}
        </div>
        <div style={styles.importActions}>
          <button type="button" onClick={() => downloadInventoryTemplate('a')} style={styles.templateBtn}>
            Sample A CSV
          </button>
          <button type="button" onClick={() => downloadInventoryTemplate('b')} style={styles.templateBtn}>
            Sample B CSV
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
                if (f) importInventoryCsv(f);
              }}
            />
          </label>
        </div>
      </div>

      {/* Action Bar */}
      <div style={styles.actionBar}>
        <button 
          onClick={() => setShowAddProduct(!showAddProduct)} 
          style={styles.addBtn}
        >
          ➕ Add Product
        </button>
        <div style={styles.filterChips}>
          <button 
            onClick={() => setFilterLowStock(!filterLowStock)}
            style={filterLowStock ? styles.filterChipActive : styles.filterChip}
          >
            {filterLowStock ? '✓ ' : ''}Low Stock
          </button>
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddProduct && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Add Product</h2>
              <button onClick={() => setShowAddProduct(false)} style={styles.closeBtn}>✕</button>
            </div>
            
            <input
              type="text"
              placeholder="Search products..."
              value={addProductSearch}
              onChange={(e) => setAddProductSearch(e.target.value)}
              style={styles.input}
            />

            {addProductSearch && allProducts.length > 0 && (
              <div style={styles.productList}>
                {allProducts.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => setSelectedNewProduct(p)}
                    style={selectedNewProduct?.id === p.id ? styles.productItemActive : styles.productItem}
                  >
                    {p.name}
                  </div>
                ))}
              </div>
            )}

            {selectedNewProduct && (
              <div style={styles.addProductForm}>
                <div style={styles.selectedProduct}>
                  ✅ {selectedNewProduct.name}
                </div>
                <input
                  type="number"
                  placeholder="Price (₹)"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  style={styles.input}
                />
                <input
                  type="number"
                  placeholder="Initial Stock"
                  value={newStock}
                  onChange={(e) => setNewStock(e.target.value)}
                  style={styles.input}
                />
                <button onClick={addProduct} style={styles.submitBtn}>
                  Add to Store
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search */}
      <div style={styles.searchBox}>
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      {/* Bulk Actions */}
      {selectedProducts.size > 0 && (
        <div style={styles.bulkActions}>
          <div style={styles.bulkHeader}>
            <span style={styles.bulkCount}>{selectedProducts.size} selected</span>
            <button onClick={() => setSelectedProducts(new Set())} style={styles.clearBtn}>
              Clear
            </button>
          </div>
          
          <div style={styles.bulkRow}>
            <input
              type="number"
              placeholder="Price change %"
              value={bulkPriceChange}
              onChange={(e) => setBulkPriceChange(e.target.value)}
              style={styles.bulkInput}
            />
            <button onClick={applyBulkPriceChange} style={styles.bulkBtn}>
              Apply %
            </button>
          </div>

          <div style={styles.bulkRow}>
            <input
              type="number"
              placeholder="Stock +/-"
              value={bulkStockChange}
              onChange={(e) => setBulkStockChange(e.target.value)}
              style={styles.bulkInput}
            />
            <button onClick={applyBulkStockChange} style={styles.bulkBtn}>
              Update Stock
            </button>
          </div>
        </div>
      )}

      {/* Select All */}
      {filteredProducts.length > 0 && (
        <div style={styles.selectAll}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
              onChange={selectAll}
              style={styles.checkbox}
            />
            Select All ({filteredProducts.length})
          </label>
        </div>
      )}

      {/* Products List */}
      {loading ? (
        <div style={styles.loading}>🔄 Loading...</div>
      ) : filteredProducts.length === 0 ? (
        <div style={styles.empty}>No products found</div>
      ) : (
        <div style={styles.productsList}>
          {filteredProducts.map(product => (
            <div key={product.id} style={styles.productCard}>
              <div style={styles.productHeader}>
                <input
                  type="checkbox"
                  checked={selectedProducts.has(product.id)}
                  onChange={() => toggleSelect(product.id)}
                  style={styles.checkbox}
                />
                {product.image_url ? (
                  <img src={product.image_url} alt="" style={styles.thumb} />
                ) : (
                  <div style={styles.thumbEmpty}>📷</div>
                )}
                <div style={styles.productInfo}>
                  <div style={styles.productName}>{product.product_name}</div>
                  <div style={styles.productMeta}>
                    {product.brand} {product.variant} {product.size}{product.unit}
                  </div>
                </div>
              </div>

              {editingId === product.id ? (
                // Edit Mode
                <div style={styles.editMode}>
                  <div style={styles.editRow}>
                    <label style={styles.editLabel}>Price:</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      style={styles.editInput}
                    />
                  </div>
                  <div style={styles.editRow}>
                    <label style={styles.editLabel}>Stock:</label>
                    <input
                      type="number"
                      value={editStock}
                      onChange={(e) => setEditStock(e.target.value)}
                      style={styles.editInput}
                    />
                  </div>
                  <div style={styles.editActions}>
                    <button 
                      onClick={() => saveEdit(product.id)}
                      style={{...styles.editBtn, background: '#22c55e'}}
                    >
                      ✓ Save
                    </button>
                    <button 
                      onClick={cancelEdit}
                      style={{...styles.editBtn, background: '#6b7280'}}
                    >
                      ✗ Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div style={styles.viewMode}>
                  <div style={styles.productDetails}>
                    <div style={styles.priceTag}>₹{product.price}</div>
                    <div style={styles.stockTag}>
                      Stock: <strong style={product.stock < 5 ? {color: '#ef4444'} : {}}>{product.stock}</strong>
                    </div>
                  </div>
                  <div style={styles.actions}>
                    <label style={styles.photoButton} title="Product photo for Shop">
                      📷
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadPhoto(product.id, f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button 
                      onClick={() => startEdit(product)}
                      style={styles.editButton}
                    >
                      ✏️
                    </button>
                    <button 
                      onClick={() => removeProduct(product.id)}
                      style={styles.deleteButton}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 600,
    margin: 'auto',
    padding: 16,
    paddingBottom: 80,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  backBtn: {
    padding: '8px 16px',
    background: '#f3f4f6',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  importBox: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  importTitle: { fontWeight: 700, fontSize: 15, marginBottom: 4, color: '#14532d' },
  importHint: { margin: 0, fontSize: 13, color: '#166534', lineHeight: 1.45 },
  importStats: { margin: '8px 0 0', fontSize: 13, fontWeight: 600, color: '#0f766e' },
  importActions: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  templateBtn: {
    padding: '10px 12px',
    background: '#fff',
    border: '1px solid #86efac',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    color: '#166534',
  },
  uploadBtn: {
    padding: '10px 14px',
    background: '#16a34a',
    color: '#fff',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  actionBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addBtn: {
    padding: '10px 20px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  filterChips: {
    display: 'flex',
    gap: 8,
  },
  filterChip: {
    padding: '6px 12px',
    background: '#f3f4f6',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
  filterChipActive: {
    padding: '6px 12px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
  searchBox: {
    marginBottom: 16,
  },
  searchInput: {
    width: '100%',
    padding: '12px 16px',
    border: '2px solid #e5e7eb',
    borderRadius: 12,
    fontSize: 16,
    boxSizing: 'border-box',
  },
  bulkActions: {
    background: '#fef3c7',
    border: '2px solid #fbbf24',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  bulkHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  bulkCount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#92400e',
  },
  clearBtn: {
    padding: '4px 12px',
    background: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
  },
  bulkRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 8,
  },
  bulkInput: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
  },
  bulkBtn: {
    padding: '8px 16px',
    background: '#f59e0b',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  selectAll: {
    marginBottom: 12,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  checkbox: {
    width: 18,
    height: 18,
    cursor: 'pointer',
  },
  loading: {
    textAlign: 'center',
    padding: 60,
    color: '#666',
  },
  empty: {
    textAlign: 'center',
    padding: 60,
    color: '#999',
  },
  productsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  productCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 16,
  },
  productHeader: {
    display: 'flex',
    gap: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  thumb: {
    width: 48,
    height: 48,
    objectFit: 'cover',
    borderRadius: 10,
    background: '#f3f4f6',
    flexShrink: 0,
  },
  thumbEmpty: {
    width: 48,
    height: 48,
    borderRadius: 10,
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    flexShrink: 0,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  productMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  viewMode: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productDetails: {
    display: 'flex',
    gap: 16,
    alignItems: 'center',
  },
  priceTag: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#22c55e',
  },
  stockTag: {
    fontSize: 14,
    color: '#666',
  },
  actions: {
    display: 'flex',
    gap: 8,
  },
  editButton: {
    padding: '8px 12px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    cursor: 'pointer',
  },
  photoButton: {
    padding: '8px 12px',
    background: '#0f766e',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    cursor: 'pointer',
    display: 'inline-block',
  },
  deleteButton: {
    padding: '8px 12px',
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    cursor: 'pointer',
  },
  editMode: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  editRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  editLabel: {
    fontSize: 14,
    fontWeight: 600,
    minWidth: 50,
  },
  editInput: {
    flex: 1,
    padding: '8px 12px',
    border: '2px solid #3b82f6',
    borderRadius: 8,
    fontSize: 14,
  },
  editActions: {
    display: 'flex',
    gap: 8,
  },
  editBtn: {
    flex: 1,
    padding: '10px',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 20,
  },
  modalContent: {
    background: '#fff',
    borderRadius: 16,
    padding: 24,
    maxWidth: 500,
    width: '100%',
    maxHeight: '80vh',
    overflow: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: '8px 12px',
    background: 'none',
    border: 'none',
    fontSize: 20,
    cursor: 'pointer',
    color: '#666',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    border: '2px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    marginBottom: 12,
    boxSizing: 'border-box',
  },
  productList: {
    maxHeight: 200,
    overflowY: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    marginBottom: 16,
  },
  productItem: {
    padding: '12px 16px',
    cursor: 'pointer',
    borderBottom: '1px solid #f3f4f6',
  },
  productItemActive: {
    padding: '12px 16px',
    cursor: 'pointer',
    borderBottom: '1px solid #f3f4f6',
    background: '#dbeafe',
    fontWeight: 600,
  },
  addProductForm: {
    marginTop: 16,
  },
  selectedProduct: {
    padding: 12,
    background: '#d1fae5',
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 14,
    fontWeight: 600,
    color: '#065f46',
  },
  submitBtn: {
    width: '100%',
    padding: '12px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
