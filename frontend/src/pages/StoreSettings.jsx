import { useState, useEffect } from 'react';
import { navigate } from '../utils/navigate';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

export default function StoreSettings() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  
  // Store Profile
  const [storeName, setStoreName] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storeLat, setStoreLat] = useState('');
  const [storeLng, setStoreLng] = useState('');
  const [storeDescription, setStoreDescription] = useState('');
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('21:00');
  
  // Store Settings
  const [deliveryRadius, setDeliveryRadius] = useState('5');
  const [minOrder, setMinOrder] = useState('0');
  const [isOpen, setIsOpen] = useState(true);
  const [autoAccept, setAutoAccept] = useState(false);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [freeDeliveryMin, setFreeDeliveryMin] = useState('1500');
  const [deliveryFee, setDeliveryFee] = useState('40');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  
  // Notifications
  const [whatsappNotifications, setWhatsappNotifications] = useState(true);
  const [lowStockAlert, setLowStockAlert] = useState(true);
  const [lowStockThreshold, setLowStockThreshold] = useState('5');

  useEffect(() => {
    if (token) {
      loadSettings();
    }
  }, [token]);

  const loadSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/store/settings?token=${token}`);
      const data = await res.json();
      
      // Store Profile
      setStoreName(data.store?.name || '');
      setStorePhone(data.store?.phone || '');
      setStoreAddress(data.store?.address || '');
      setStoreLat(data.store?.lat || '');
      setStoreLng(data.store?.lng || '');
      setStoreDescription(data.store?.description || '');
      setOpenTime(data.store?.open_time || '09:00');
      setCloseTime(data.store?.close_time || '21:00');
      
      // Store Settings
      setDeliveryRadius(data.settings?.delivery_radius || '5');
      setMinOrder(data.settings?.min_order || '0');
      setIsOpen(data.settings?.is_open !== false);
      setAutoAccept(data.settings?.auto_accept_orders || false);
      setDeliveryEnabled(!!data.settings?.delivery_enabled);
      setFreeDeliveryMin(
        data.settings?.free_delivery_min != null ? String(data.settings.free_delivery_min) : '1500'
      );
      setDeliveryFee(
        data.settings?.delivery_fee != null ? String(data.settings.delivery_fee) : '40'
      );
      setDeliveryNotes(data.settings?.delivery_notes || '');
      
      // Notifications
      setWhatsappNotifications(data.notifications?.whatsapp_enabled !== false);
      setLowStockAlert(data.notifications?.low_stock_alert !== false);
      setLowStockThreshold(data.notifications?.low_stock_threshold || '5');
      
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/store/settings/profile?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: storeName,
          phone: storePhone,
          address: storeAddress,
          lat: storeLat ? parseFloat(storeLat) : null,
          lng: storeLng ? parseFloat(storeLng) : null,
          description: storeDescription,
          open_time: openTime,
          close_time: closeTime
        })
      });
      alert('✅ Profile updated!');
    } catch (err) {
      alert('❌ Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/store/settings/store?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_radius: parseFloat(deliveryRadius),
          min_order: parseFloat(minOrder),
          is_open: isOpen,
          auto_accept_orders: autoAccept,
          delivery_enabled: deliveryEnabled,
          free_delivery_min: parseFloat(freeDeliveryMin) || 0,
          delivery_fee: parseFloat(deliveryFee) || 0,
          delivery_notes: deliveryNotes.trim() || null,
        })
      });
      alert('✅ Settings updated!');
    } catch (err) {
      alert('❌ Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const saveNotifications = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/store/settings/notifications?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsapp_enabled: whatsappNotifications,
          low_stock_alert: lowStockAlert,
          low_stock_threshold: parseInt(lowStockThreshold)
        })
      });
      alert('✅ Notifications updated!');
    } catch (err) {
      alert('❌ Failed to update notifications');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={styles.loading}>🔄 Loading...</div>;
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>⚙️ Settings</h1>
        <button onClick={() => navigate('/store')} style={styles.backBtn}>
          ← Back
        </button>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab('profile')}
          style={activeTab === 'profile' ? styles.tabActive : styles.tab}
        >
          🏪 Profile
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          style={activeTab === 'settings' ? styles.tabActive : styles.tab}
        >
          ⚙️ Settings
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          style={activeTab === 'notifications' ? styles.tabActive : styles.tab}
        >
          🔔 Alerts
        </button>
      </div>

      {/* Tab Content */}
      <div style={styles.content}>
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div>
            <h2 style={styles.sectionTitle}>Store Information</h2>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Store Name *</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                style={styles.input}
                placeholder="Your Store Name"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Phone Number *</label>
              <input
                type="tel"
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
                style={styles.input}
                placeholder="917680928464"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Address *</label>
              <textarea
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                style={styles.textarea}
                placeholder="Full store address"
                rows={3}
              />
            </div>

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Latitude</label>
                <input
                  type="text"
                  value={storeLat}
                  onChange={(e) => setStoreLat(e.target.value)}
                  style={styles.input}
                  placeholder="17.686815"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Longitude</label>
                <input
                  type="text"
                  value={storeLng}
                  onChange={(e) => setStoreLng(e.target.value)}
                  style={styles.input}
                  placeholder="83.218482"
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Description</label>
              <textarea
                value={storeDescription}
                onChange={(e) => setStoreDescription(e.target.value)}
                style={styles.textarea}
                placeholder="Brief description of your store"
                rows={3}
              />
            </div>

            <h2 style={styles.sectionTitle}>Business Hours</h2>

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Opening Time</label>
                <input
                  type="time"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Closing Time</label>
                <input
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>

            <button 
              onClick={saveProfile} 
              disabled={saving}
              style={styles.saveBtn}
            >
              {saving ? '💾 Saving...' : '💾 Save Profile'}
            </button>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div>
            <h2 style={styles.sectionTitle}>Store Status</h2>
            
            <div style={styles.toggleGroup}>
              <div style={styles.toggleInfo}>
                <div style={styles.toggleLabel}>
                  {isOpen ? '🟢 Store Open' : '🔴 Store Closed'}
                </div>
                <div style={styles.toggleDesc}>
                  Customers can {isOpen ? '' : 'not '}place orders
                </div>
              </div>
              <label style={styles.switch}>
                <input
                  type="checkbox"
                  checked={isOpen}
                  onChange={(e) => setIsOpen(e.target.checked)}
                />
                <span style={styles.slider}></span>
              </label>
            </div>

            <h2 style={styles.sectionTitle}>Delivery (you handle drop)</h2>
            <p style={styles.hint}>
              Ekkilo only shows your rule to customers. You manage delivery yourself — we do not assign riders.
            </p>

            <div style={styles.toggleGroup}>
              <div style={styles.toggleInfo}>
                <div style={styles.toggleLabel}>
                  {deliveryEnabled ? '🚚 Offer delivery' : '🏪 Pickup only'}
                </div>
                <div style={styles.toggleDesc}>
                  Let customers choose store delivery at checkout
                </div>
              </div>
              <label style={styles.switch}>
                <input
                  type="checkbox"
                  checked={deliveryEnabled}
                  onChange={(e) => setDeliveryEnabled(e.target.checked)}
                />
                <span style={styles.slider}></span>
              </label>
            </div>

            {deliveryEnabled && (
              <>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Free delivery above (₹)</label>
                  <input
                    type="number"
                    value={freeDeliveryMin}
                    onChange={(e) => setFreeDeliveryMin(e.target.value)}
                    style={styles.input}
                    placeholder="1500"
                  />
                  <div style={styles.hint}>e.g. ₹1500+ = free delivery</div>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Delivery fee below that (₹)</label>
                  <input
                    type="number"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                    style={styles.input}
                    placeholder="40"
                  />
                  <div style={styles.hint}>Charged when order is under the free threshold</div>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Delivery radius (km)</label>
                  <input
                    type="number"
                    value={deliveryRadius}
                    onChange={(e) => setDeliveryRadius(e.target.value)}
                    style={styles.input}
                    placeholder="5"
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Area note (shown to customers)</label>
                  <input
                    type="text"
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    style={styles.input}
                    placeholder="e.g. Within 2 km / MVP Colony only"
                  />
                </div>
              </>
            )}

            <div style={styles.formGroup}>
              <label style={styles.label}>Minimum Order (₹)</label>
              <input
                type="number"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
                style={styles.input}
                placeholder="0"
              />
              <div style={styles.hint}>Minimum order amount required</div>
            </div>

            <h2 style={styles.sectionTitle}>Order Settings</h2>

            <div style={styles.toggleGroup}>
              <div style={styles.toggleInfo}>
                <div style={styles.toggleLabel}>Auto-Accept Orders</div>
                <div style={styles.toggleDesc}>
                  Automatically accept new orders
                </div>
              </div>
              <label style={styles.switch}>
                <input
                  type="checkbox"
                  checked={autoAccept}
                  onChange={(e) => setAutoAccept(e.target.checked)}
                />
                <span style={styles.slider}></span>
              </label>
            </div>

            <button 
              onClick={saveSettings} 
              disabled={saving}
              style={styles.saveBtn}
            >
              {saving ? '💾 Saving...' : '💾 Save Settings'}
            </button>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div>
            <h2 style={styles.sectionTitle}>Order Notifications</h2>

            <div style={styles.toggleGroup}>
              <div style={styles.toggleInfo}>
                <div style={styles.toggleLabel}>WhatsApp Notifications</div>
                <div style={styles.toggleDesc}>
                  Receive order alerts on WhatsApp
                </div>
              </div>
              <label style={styles.switch}>
                <input
                  type="checkbox"
                  checked={whatsappNotifications}
                  onChange={(e) => setWhatsappNotifications(e.target.checked)}
                />
                <span style={styles.slider}></span>
              </label>
            </div>

            <h2 style={styles.sectionTitle}>Inventory Alerts</h2>

            <div style={styles.toggleGroup}>
              <div style={styles.toggleInfo}>
                <div style={styles.toggleLabel}>Low Stock Alerts</div>
                <div style={styles.toggleDesc}>
                  Get notified when products are running low
                </div>
              </div>
              <label style={styles.switch}>
                <input
                  type="checkbox"
                  checked={lowStockAlert}
                  onChange={(e) => setLowStockAlert(e.target.checked)}
                />
                <span style={styles.slider}></span>
              </label>
            </div>

            {lowStockAlert && (
              <div style={styles.formGroup}>
                <label style={styles.label}>Low Stock Threshold</label>
                <input
                  type="number"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  style={styles.input}
                  placeholder="5"
                />
                <div style={styles.hint}>Alert when stock falls below this number</div>
              </div>
            )}

            <button 
              onClick={saveNotifications} 
              disabled={saving}
              style={styles.saveBtn}
            >
              {saving ? '💾 Saving...' : '💾 Save Notifications'}
            </button>
          </div>
        )}
      </div>
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
    marginBottom: 20,
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
  tabs: {
    display: 'flex',
    gap: 8,
    marginBottom: 24,
    borderBottom: '2px solid #e5e7eb',
  },
  tab: {
    flex: 1,
    padding: '12px',
    background: 'none',
    border: 'none',
    borderBottom: '3px solid transparent',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    color: '#666',
  },
  tabActive: {
    flex: 1,
    padding: '12px',
    background: 'none',
    border: 'none',
    borderBottom: '3px solid #3b82f6',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    color: '#3b82f6',
  },
  content: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 24,
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 20,
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  label: {
    display: 'block',
    fontSize: 14,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '2px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '2px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  toggleGroup: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    background: '#f9fafb',
    borderRadius: 8,
    marginBottom: 16,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: 4,
  },
  toggleDesc: {
    fontSize: 13,
    color: '#6b7280',
  },
  switch: {
    position: 'relative',
    display: 'inline-block',
    width: 50,
    height: 28,
  },
  slider: {
    position: 'absolute',
    cursor: 'pointer',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ccc',
    transition: '.4s',
    borderRadius: 28,
  },
  saveBtn: {
    width: '100%',
    padding: '14px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 24,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    fontSize: 18,
    color: '#666',
  },
};
