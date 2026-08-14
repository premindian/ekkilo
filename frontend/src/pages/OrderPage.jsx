import { useState, useEffect } from "react";
import { navigate } from '../utils/navigate';
import { useAuth } from "../context/AuthContext";
import BrandLogo from '../components/BrandLogo';

// Backend and frontend on SAME domain now!
const API_BASE = "";

function itemLabel(it) {
  if (!it) return "";
  if (it.display_name) return it.display_name;
  if (it.brand) return `${it.brand} ${it.name}`;
  return it.name || "";
}

function brandNote(it) {
  if (!it?.preferred_brand || it.brand_match !== false) return null;
  const wanted = String(it.preferred_brand).replace(/\b\w/g, (c) => c.toUpperCase());
  return `${wanted} not available — showing alternative`;
}

export default function OrderPage({ initialSearchText }) {
  const { user, token } = useAuth();
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState("regular");
  const [modeTouched, setModeTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState(null);
  const [radius, setRadius] = useState(5);
  const [cart, setCart] = useState({}); // selected items across Complete/Favorites/Regular/Manual
  const [favorites, setFavorites] = useState([]);
  const [regularStore, setRegularStore] = useState(null);
  const [gpsError, setGpsError] = useState(false);
  const [showCitySelector, setShowCitySelector] = useState(false);
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedStoreDetails, setSelectedStoreDetails] = useState(null);
  const [qcEstimate, setQcEstimate] = useState(null);
  const [checkout, setCheckout] = useState(null); // { normalized, grandTotal, lines }
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [upiEnabled, setUpiEnabled] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [payStatus, setPayStatus] = useState(""); // '', verifying, …

  useEffect(() => {
    fetch(`${API_BASE}/api/payments/config`)
      .then((r) => r.json())
      .then((d) => {
        const on = !!d?.upi_enabled;
        setUpiEnabled(on);
        setPaymentMethod(on ? "upi" : "pay_at_store");
      })
      .catch(() => {
        setUpiEnabled(false);
        setPaymentMethod("pay_at_store");
      });
  }, []);
  
  // Auto-search when initialSearchText is provided
  useEffect(() => {
    if (initialSearchText && initialSearchText.trim()) {
      setText(initialSearchText);
      // Trigger search after a brief delay
      const timer = setTimeout(async () => {
        setLoading(true);
        try {
          const res = await fetch(`${API_BASE}/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: initialSearchText,
              lat: location?.lat,
              lng: location?.lng,
              radius,
            }),
          });
          const data = await res.json();
          setResult(data);
          setCart({});
        } catch (err) {
          console.error("Search error:", err);
        } finally {
          setLoading(false);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [initialSearchText, location, radius]);

  const format = (n) => Number(n || 0).toFixed(2);

  // City coordinates (approximate city centers)
  const cities = {
    'vizag': { lat: 17.6868, lng: 83.2185, name: 'Visakhapatnam' },
    'vijayawada': { lat: 16.5062, lng: 80.6480, name: 'Vijayawada' },
    'guntur': { lat: 16.3067, lng: 80.4365, name: 'Guntur' },
    'tirupati': { lat: 13.6288, lng: 79.4192, name: 'Tirupati' },
    'nellore': { lat: 14.4426, lng: 79.9865, name: 'Nellore' },
    'kakinada': { lat: 16.9891, lng: 82.2475, name: 'Kakinada' },
    'rajahmundry': { lat: 17.0005, lng: 81.8040, name: 'Rajahmundry' },
    'hyderabad': { lat: 17.3850, lng: 78.4867, name: 'Hyderabad' }
  };

  const selectCity = (cityKey) => {
    const city = cities[cityKey];
    if (city) {
      setLocation({ lat: city.lat, lng: city.lng });
      setSelectedCity(cityKey);
      setShowCitySelector(false);
      setGpsError(false);
    }
  };

  // 📍 LOCATION
  useEffect(() => {
    // Try to get current GPS location
    if (!navigator.geolocation) {
      // No geolocation support - try last known location
      tryLastKnownLocation();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setLocation(newLocation);
        setGpsError(false);
        
        // Save to localStorage for future use
        localStorage.setItem('lastLocation', JSON.stringify(newLocation));
        localStorage.setItem('lastLocationTime', Date.now().toString());
      },
      (err) => {
        console.log("GPS denied:", err);
        // GPS failed - try last known location
        tryLastKnownLocation();
      },
      { timeout: 10000 } // 10 second timeout
    );
  }, []);

  const tryLastKnownLocation = () => {
    try {
      const lastLoc = localStorage.getItem('lastLocation');
      const lastTime = localStorage.getItem('lastLocationTime');
      
      if (lastLoc) {
        const loc = JSON.parse(lastLoc);
        const timeAgo = Date.now() - parseInt(lastTime || '0');
        const daysAgo = timeAgo / (1000 * 60 * 60 * 24);
        
        // Use last location if less than 30 days old
        if (daysAgo < 30) {
          setLocation(loc);
          console.log('Using last known location from', Math.floor(daysAgo), 'days ago');
          return;
        }
      }
    } catch (err) {
      console.error('Failed to load last location:', err);
    }
    
    // No last location or too old - show city selector
    setGpsError(true);
    setShowCitySelector(true);
  };

  // ⭐ LOAD FAVORITES & PREFERENCES
  useEffect(() => {
    if (!token) return;
    
    const loadFavorites = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/favorites/stores?token=${token}`);
        const data = await res.json();
        setFavorites(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load favorites:", err);
      }
    };

    const loadPreferences = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/preferences?token=${token}`);
        const data = await res.json();
        
        // Set regular store from preferences
        if (data.regular_store_name) {
          setRegularStore(data.regular_store_name);
        }
      } catch (err) {
        console.error("Failed to load preferences:", err);
      }
    };
    
    loadFavorites();
    loadPreferences();
  }, [token]);

  // Prefer Regular when set; otherwise Complete list — unless user picked a tab
  useEffect(() => {
    if (modeTouched) return;
    setMode(regularStore ? "regular" : "smart");
  }, [regularStore, modeTouched]);

  const pickMode = (next) => {
    setModeTouched(true);
    setMode(next);
  };

  // 🔍 SEARCH
  const search = async (searchText) => {
    const queryText = searchText || text;
    if (!queryText) return;

    setLoading(true);

    const res = await fetch(`${API_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: queryText,
        lat: location?.lat,
        lng: location?.lng,
        radius,
      }),
    });

    const data = await res.json();
    setResult(data);
    setCart({}); // fresh selection for new search results
    setLoading(false);

    // Sampled quick-commerce estimate (published weekly samples — not live)
    try {
      const itemNames =
        data?.comparison && typeof data.comparison === 'object'
          ? Object.keys(data.comparison)
          : queryText.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
      const qcRes = await fetch(`${API_BASE}/api/qc-benchmarks/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: itemNames,
          city: selectedCity || undefined,
        }),
      });
      const qcData = await qcRes.json().catch(() => null);
      setQcEstimate(qcData?.available && qcData.matched_count > 0 ? qcData : null);
    } catch (e) {
      setQcEstimate(null);
    }
  };

  const stores = Array.isArray(result?.stores) ? result.stores : [];
  const favoriteStores = Array.isArray(favorites) ? favorites : [];

  // 🧠 SMART SPLIT
  const splitMap = {};
  if (result?.comparison) {
    Object.entries(result.comparison).forEach(([item, options]) => {
      const best = options.find(o => o.is_best);
      if (!best) return;

      if (!splitMap[best.store]) {
        // Find store_phone from result.stores
        const storeData = stores.find(s => s.store === best.store);
        console.log(`🔍 Looking for store "${best.store}":`, storeData);
        console.log(`📞 Found phone:`, storeData?.store_phone);
        
        splitMap[best.store] = { 
          store: best.store, 
          store_phone: storeData?.store_phone,
          items: [], 
          total: 0 
        };
      }

      splitMap[best.store].items.push({
        name: item,
        price: best.price,
        size: best.size,
        unit: best.unit,
        packs: best.packs,
      });

      splitMap[best.store].total += best.price;
    });
  }

  const splitStores = Object.values(splitMap);
  const splitTotal = splitStores.reduce((s, x) => s + x.total, 0);

  // 🧩 ITEM SELECTION (all modes)
  const cartKey = (store, item) =>
    `${store}::${item.name}::${item.brand || ""}::${item.size || ""}::${item.unit || ""}`;

  const toggleCart = (store, item) => {
    const key = cartKey(store, item);
    setCart((prev) => {
      const copy = { ...prev };
      if (copy[key]) delete copy[key];
      else copy[key] = { ...item, store };
      return copy;
    });
  };

  const addAllToCart = (storeName, items) => {
    setCart((prev) => {
      const copy = { ...prev };
      (items || []).forEach((it) => {
        copy[cartKey(storeName, it)] = { ...it, store: storeName };
      });
      return copy;
    });
  };

  const isInCart = (store, item) => !!cart[cartKey(store, item)];

  const cartItems = Object.values(cart);
  const cartTotal = cartItems.reduce((s, i) => s + (Number(i.price) || 0), 0);

  const buildPayloadFromCart = () => {
    const grouped = cartItems.reduce((acc, item) => {
      let s = acc.find((x) => x.store === item.store);
      if (!s) {
        const storeData = stores.find(
          (st) => st.store?.toLowerCase().trim() === item.store?.toLowerCase().trim()
        );
        s = {
          store: item.store,
          store_phone: storeData?.store_phone || item.phone || null,
          items: [],
          total: 0,
        };
        acc.push(s);
      }
      s.items.push(item);
      s.total += Number(item.price) || 0;
      return acc;
    }, []);
    return grouped;
  };

  const normalizeOrderPayload = (storesPayload) =>
    (storesPayload || []).map((s) => {
      const items = Array.isArray(s.items) ? s.items : [];
      const total =
        s.total != null
          ? Number(s.total)
          : items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
      const storeData = stores.find(
        (st) => st.store?.toLowerCase().trim() === s.store?.toLowerCase().trim()
      );
      return {
        ...s,
        items,
        total: Number.isFinite(total) ? total : 0,
        store_phone: s.store_phone || storeData?.store_phone || null,
      };
    }).filter((s) => s.items.length > 0);

  // 📦 CHECKOUT — sheet with UPI / Pay at store (no prompt typing)
  const openCheckout = (storesPayload) => {
    if (!user?.phone) {
      alert("Please login to place order");
      return;
    }

    const normalized = normalizeOrderPayload(storesPayload);
    if (!normalized.length) {
      alert("Add at least one item before placing order");
      return;
    }

    const missingPhone = normalized.find((s) => !s.store_phone);
    if (missingPhone) {
      alert(`Missing store phone for ${missingPhone.store}. Try searching again.`);
      return;
    }

    const lines = normalized.map((store) => ({
      store: store.store,
      total: Number(store.total || 0),
      items: store.items.map(
        (item) =>
          `${itemLabel(item)} (${item.packs || 1} × ${item.size}${item.unit})`
      ),
    }));
    const grandTotal = normalized.reduce((sum, store) => sum + Number(store.total || 0), 0);

    setPaymentMethod(upiEnabled ? "upi" : "pay_at_store");
    setPayStatus("");
    setCheckout({ normalized, grandTotal, lines });
  };

  const closeCheckout = () => {
    if (placing) return;
    setCheckout(null);
    setPayStatus("");
  };

  const confirmCheckout = async () => {
    if (!checkout?.normalized?.length || placing) return;
    if (!token) {
      alert("Please log in to place an order.");
      return;
    }

    const method = paymentMethod === "upi" && upiEnabled ? "upi" : "pay_at_store";
    const normalized = checkout.normalized;
    const formatted = user.phone.startsWith("91") ? user.phone : "91" + user.phone;

    const goTrack = (orderId, trackToken, message) => {
      setCart({});
      setCheckout(null);
      setPayStatus("");
      const track = window.confirm(`${message}\n\nOpen tracking page now?`);
      if (track) {
        navigate(
          trackToken
            ? `/track?t=${encodeURIComponent(trackToken)}`
            : `/track?order_id=${orderId}`
        );
      }
    };

    const openRazorpay = (orderId, trackToken, payment) => {
      if (!window.Razorpay) {
        alert("Payment checkout failed to load. Refresh and try again.");
        setPlacing(false);
        return;
      }
      setPayStatus("Waiting for UPI payment…");
      const rzp = new window.Razorpay({
        key: payment.key_id,
        amount: payment.amount,
        currency: payment.currency || "INR",
        name: "Ekkilo",
        description: `Order #${orderId}`,
        order_id: payment.razorpay_order_id,
        prefill: {
          contact: formatted.replace(/^91/, ""),
          name: user?.name || "",
        },
        theme: { color: "#22c55e" },
        handler: async (response) => {
          setPayStatus("Verifying payment…");
          try {
            const verifyRes = await fetch(
              `${API_BASE}/api/payments/verify?token=${encodeURIComponent(token)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  final_order_id: orderId,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              }
            );
            const verifyData = await verifyRes.json().catch(() => ({}));
            if (!verifyRes.ok) {
              alert(`❌ Payment verify failed: ${verifyData.detail || verifyRes.statusText}`);
              setPayStatus("");
              setPlacing(false);
              return;
            }
            setPlacing(false);
            goTrack(
              orderId,
              verifyData.track_token || trackToken,
              `✅ Paid · Order #${orderId}\nStores have been notified.\nYou'll get a WhatsApp confirmation.`
            );
          } catch (err) {
            alert("❌ Payment verify failed. Contact support with your Order ID.");
            setPayStatus("");
            setPlacing(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPlacing(false);
            setPayStatus("");
            alert(
              `Payment not completed. Order #${orderId} is unpaid — stores were NOT notified.\n` +
                `You can track it, or place again and complete UPI.`
            );
          },
        },
      });
      rzp.open();
    };

    setPlacing(true);
    setPayStatus(method === "upi" ? "Starting UPI…" : "Placing order…");
    try {
      const res = await fetch(`${API_BASE}/order?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formatted,
          stores: normalized,
          payment_method: method,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const orderId = data.final_order_id;
      const trackToken = data.track_token;

      if (!res.ok) {
        const msg =
          typeof data.detail === "string"
            ? data.detail
            : data.error || "Failed to place order";
        alert(`❌ ${msg}`);
        setPlacing(false);
        setPayStatus("");
        return;
      }

      if (orderId && data.payment_required && data.payment) {
        openRazorpay(orderId, trackToken, data.payment);
        return;
      }

      if (orderId) {
        const fellBack =
          method === "upi" && data.payment_method === "pay_at_store";
        setPlacing(false);
        goTrack(
          orderId,
          trackToken,
          fellBack
            ? `✅ Order #${orderId} placed as Pay at store\n(UPI was unavailable)\nStores have been notified.`
            : `✅ Order #${orderId} placed!\nPay at the store when you pick up.\nStores have been notified.`
        );
      } else {
        alert(data.error || data.detail || "✅ Order placed!");
        setPlacing(false);
        setPayStatus("");
        setCheckout(null);
      }
    } catch (err) {
      alert("❌ Failed to place order. Please try again.");
      setPlacing(false);
      setPayStatus("");
    }
  };

  // legacy name used by sticky bar
  const placeOrder = (storesPayload) => openCheckout(storesPayload);

  const renderSelectableItem = (storeName, it, layout = "block") => {
    const selected = isInCart(storeName, it);
    const addBtn = (
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleCart(storeName, it);
        }}
        style={{
          background: selected ? "#ef4444" : "#22c55e",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "4px 8px",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        {selected ? "Remove" : "Add"}
      </button>
    );

    if (layout === "row") {
      return (
        <div key={cartKey(storeName, it)} style={row}>
          <span>
            {itemLabel(it)} ({it.packs || 1} × {it.size}{it.unit})
            {it.available === false && (
              <span style={{ fontSize: 11, color: "#ef4444", marginLeft: 6 }}>⚠️ Limited</span>
            )}
            {brandNote(it) && (
              <div style={{ fontSize: 11, color: "#b45309", marginTop: 2 }}>{brandNote(it)}</div>
            )}
          </span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            ₹{format(it.price)}
            {addBtn}
          </span>
        </div>
      );
    }

    return (
      <div key={cartKey(storeName, it)} style={itemBlock}>
        <div>
          <div>{itemLabel(it)}</div>
          <div style={itemMeta}>
            {[it.brand, it.variant, `${it.packs || 1} × ${it.size}${it.unit}`]
              .filter(Boolean)
              .join(" • ")}
          </div>
          {brandNote(it) && (
            <div style={{ fontSize: 11, color: "#b45309", marginTop: 2 }}>{brandNote(it)}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>₹{format(it.price)}</span>
          {addBtn}
        </div>
      </div>
    );
  };

  return (
    <div style={container}>

      {/* GPS STATUS */}
      <div style={{ 
        fontSize: 13, 
        padding: '12px 14px', 
        background: location ? '#f0fdf4' : (showCitySelector ? '#fef2f2' : '#fff8e1'),
        borderRadius: 10,
        border: `2px solid ${location ? '#22c55e' : (showCitySelector ? '#ef4444' : '#fbbf24')}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            {location ? (
              selectedCity ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🏙️</span>
                    <span style={{ color: '#166534', fontWeight: 600 }}>
                      {cities[selectedCity].name}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#166534', paddingLeft: 26 }}>
                    📍 {location.lat.toFixed(4)}°N, {location.lng.toFixed(4)}°E
                  </div>
                </>
              ) : localStorage.getItem('lastLocation') && gpsError ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>📍</span>
                    <span style={{ color: '#166534', fontWeight: 600 }}>
                      Last Known Location
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#166534', paddingLeft: 26 }}>
                    📍 {location.lat.toFixed(4)}°N, {location.lng.toFixed(4)}°E
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🛰️</span>
                    <span style={{ color: '#166534', fontWeight: 600 }}>
                      GPS Active
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#166534', paddingLeft: 26 }}>
                    📍 {location.lat.toFixed(4)}°N, {location.lng.toFixed(4)}°E
                  </div>
                </>
              )
            ) : showCitySelector ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <span style={{ color: '#991b1b', fontWeight: 600 }}>
                  Location needed • Select your city below
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>⏳</span>
                <span style={{ color: '#92400e', fontWeight: 600 }}>
                  Getting GPS location... Please wait
                </span>
              </div>
            )}
          </div>
          
          {/* Change Location Button */}
          {location && (
            <button
              onClick={() => setShowCitySelector(!showCitySelector)}
              style={{
                background: '#667eea',
                color: '#fff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              📍 Change
            </button>
          )}
        </div>
      </div>

      {/* CITY SELECTOR - Always show if toggled OR if GPS error */}
      {(showCitySelector || gpsError) && (
        <div style={{
          marginTop: 12,
          padding: 16,
          background: '#fff',
          borderRadius: 12,
          border: '2px solid #ef4444',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#1f2937' }}>
            📍 Select Your City
          </div>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
            Choose your city to see nearby stores:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {Object.entries(cities).map(([key, city]) => (
              <button
                key={key}
                onClick={() => selectCity(key)}
                style={{
                  padding: '12px',
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  fontSize: 14,
                  cursor: 'pointer',
                  textAlign: 'left',
                  minHeight: 44,
                  touchAction: 'manipulation'
                }}
              >
                📍 {city.name}
              </button>
            ))}
          </div>
          <div style={{ 
            marginTop: 12, 
            padding: 12, 
            background: '#fffbeb', 
            borderRadius: 8,
            fontSize: 13,
            color: '#92400e'
          }}>
            💡 Tip: Enable GPS in your browser for more accurate results
          </div>
        </div>
      )}

      {/* SEARCH */}
      <div style={searchBox}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && search()}
          placeholder="milk, oil..."
          style={{ flex: 1, border: "none" }}
        />
        <button style={btn} onClick={() => search()}>Search</button>
      </div>

      {/* MODES — Regular first; Complete list fills gaps (not store-vs-store war) */}
      <div style={{ marginTop: 10, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <button onClick={() => pickMode("regular")} style={mode==="regular"?active:tab}>
          🏪 Regular
        </button>
        <button onClick={() => pickMode("smart")} style={mode==="smart"?active:tab}>
          ✅ Complete list
        </button>
        <button onClick={() => pickMode("favorites")} style={mode==="favorites"?active:tab}>
          ⭐ Favorites
        </button>
        <button onClick={() => pickMode("manual")} style={mode==="manual"?active:tab}>
          ✋ Manual
        </button>
      </div>

      {/* REGULAR STORE INFO */}
      {mode === "regular" && regularStore && (
        <div style={{
          marginTop: 10,
          padding: 12,
          background: '#f0fdf4',
          borderRadius: 10,
          border: '1.5px solid #86efac',
          fontSize: 14,
        }}>
          🏪 Your kirana: <strong>{regularStore}</strong>
          <div style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>
            Shown first. Change in Profile → Preferences.
          </div>
        </div>
      )}
      {mode === "regular" && !regularStore && (
        <div style={{
          marginTop: 10,
          padding: 12,
          background: '#fff7ed',
          borderRadius: 10,
          border: '1px solid #fed7aa',
          fontSize: 14,
          color: '#9a3412',
        }}>
          No regular kirana set. Pick one in <strong>Profile → Preferences</strong> for faster ordering.
        </div>
      )}

      {/* QC vs local estimate (sampled weekly — not live Blinkit prices) */}
      {!loading && qcEstimate && (
        <div style={{
          marginTop: 12,
          padding: 12,
          background: '#ecfdf5',
          borderRadius: 8,
          borderLeft: '4px solid #10b981',
        }}>
          <div style={{ fontWeight: 'bold', color: '#065f46', marginBottom: 4 }}>
            Quick-commerce estimate ≈ ₹{format(qcEstimate.qc_total)}
          </div>
          <div style={{ fontSize: 13, color: '#047857' }}>
            Based on {qcEstimate.matched_count} sampled item(s) from {qcEstimate.source || 'QC'}
            {qcEstimate.sampled_on ? ` (${qcEstimate.sampled_on})` : ''}
            {qcEstimate.city ? ` · ${qcEstimate.city}` : ''}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
            {qcEstimate.disclaimer || 'Sampled weekly estimate — not live prices.'}
          </div>
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
          🔍 Finding items at local kiranas...
        </div>
      )}

      {/* NO RESULTS */}
      {!loading && result && stores.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          <p>😕 No stores found</p>
          <p style={{ fontSize: 14 }}>Try adjusting your search or location</p>
        </div>
      )}

      {/* MODE INDICATOR */}
      {!loading && result && stores.length > 0 && (
        <div style={{ 
          marginTop: 20, 
          padding: 12, 
          background: '#f0f8ff', 
          borderRadius: 8, 
          borderLeft: '4px solid #4CAF50' 
        }}>
          {mode === "smart" && (
            <>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>✅ Complete list</div>
              <div style={{ fontSize: 14, color: '#666' }}>
                See what’s also available nearby. Nothing is added unless you tap <strong>Add</strong> — then Place Order + UPI
              </div>
            </>
          )}
          {mode === "favorites" && (
            <>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>⭐ Favorites Mode</div>
              <div style={{ fontSize: 14, color: '#666' }}>
                Your favorite stores — tap <strong>Add</strong> to choose items
              </div>
            </>
          )}
          {mode === "regular" && (
            <>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>🏪 Regular Store Mode</div>
              <div style={{ fontSize: 14, color: '#666' }}>
                {regularStore || "Not set"} — tap <strong>Add</strong> on the items you want
              </div>
            </>
          )}
          {mode === "manual" && (
            <>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>✋ Manual Mode</div>
              <div style={{ fontSize: 14, color: '#666' }}>
                Pick items yourself from any store, then Place Order
              </div>
            </>
          )}
        </div>
      )}

      {/* Fill gaps tip (not store-vs-store price war) */}
      {!loading && result && stores.length > 0 && mode === "regular" && (
        <div
          onClick={() => pickMode("smart")}
          style={{
            marginTop: 10,
            padding: 12,
            background: '#ecfeff',
            borderRadius: 8,
            borderLeft: '4px solid #06b6d4',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontWeight: 'bold', color: '#0e7490', marginBottom: 4 }}>
            Want to check nearby?
          </div>
          <div style={{ fontSize: 14, color: '#666' }}>
            Open <strong>Complete list</strong> for items also available nearby — you choose what to add (we don’t auto-fill).
          </div>
        </div>
      )}

      {/* ✅ COMPLETE LIST (was Smart Buy) */}
      {!loading && mode==="smart" && (() => {
        const optimizedStores = stores.filter(s => s.is_optimized !== false);
        const sorted = [...optimizedStores].sort((a, b) => {
          const aReg = a.store?.toLowerCase().trim() === regularStore?.toLowerCase().trim();
          const bReg = b.store?.toLowerCase().trim() === regularStore?.toLowerCase().trim();
          if (aReg && !bReg) return -1;
          if (!aReg && bReg) return 1;
          return 0;
        });

        return sorted.map((store, i) => {
          const isRegular =
            store.store?.toLowerCase().trim() === regularStore?.toLowerCase().trim();
          return (
            <div key={i} style={{
              ...card,
              ...(isRegular
                ? { border: '2px solid #22c55e', boxShadow: '0 0 0 3px #22c55e22' }
                : {}),
            }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                  cursor: 'pointer',
                  padding: '4px 0',
                }}
                onClick={() => setSelectedStoreDetails(store)}
              >
                <div>
                  <b style={{ fontSize: 16 }}>🏪 {store.store}</b>
                  <div style={{ fontSize: 12, color: isRegular ? '#166534' : '#0e7490', marginTop: 2, fontWeight: isRegular ? 700 : 400 }}>
                    {isRegular ? 'Your kirana · preferred' : 'Also available nearby'}
                  </div>
                </div>
                {store.distance !== undefined ? (
                  <span style={{ fontSize: 13, color: '#666', fontWeight: 600 }}>
                    📍 {store.distance} km
                  </span>
                ) : (
                  <span style={{ fontSize: 13, color: '#999' }}>⏳ Distance...</span>
                )}
              </div>

              {store.items.map((it) => renderSelectableItem(store.store, it, "row"))}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <b>Subtotal: ₹{format(store.total)}</b>
                <button
                  style={{ ...orderButton, marginTop: 0, padding: "8px 12px", fontSize: 13 }}
                  onClick={() => addAllToCart(store.store, store.items)}
                >
                  ➕ Add all
                </button>
              </div>
            </div>
          );
        });
      })()}

      {/* ⭐ FAVORITES MODE */}
      {!loading && mode==="favorites" && (() => {
        const favoriteStoreNames = favoriteStores.map(f => f.store_name?.toLowerCase().trim());
        const filteredStores = stores.filter(s => 
          favoriteStoreNames.includes(s.store?.toLowerCase().trim())
        );
        
        if (filteredStores.length === 0 && stores.length > 0) {
          return (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              <p>😕 None of your favorite stores have these items</p>
              <p style={{ fontSize: 14 }}>Try Complete list or add more favorites</p>
            </div>
          );
        }
        
        return filteredStores.map((store, idx) => (
          <div key={idx} style={premiumCard}>
            <div 
              style={{...headerRow, cursor: 'pointer'}}
              onClick={() => setSelectedStoreDetails(store)}
            >
              <div>
                <b>⭐ {store.store}</b>
                {store.is_best && <span style={bestBadge}>Good match</span>}
              </div>
              <div>
                ₹{format(store.total)}
                <div style={distance}>
                  {store.distance !== undefined 
                    ? `📍 ${store.distance} km` 
                    : '⏳ Calculating...'}
                </div>
              </div>
            </div>

            <div style={reasonText}>
              {store.reason?.join(" • ")}
            </div>

            {store.items.map((item) => renderSelectableItem(store.store, item, "block"))}

            <button
              style={orderButton}
              onClick={() => addAllToCart(store.store, store.items)}
            >
              ➕ Add all from store
            </button>
          </div>
        ));
      })()}

      {/* 🏪 REGULAR STORE MODE */}
      {!loading && mode==="regular" && (() => {
        if (!regularStore) {
          return (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              <p>😕 No regular store set</p>
              <p style={{ fontSize: 14 }}>Add favorites, then set Regular store in Profile → Preferences</p>
            </div>
          );
        }
        
        // More robust store lookup (case-insensitive, trimmed)
        const myRegularStore = stores.find(s => 
          s.store?.toLowerCase().trim() === regularStore?.toLowerCase().trim()
        );
        
        if (!myRegularStore && stores.length > 0) {
          return (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              <p>😕 {regularStore} doesn't have these items</p>
              <p style={{ fontSize: 14 }}>Try Complete list for items also available nearby</p>
              <button type="button" style={{ ...orderButton, marginTop: 12 }} onClick={() => pickMode("smart")}>
                Open Complete list
              </button>
            </div>
          );
        }
        
        if (!myRegularStore) return null;
        
        return (
          <div style={{
            ...premiumCard,
            border: '2px solid #22c55e',
            boxShadow: '0 0 0 3px #22c55e22',
          }}>
            <div 
              style={{...headerRow, cursor: 'pointer'}}
              onClick={() => setSelectedStoreDetails(myRegularStore)}
            >
              <div>
                <b>🏪 {myRegularStore.store}</b>
                <div style={{ fontSize: 12, color: '#166534', fontWeight: 700, marginTop: 4 }}>
                  Your kirana · preferred
                </div>
              </div>
              <div>
                ₹{format(myRegularStore.total)}
                <div style={distance}>
                  {myRegularStore.distance !== undefined 
                    ? `📍 ${myRegularStore.distance} km` 
                    : '⏳ Calculating...'}
                </div>
              </div>
            </div>

            <div style={reasonText}>
              {myRegularStore.reason?.join(" • ")}
            </div>

            {myRegularStore.items.map((item) =>
              renderSelectableItem(myRegularStore.store, item, "block")
            )}

            <button
              style={orderButton}
              onClick={() => addAllToCart(myRegularStore.store, myRegularStore.items)}
            >
              ➕ Add all from your kirana
            </button>
          </div>
        );
      })()}

      {/* 🧩 MANUAL */}
      {!loading && mode==="manual" && Object.entries(result?.store_view || {}).map(([store, items])=>(
        <div key={store} style={premiumCard}>
          <div 
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: 12, 
              paddingBottom: 12, 
              borderBottom: '1px solid #f0f0f0',
              cursor: 'pointer'
            }}
            onClick={() => {
              const storeData = stores.find(s => s.store?.toLowerCase().trim() === store?.toLowerCase().trim());
              if (storeData) setSelectedStoreDetails(storeData);
            }}
          >
            <b style={{ fontSize: 16 }}>🏪 {store}</b>
            {(() => {
              const storeData = stores.find(s => 
                s.store?.toLowerCase().trim() === store?.toLowerCase().trim()
              );
              return storeData?.distance !== undefined ? (
                <span style={{ fontSize: 13, color: '#666', fontWeight: 600 }}>
                  📍 {storeData.distance} km
                </span>
              ) : (
                <span style={{ fontSize: 13, color: '#999' }}>
                  ⏳ Distance...
                </span>
              );
            })()}
          </div>

          {Object.values(items).map((it) => renderSelectableItem(store, it, "block"))}
        </div>
      ))}

      {/* 🔥 STICKY BAR — selected cart (all modes) */}
      {cartItems.length > 0 && (
        <div style={bottom}>
          <div>
            {cartItems.length} item(s) · ₹{format(cartTotal)}
          </div>

          <button
            style={btn}
            onClick={() => placeOrder(buildPayloadFromCart())}
          >
            Checkout
          </button>
        </div>
      )}

      {/* STORE DETAILS MODAL */}
      {selectedStoreDetails && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }}
          onClick={() => setSelectedStoreDetails(null)}
        >
          <div 
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 24,
              maxWidth: 400,
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 'bold' }}>
                🏪 {selectedStoreDetails.store}
              </h3>
              <button
                onClick={() => setSelectedStoreDetails(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 28,
                  cursor: 'pointer',
                  color: '#999',
                  padding: 0,
                  minWidth: 32,
                  minHeight: 32
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Distance */}
              {selectedStoreDetails.distance !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#f0fdf4', borderRadius: 8 }}>
                  <span style={{ fontSize: 24 }}>📍</span>
                  <div>
                    <div style={{ fontSize: 14, color: '#666' }}>Distance</div>
                    <div style={{ fontSize: 18, fontWeight: 'bold', color: '#166534' }}>
                      {selectedStoreDetails.distance} km away
                    </div>
                  </div>
                </div>
              )}

              {/* Phone */}
              {selectedStoreDetails.store_phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
                  <span style={{ fontSize: 24 }}>📞</span>
                  <div>
                    <div style={{ fontSize: 14, color: '#666' }}>Phone</div>
                    <a 
                      href={`tel:${selectedStoreDetails.store_phone}`}
                      style={{ fontSize: 16, fontWeight: 600, color: '#667eea', textDecoration: 'none' }}
                    >
                      {selectedStoreDetails.store_phone}
                    </a>
                  </div>
                </div>
              )}

              {/* Coordinates */}
              {selectedStoreDetails.lat && selectedStoreDetails.lng && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
                  <span style={{ fontSize: 24 }}>🗺️</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>Location</div>
                    <a
                      href={`https://www.google.com/maps?q=${selectedStoreDetails.lat},${selectedStoreDetails.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 14, color: '#667eea', textDecoration: 'none', fontWeight: 600 }}
                    >
                      Open in Maps →
                    </a>
                  </div>
                </div>
              )}

              {/* Items Available */}
              {selectedStoreDetails.items && selectedStoreDetails.items.length > 0 && (
                <div style={{ padding: 12, background: '#fffbeb', borderRadius: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BrandLogo variant="icon" height={18} alt="" />
                    Items Available ({selectedStoreDetails.items.length})
                  </div>
                  {selectedStoreDetails.items.map((item, i) => (
                    <div key={i} style={{ fontSize: 13, color: '#666', padding: '4px 0' }}>
                      • {itemLabel(item)}
                      {brandNote(item) ? ` (${brandNote(item)})` : ""}
                    </div>
                  ))}
                </div>
              )}

              {/* Total */}
              {selectedStoreDetails.total !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#f0fdf4', borderRadius: 8 }}>
                  <span style={{ fontSize: 24 }}>💰</span>
                  <div>
                    <div style={{ fontSize: 14, color: '#666' }}>Total</div>
                    <div style={{ fontSize: 20, fontWeight: 'bold', color: '#166534' }}>
                      ₹{format(selectedStoreDetails.total)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedStoreDetails(null)}
              style={{
                width: '100%',
                marginTop: 16,
                padding: 14,
                background: '#667eea',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 48
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* CHECKOUT — pay method sheet */}
      {checkout && (
        <div style={checkoutOverlay} onClick={closeCheckout}>
          <div style={checkoutSheet} onClick={(e) => e.stopPropagation()}>
            <div style={checkoutHead}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Checkout</h3>
              <button type="button" onClick={closeCheckout} style={checkoutClose} disabled={placing}>
                ×
              </button>
            </div>

            <div style={checkoutTotal}>
              <span>Total</span>
              <strong>₹{format(checkout.grandTotal)}</strong>
            </div>

            <div style={{ maxHeight: 140, overflowY: "auto", marginBottom: 14 }}>
              {checkout.lines.map((line) => (
                <div key={line.store} style={{ marginBottom: 10, fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>🏪 {line.store}</div>
                  {line.items.map((it, idx) => (
                    <div key={idx} style={{ color: "#4b5563", paddingLeft: 4 }}>
                      · {it}
                    </div>
                  ))}
                  <div style={{ color: "#166534", fontWeight: 600, marginTop: 2 }}>
                    ₹{format(line.total)}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
              How do you want to pay?
            </div>

            <button
              type="button"
              disabled={placing || !upiEnabled}
              onClick={() => upiEnabled && setPaymentMethod("upi")}
              style={{
                ...payOption,
                ...(paymentMethod === "upi" && upiEnabled ? payOptionOn : {}),
                ...(upiEnabled ? {} : payOptionDisabled),
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 15 }}>UPI online</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, lineHeight: 1.35 }}>
                {upiEnabled
                  ? "Pay now with Razorpay. Stores are notified only after payment."
                  : "UPI not configured on server yet — use Pay at store."}
              </div>
            </button>

            <button
              type="button"
              disabled={placing}
              onClick={() => setPaymentMethod("pay_at_store")}
              style={{
                ...payOption,
                ...(paymentMethod === "pay_at_store" ? payOptionOn : {}),
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 15 }}>Pay at store</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, lineHeight: 1.35 }}>
                Stores notified now. Pay when you pick up.
              </div>
            </button>

            {payStatus ? (
              <div style={{ fontSize: 13, color: "#166534", margin: "10px 0 4px", fontWeight: 600 }}>
                {payStatus}
              </div>
            ) : null}

            <button
              type="button"
              style={{
                ...btn,
                width: "100%",
                marginTop: 12,
                opacity: placing ? 0.7 : 1,
              }}
              disabled={placing}
              onClick={confirmCheckout}
            >
              {placing
                ? "Please wait…"
                : paymentMethod === "upi" && upiEnabled
                  ? `Pay ₹${format(checkout.grandTotal)} with UPI`
                  : `Place order · Pay at store`}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// 🎨 Mobile-First Responsive Styles
const container={
  maxWidth:520,
  margin:"auto",
  padding:"12px",
  paddingBottom:100,
  fontSize:"16px", // Prevents iOS zoom on input focus
};

const searchBox={
  display:"flex",
  gap:8,
  background:"#fff",
  padding:"12px",
  borderRadius:12,
  marginTop:10,
  boxShadow:"0 2px 8px rgba(0,0,0,0.06)"
};

const card={
  background:"#fff",
  padding:"14px",
  marginTop:10,
  borderRadius:12,
  boxShadow:"0 2px 6px rgba(0,0,0,0.04)"
};

const row={
  display:"flex",
  justifyContent:"space-between",
  alignItems:"center",
  padding:"8px 0"
};

const btn={
  background:"#22c55e",
  color:"#fff",
  border:"none",
  padding:"12px 20px",
  borderRadius:10,
  fontSize:16,
  fontWeight:600,
  cursor:"pointer",
  minHeight:44, // Touch-friendly
  touchAction:"manipulation" // Prevents double-tap zoom
};

const tab={
  padding:"10px 16px",
  marginRight:6,
  marginBottom:6,
  border:"1px solid #ddd",
  borderRadius:8,
  background:"#fff",
  fontSize:14,
  cursor:"pointer",
  minHeight:44, // Touch-friendly
  touchAction:"manipulation"
};

const active={
  padding:"10px 16px",
  marginRight:6,
  marginBottom:6,
  border:"2px solid #22c55e",
  borderRadius:8,
  background:"#f0fdf4",
  fontSize:14,
  fontWeight:"bold",
  cursor:"pointer",
  minHeight:44,
  touchAction:"manipulation"
};

const bottom={
  position:"fixed",
  bottom:0,
  left:0,
  right:0,
  background:"#000",
  color:"#fff",
  display:"flex",
  justifyContent:"space-between",
  alignItems:"center",
  padding:"14px 16px",
  boxShadow:"0 -4px 12px rgba(0,0,0,0.15)",
  zIndex:1000,
  minHeight:70 // Comfortable for thumbs
};

const popup={
  position:"fixed",
  top:0,left:0,right:0,bottom:0,
  background:"rgba(0,0,0,0.5)",
  display:"flex",
  justifyContent:"center",
  alignItems:"center",
  padding:16,
  zIndex:2000
};

const popupBox={
  background:"#fff",
  padding:"24px",
  borderRadius:12,
  maxWidth:340,
  width:"100%"
};

const input={
  width:"100%",
  padding:"12px",
  fontSize:16,
  border:"1px solid #ddd",
  borderRadius:8
};

const premiumCard={
  background:"#fff",
  padding:"16px",
  borderRadius:12,
  marginTop:12,
  boxShadow:"0 2px 8px rgba(0,0,0,0.06)"
};

const headerRow={
  display:"flex",
  justifyContent:"space-between",
  alignItems:"flex-start",
  gap:12
};

const bestBadge={
  marginLeft:6,
  background:"#22c55e",
  color:"#fff",
  padding:"4px 8px",
  borderRadius:6,
  fontSize:11,
  fontWeight:600
};

const distance={
  fontSize:13,
  color:"#666",
  marginTop:4
};

const reasonText={
  fontSize:13,
  color:"#666",
  marginTop:8,
  lineHeight:1.4
};

const itemBlock={
  display:"flex",
  justifyContent:"space-between",
  alignItems:"center",
  marginTop:12,
  padding:"10px 0",
  borderBottom:"1px solid #f0f0f0"
};

const itemMeta={
  fontSize:13,
  color:"#888",
  marginTop:4
};

const orderButton={
  marginTop:16,
  width:"100%",
  padding:"14px",
  background:"#22c55e",
  color:"#fff",
  border:"none",
  borderRadius:10,
  fontSize:16,
  fontWeight:600,
  cursor:"pointer",
  minHeight:48,
  touchAction:"manipulation"
};

const checkoutOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.5)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 10000,
  padding: 0,
};

const checkoutSheet = {
  background: "#fff",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  width: "100%",
  maxWidth: 520,
  padding: "16px 16px 24px",
  boxSizing: "border-box",
  maxHeight: "88vh",
  overflowY: "auto",
  boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
};

const checkoutHead = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
};

const checkoutClose = {
  border: "none",
  background: "#f3f4f6",
  width: 36,
  height: 36,
  borderRadius: 18,
  fontSize: 22,
  cursor: "pointer",
  lineHeight: 1,
};

const checkoutTotal = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "#f0fdf4",
  borderRadius: 12,
  padding: "12px 14px",
  marginBottom: 14,
  fontSize: 16,
};

const payOption = {
  width: "100%",
  textAlign: "left",
  border: "1.5px solid #e5e7eb",
  background: "#fff",
  borderRadius: 12,
  padding: "12px 14px",
  marginBottom: 8,
  cursor: "pointer",
  boxSizing: "border-box",
};

const payOptionOn = {
  border: "2px solid #22c55e",
  background: "#f0fdf4",
};

const payOptionDisabled = {
  opacity: 0.55,
  cursor: "not-allowed",
};
