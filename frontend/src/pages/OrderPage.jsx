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

function DeliveryChip({ opt, subtotal }) {
  if (!opt?.delivery_enabled) {
    return <span style={pickupChip}>Pickup</span>;
  }
  const freeMin = Number(opt.free_delivery_min || 0);
  const fee = Number(opt.delivery_fee || 0);
  const sub = Number(subtotal || 0);
  if (freeMin > 0 && sub >= freeMin) {
    return <span style={deliveryChip}>🚚 Free delivery</span>;
  }
  if (freeMin > 0) {
    return (
      <span style={deliveryChip}>
        🚚 Free ≥ ₹{freeMin}
        {fee > 0 ? ` · else ₹${fee}` : ""}
      </span>
    );
  }
  if (fee > 0) return <span style={deliveryChip}>🚚 ₹{fee} delivery</span>;
  return <span style={deliveryChip}>🚚 Delivery</span>;
}

const ORDER_MODES = [
  {
    id: "regular",
    label: "My Kirana",
    hint: "Your go-to shop first",
    icon: "🏪",
  },
  {
    id: "smart",
    label: "Fill Gaps",
    hint: "Add missing from nearby",
    icon: "✨",
  },
  {
    id: "favorites",
    label: "Favorites",
    hint: "Only saved stores",
    icon: "★",
  },
  {
    id: "manual",
    label: "Store Pick",
    hint: "Choose item by item",
    icon: "✋",
  },
];

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
  const [checkout, setCheckout] = useState(null); // sheet state
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [upiEnabled, setUpiEnabled] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [payStatus, setPayStatus] = useState(""); // '', verifying, …
  const [deliveryByPhone, setDeliveryByPhone] = useState({});

  const phoneTail = (p) => String(p || "").replace(/\D/g, "").slice(-10);

  const loadDeliveryOptions = async (storeList) => {
    const phones = (storeList || [])
      .map((s) => s.store_phone)
      .filter(Boolean);
    if (!phones.length) {
      setDeliveryByPhone({});
      return;
    }
    const subtotals = {};
    (storeList || []).forEach((s) => {
      const t = phoneTail(s.store_phone);
      if (t) subtotals[t] = Number(s.total || 0);
    });
    try {
      const res = await fetch(
        `${API_BASE}/api/stores/fulfillment-options${token ? `?token=${encodeURIComponent(token)}` : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phones, subtotals }),
        }
      );
      const data = await res.json().catch(() => ({}));
      setDeliveryByPhone(data.stores || {});
    } catch (e) {
      console.error(e);
      setDeliveryByPhone({});
    }
  };

  const deliveryOptFor = (store) => {
    if (!store) return null;
    return deliveryByPhone[phoneTail(store.store_phone)] || null;
  };

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
          loadDeliveryOptions(Array.isArray(data?.stores) ? data.stores : []);
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
    loadDeliveryOptions(Array.isArray(data?.stores) ? data.stores : []);

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

  // 📦 CHECKOUT — sheet with pickup/delivery + UPI / Pay at store
  const openCheckout = async (storesPayload) => {
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

    const phones = normalized.map((s) => s.store_phone);
    const subtotals = {};
    normalized.forEach((s) => {
      subtotals[phoneTail(s.store_phone)] = Number(s.total || 0);
    });

    let deliveryMap = {};
    try {
      const res = await fetch(
        `${API_BASE}/api/stores/fulfillment-options${token ? `?token=${encodeURIComponent(token)}` : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phones, subtotals }),
        }
      );
      const data = await res.json().catch(() => ({}));
      deliveryMap = data.stores || {};
    } catch (e) {
      console.error(e);
    }

    const fulfillByStore = {};
    const deliveryNotes = {};
    normalized.forEach((s) => {
      const t = phoneTail(s.store_phone);
      fulfillByStore[t] = "pickup";
      deliveryNotes[t] = "";
    });

    setPaymentMethod(upiEnabled ? "upi" : "pay_at_store");
    setPayStatus("");
    setCheckout({ normalized, deliveryMap, fulfillByStore, deliveryNotes });
  };

  const closeCheckout = () => {
    if (placing) return;
    setCheckout(null);
    setPayStatus("");
  };

  const buildCheckoutStores = () => {
    if (!checkout?.normalized) return { stores: [], grandTotal: 0, lines: [], itemsTotal: 0, deliveryTotal: 0 };
    const lines = [];
    let grandTotal = 0;
    let itemsTotal = 0;
    let deliveryTotal = 0;
    const stores = checkout.normalized.map((store) => {
      const t = phoneTail(store.store_phone);
      const opt = checkout.deliveryMap?.[t] || {};
      const itemsSub = Number(store.total || 0);
      const fulfillment =
        opt.delivery_enabled && checkout.fulfillByStore?.[t] === "delivery"
          ? "delivery"
          : "pickup";
      let delivery_fee = 0;
      if (fulfillment === "delivery") {
        const freeMin = Number(opt.free_delivery_min || 0);
        const fee = Number(opt.delivery_fee || 0);
        delivery_fee =
          freeMin > 0 && itemsSub >= freeMin
            ? 0
            : Math.max(0, fee);
      }
      const total = itemsSub + delivery_fee;
      grandTotal += total;
      itemsTotal += itemsSub;
      deliveryTotal += delivery_fee;
      lines.push({
        store: store.store,
        phoneTail: t,
        itemsSub,
        delivery_fee,
        fulfillment,
        total,
        items: store.items.map(
          (item) =>
            `${itemLabel(item)} (${item.packs || 1} × ${item.size}${item.unit})`
        ),
        delivery_enabled: !!opt.delivery_enabled,
        free_delivery_min: Number(opt.free_delivery_min || 0),
        listed_fee: Number(opt.delivery_fee || 0),
        delivery_notes: opt.delivery_notes || "",
      });
      return {
        ...store,
        total,
        fulfillment,
        delivery_fee,
        delivery_note: (checkout.deliveryNotes?.[t] || "").trim() || undefined,
      };
    });
    return { stores, grandTotal, lines, itemsTotal, deliveryTotal };
  };

  const confirmCheckout = async () => {
    if (!checkout?.normalized?.length || placing) return;
    if (!token) {
      alert("Please log in to place an order.");
      return;
    }

    const method = paymentMethod === "upi" && upiEnabled ? "upi" : "pay_at_store";
    const { stores: normalized, grandTotal } = buildCheckoutStores();
    if (!normalized.length) return;
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

  const checkoutView = checkout ? buildCheckoutStores() : null;
  const activeMode = ORDER_MODES.find((m) => m.id === mode) || ORDER_MODES[0];

  return (
    <div style={container}>
      <div style={pageHero}>
        <div style={heroEyebrow}>Compare & checkout</div>
        <h1 style={heroTitle}>Prices</h1>
        <p style={heroSub}>
          Search your list, pick how to buy, then checkout — pickup or store delivery.
        </p>

        {/* Location strip */}
        <div
          style={{
            ...locStrip,
            borderColor: location ? "#86efac" : showCitySelector ? "#fca5a5" : "#fcd34d",
            background: location ? "rgba(240,253,244,0.95)" : showCitySelector ? "rgba(254,242,242,0.95)" : "rgba(255,251,235,0.95)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {location ? (
              <>
                <div style={locTitle}>
                  {selectedCity ? `📍 ${cities[selectedCity].name}` : gpsError ? "📍 Last known location" : "📍 Near you"}
                </div>
                <div style={locMeta}>
                  {location.lat.toFixed(4)}°N, {location.lng.toFixed(4)}°E
                </div>
              </>
            ) : showCitySelector ? (
              <div style={{ ...locTitle, color: "#991b1b" }}>Location needed — pick your city</div>
            ) : (
              <div style={{ ...locTitle, color: "#92400e" }}>Getting your location…</div>
            )}
          </div>
          {location && (
            <button
              type="button"
              onClick={() => setShowCitySelector(!showCitySelector)}
              style={locChangeBtn}
            >
              Change
            </button>
          )}
        </div>

        {(showCitySelector || gpsError) && (
          <div style={cityPanel}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: "#111827" }}>
              Select your city
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
              {Object.entries(cities).map(([key, city]) => (
                <button key={key} type="button" onClick={() => selectCity(key)} style={cityBtn}>
                  {city.name}
                </button>
              ))}
            </div>
            <div style={cityTip}>Enable GPS in your browser for tighter nearby results.</div>
          </div>
        )}

        <div style={searchShell}>
          <span style={{ fontSize: 16, opacity: 0.55 }}>🔍</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && search()}
            placeholder='Try "milk, atta, oil"…'
            style={searchInput}
          />
          <button type="button" style={searchBtn} onClick={() => search()}>
            Search
          </button>
        </div>
      </div>

      {/* Modes — named for clarity */}
      <div style={modeSection}>
        <div style={modeSectionLabel}>How do you want to buy?</div>
        <div style={modeGrid}>
          {ORDER_MODES.map((m) => {
            const on = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => pickMode(m.id)}
                style={{
                  ...modeCard,
                  ...(on ? modeCardOn : {}),
                }}
              >
                <span style={modeIcon}>{m.icon}</span>
                <span style={modeLabel}>{m.label}</span>
                <span style={{ ...modeHint, ...(on ? { color: "#166534" } : {}) }}>{m.hint}</span>
              </button>
            );
          })}
        </div>

        <div style={modeBanner}>
          <div style={modeBannerTitle}>
            {activeMode.icon} {activeMode.label}
          </div>
          {mode === "regular" && regularStore && (
            <div style={modeBannerBody}>
              Ordering from <strong>{regularStore}</strong> first. Change in Profile → Settings.
            </div>
          )}
          {mode === "regular" && !regularStore && (
            <div style={modeBannerBody}>
              Set your go-to shop in <strong>Profile → Settings</strong> for faster checkout.
            </div>
          )}
          {mode === "smart" && (
            <div style={modeBannerBody}>
              See what’s also available nearby. Nothing is added unless you tap <strong>Add</strong>.
            </div>
          )}
          {mode === "favorites" && (
            <div style={modeBannerBody}>
              Only your saved favorites. Add stores in Profile → Favorites.
            </div>
          )}
          {mode === "manual" && (
            <div style={modeBannerBody}>
              Open any store and pick items yourself — full control.
            </div>
          )}
        </div>
      </div>

      {/* QC vs local estimate (sampled weekly — not live Blinkit prices) */}
      {!loading && qcEstimate && (
        <div style={qcCard}>
          <div style={{ fontWeight: 800, color: "#065f46", marginBottom: 4 }}>
            Quick-commerce estimate ≈ ₹{format(qcEstimate.qc_total)}
          </div>
          <div style={{ fontSize: 13, color: "#047857" }}>
            Based on {qcEstimate.matched_count} sampled item(s) from {qcEstimate.source || "QC"}
            {qcEstimate.sampled_on ? ` (${qcEstimate.sampled_on})` : ""}
            {qcEstimate.city ? ` · ${qcEstimate.city}` : ""}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
            {qcEstimate.disclaimer || "Sampled weekly estimate — not live prices."}
          </div>
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div style={{ textAlign: "center", padding: 48, color: "#6b7280" }}>
          Finding items at local kiranas…
        </div>
      )}

      {/* NO RESULTS */}
      {!loading && result && stores.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>
          <p style={{ fontWeight: 700, color: "#6b7280" }}>No stores found</p>
          <p style={{ fontSize: 14 }}>Try a shorter search or change location</p>
        </div>
      )}

      {/* Fill gaps tip */}
      {!loading && result && stores.length > 0 && mode === "regular" && (
        <div
          onClick={() => pickMode("smart")}
          style={fillGapsTip}
        >
          <div style={{ fontWeight: 800, color: "#0f766e", marginBottom: 4 }}>
            Missing something?
          </div>
          <div style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.4 }}>
            Open <strong>Fill Gaps</strong> to see nearby options — you choose what to add.
          </div>
        </div>
      )}

      {/* ✅ FILL GAPS */}
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
                  <div style={{ marginTop: 6 }}>
                    <DeliveryChip opt={deliveryOptFor(store)} subtotal={store.total} />
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
              <p style={{ fontSize: 14 }}>Try Fill Gaps or add more favorites</p>
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
                <div style={{ marginTop: 6 }}>
                  <DeliveryChip opt={deliveryOptFor(store)} subtotal={store.total} />
                </div>
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
              <p>😕 No My Kirana set</p>
              <p style={{ fontSize: 14 }}>Set your go-to shop in Profile → Settings</p>
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
              <p style={{ fontSize: 14 }}>Try Fill Gaps for items also available nearby</p>
              <button type="button" style={{ ...orderButton, marginTop: 12 }} onClick={() => pickMode("smart")}>
                Open Fill Gaps
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
                <div style={{ marginTop: 6 }}>
                  <DeliveryChip opt={deliveryOptFor(myRegularStore)} subtotal={myRegularStore.total} />
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
              return (
                <div style={{ textAlign: 'right' }}>
                  {storeData?.distance !== undefined ? (
                    <span style={{ fontSize: 13, color: '#666', fontWeight: 600 }}>
                      📍 {storeData.distance} km
                    </span>
                  ) : (
                    <span style={{ fontSize: 13, color: '#999' }}>
                      ⏳ Distance...
                    </span>
                  )}
                  <div style={{ marginTop: 6 }}>
                    <DeliveryChip
                      opt={deliveryOptFor(storeData)}
                      subtotal={
                        storeData?.total ??
                        Object.values(items || {}).reduce((s, it) => s + Number(it.price || 0) * Number(it.packs || 1), 0)
                      }
                    />
                  </div>
                </div>
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
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>Ready to order</div>
            <div style={{ fontWeight: 700 }}>
              {cartItems.length} item{cartItems.length === 1 ? "" : "s"} · ₹{format(cartTotal)}
            </div>
          </div>

          <button
            style={{ ...btn, background: "#22c55e", boxShadow: "0 4px 12px rgba(34,197,94,0.35)" }}
            onClick={() => placeOrder(buildPayloadFromCart())}
          >
            Checkout →
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

              <div style={{ padding: 12, background: '#f0fdfa', borderRadius: 8 }}>
                <div style={{ fontSize: 14, color: '#666', marginBottom: 6 }}>Fulfillment</div>
                <DeliveryChip
                  opt={deliveryOptFor(selectedStoreDetails)}
                  subtotal={selectedStoreDetails.total}
                />
                {deliveryOptFor(selectedStoreDetails)?.delivery_notes ? (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                    {deliveryOptFor(selectedStoreDetails).delivery_notes}
                  </div>
                ) : null}
              </div>

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

      {/* CHECKOUT — fulfillment + pay method sheet */}
      {checkout && checkoutView && (
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
              <strong>₹{format(checkoutView.grandTotal)}</strong>
            </div>
            {(checkoutView.deliveryTotal > 0 || checkoutView.lines.length > 1) && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: -8, marginBottom: 12 }}>
                Items ₹{format(checkoutView.itemsTotal)}
                {checkoutView.deliveryTotal > 0
                  ? ` · Delivery ₹${format(checkoutView.deliveryTotal)}`
                  : ''}
                {checkoutView.lines.length > 1
                  ? ' · Each store handles its own pickup/delivery'
                  : ''}
              </div>
            )}

            <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 14 }}>
              {checkoutView.lines.map((line) => (
                <div
                  key={line.phoneTail || line.store}
                  style={{
                    marginBottom: 12,
                    fontSize: 13,
                    padding: 10,
                    background: "#f9fafb",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>🏪 {line.store}</div>
                  {line.items.map((it, idx) => (
                    <div key={idx} style={{ color: "#4b5563", paddingLeft: 4 }}>
                      · {it}
                    </div>
                  ))}
                  <div style={{ color: "#374151", marginTop: 4 }}>
                    Items ₹{format(line.itemsSub)}
                    {line.fulfillment === "delivery" && (
                      <span>
                        {" · "}
                        {line.delivery_fee > 0
                          ? `Delivery ₹${format(line.delivery_fee)}`
                          : "Free delivery"}
                      </span>
                    )}
                  </div>

                  {line.delivery_enabled ? (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#374151" }}>
                        Pickup or store delivery?
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          disabled={placing}
                          onClick={() =>
                            setCheckout((c) => ({
                              ...c,
                              fulfillByStore: { ...c.fulfillByStore, [line.phoneTail]: "pickup" },
                            }))
                          }
                          style={{
                            ...payOption,
                            marginBottom: 0,
                            flex: 1,
                            minWidth: 120,
                            ...(line.fulfillment === "pickup" ? payOptionOn : {}),
                            padding: "8px 10px",
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: 13 }}>Pickup</div>
                        </button>
                        <button
                          type="button"
                          disabled={placing}
                          onClick={() =>
                            setCheckout((c) => ({
                              ...c,
                              fulfillByStore: { ...c.fulfillByStore, [line.phoneTail]: "delivery" },
                            }))
                          }
                          style={{
                            ...payOption,
                            marginBottom: 0,
                            flex: 1,
                            minWidth: 120,
                            ...(line.fulfillment === "delivery" ? payOptionOn : {}),
                            padding: "8px 10px",
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: 13 }}>Store delivery</div>
                          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                            {line.free_delivery_min > 0 && line.itemsSub >= line.free_delivery_min
                              ? `Free (over ₹${line.free_delivery_min})`
                              : line.listed_fee > 0
                                ? `₹${line.listed_fee} if under ₹${line.free_delivery_min || "—"}`
                                : "Store handles drop"}
                          </div>
                        </button>
                      </div>
                      {line.delivery_notes ? (
                        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                          {line.delivery_notes}
                        </div>
                      ) : null}
                      {line.fulfillment === "delivery" && (
                        <input
                          type="text"
                          placeholder="Landmark / area for the store"
                          value={checkout.deliveryNotes?.[line.phoneTail] || ""}
                          disabled={placing}
                          onChange={(e) =>
                            setCheckout((c) => ({
                              ...c,
                              deliveryNotes: {
                                ...c.deliveryNotes,
                                [line.phoneTail]: e.target.value,
                              },
                            }))
                          }
                          style={{
                            width: "100%",
                            marginTop: 8,
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            fontSize: 14,
                            boxSizing: "border-box",
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                      Pickup only (this store has not enabled delivery)
                    </div>
                  )}
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
                Stores notified now. Pay when you pick up or on delivery.
              </div>
            </button>

            <div style={moneyNote}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Money & cancels</div>
              {paymentMethod === "upi" && upiEnabled ? (
                <>
                  You pay Ekkilo online; kiranas see the order only after UPI succeeds.
                  Ekkilo settles with stores — don’t pay the shop again.
                  Cancel early (before Ready) and message us for a UPI refund.
                </>
              ) : (
                <>
                  You pay the kirana directly at pickup/delivery.
                  Cancel early for free if the order isn’t Ready yet — no online payment to refund.
                </>
              )}
            </div>

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
                  ? `Pay ₹${format(checkoutView.grandTotal)} with UPI`
                  : `Place order · ₹${format(checkoutView.grandTotal)}`}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// 🎨 Mobile-First — Prices screen
const container = {
  maxWidth: 560,
  margin: "auto",
  padding: "0 0 110px",
  fontSize: 16,
  fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
  background: "linear-gradient(180deg, #ecfdf5 0%, #f8fafc 28%, #f8fafc 100%)",
  minHeight: "100vh",
  boxSizing: "border-box",
};

const pageHero = {
  padding: "18px 16px 16px",
  background: "linear-gradient(145deg, #0f766e 0%, #15803d 55%, #16a34a 100%)",
  color: "#fff",
  borderRadius: "0 0 22px 22px",
  boxShadow: "0 10px 28px rgba(15,118,110,0.22)",
};

const heroEyebrow = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  opacity: 0.85,
  marginBottom: 4,
};

const heroTitle = {
  margin: 0,
  fontSize: 28,
  fontWeight: 800,
  letterSpacing: "-0.02em",
};

const heroSub = {
  margin: "6px 0 14px",
  fontSize: 13,
  lineHeight: 1.45,
  opacity: 0.92,
  maxWidth: 420,
};

const locStrip = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1.5px solid",
  marginBottom: 12,
  color: "#14532d",
};

const locTitle = { fontSize: 13, fontWeight: 700 };
const locMeta = { fontSize: 11, opacity: 0.8, marginTop: 2 };

const locChangeBtn = {
  border: "none",
  background: "#0f766e",
  color: "#fff",
  fontWeight: 700,
  fontSize: 12,
  padding: "8px 12px",
  borderRadius: 8,
  cursor: "pointer",
  flexShrink: 0,
};

const cityPanel = {
  marginBottom: 12,
  padding: 12,
  background: "rgba(255,255,255,0.96)",
  borderRadius: 12,
  color: "#111",
};

const cityBtn = {
  padding: "12px 10px",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textAlign: "left",
  minHeight: 44,
  color: "#0f172a",
};

const cityTip = {
  marginTop: 10,
  fontSize: 12,
  color: "#92400e",
  background: "#fffbeb",
  padding: "8px 10px",
  borderRadius: 8,
};

const searchShell = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "#fff",
  borderRadius: 14,
  padding: "4px 4px 4px 12px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
};

const searchInput = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  fontSize: 15,
  padding: "11px 0",
  background: "transparent",
  color: "#111",
};

const searchBtn = {
  border: "none",
  background: "#14532d",
  color: "#fff",
  fontWeight: 700,
  borderRadius: 10,
  padding: "10px 14px",
  cursor: "pointer",
  minHeight: 44,
};

const modeSection = { padding: "14px 14px 0" };

const modeSectionLabel = {
  fontSize: 12,
  fontWeight: 700,
  color: "#64748b",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  marginBottom: 8,
};

const modeGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const modeCard = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  textAlign: "left",
  padding: "12px 12px 10px",
  borderRadius: 14,
  border: "1.5px solid #e2e8f0",
  background: "#fff",
  cursor: "pointer",
  minHeight: 78,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  touchAction: "manipulation",
};

const modeCardOn = {
  border: "2px solid #22c55e",
  background: "#f0fdf4",
  boxShadow: "0 0 0 3px rgba(34,197,94,0.12)",
};

const modeIcon = { fontSize: 18, lineHeight: 1 };
const modeLabel = { fontSize: 14, fontWeight: 800, color: "#0f172a", marginTop: 2 };
const modeHint = { fontSize: 11, color: "#64748b", lineHeight: 1.3 };

const modeBanner = {
  marginTop: 10,
  padding: "12px 14px",
  background: "#fff",
  borderRadius: 14,
  border: "1px solid #e2e8f0",
  boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
};

const modeBannerTitle = { fontWeight: 800, fontSize: 14, color: "#0f172a", marginBottom: 4 };
const modeBannerBody = { fontSize: 13, color: "#4b5563", lineHeight: 1.4 };

const fillGapsTip = {
  margin: "10px 14px 0",
  padding: 14,
  background: "#f0fdfa",
  borderRadius: 14,
  border: "1px solid #99f6e4",
  cursor: "pointer",
};

const qcCard = {
  margin: "12px 14px 0",
  padding: 14,
  background: "#ecfdf5",
  borderRadius: 14,
  border: "1px solid #a7f3d0",
};

const searchBox = {
  display: "flex",
  gap: 8,
  background: "#fff",
  padding: "12px",
  borderRadius: 12,
  marginTop: 10,
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
};

const card = {
  background: "#fff",
  padding: "16px",
  margin: "10px 14px 0",
  borderRadius: 16,
  boxShadow: "0 2px 10px rgba(15,23,42,0.05)",
  border: "1px solid #eef2f7",
};

const row = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 0",
};

const btn = {
  background: "#16a34a",
  color: "#fff",
  border: "none",
  padding: "12px 20px",
  borderRadius: 12,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  minHeight: 44,
  touchAction: "manipulation",
};

const tab = {
  padding: "10px 16px",
  marginRight: 6,
  marginBottom: 6,
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "#fff",
  fontSize: 14,
  cursor: "pointer",
  minHeight: 44,
  touchAction: "manipulation",
};

const active = {
  padding: "10px 16px",
  marginRight: 6,
  marginBottom: 6,
  border: "2px solid #22c55e",
  borderRadius: 8,
  background: "#f0fdf4",
  fontSize: 14,
  fontWeight: "bold",
  cursor: "pointer",
  minHeight: 44,
  touchAction: "manipulation",
};

const bottom = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  background: "linear-gradient(180deg, #0f172a 0%, #020617 100%)",
  color: "#fff",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 16px",
  boxShadow: "0 -8px 24px rgba(0,0,0,0.2)",
  zIndex: 1000,
  minHeight: 70,
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
  borderRadius:16,
  margin:"10px 14px 0",
  boxShadow:"0 2px 10px rgba(15,23,42,0.05)",
  border:"1px solid #eef2f7"
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

const deliveryChip={
  display:"inline-block",
  background:"#ecfdf5",
  color:"#065f46",
  border:"1px solid #a7f3d0",
  padding:"3px 8px",
  borderRadius:999,
  fontSize:11,
  fontWeight:700,
  lineHeight:1.3,
};

const pickupChip={
  display:"inline-block",
  background:"#f3f4f6",
  color:"#4b5563",
  border:"1px solid #e5e7eb",
  padding:"3px 8px",
  borderRadius:999,
  fontSize:11,
  fontWeight:700,
  lineHeight:1.3,
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

const moneyNote = {
  marginTop: 10,
  padding: "10px 12px",
  background: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: 10,
  fontSize: 12,
  color: "#78350f",
  lineHeight: 1.45,
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
