import { useState, useEffect } from "react";

export default function OrderPage() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const [selectedStores, setSelectedStores] = useState({});
  const [favouriteStore, setFavouriteStore] = useState(null);

  const [mode, setMode] = useState("smart_multi");
  const [location, setLocation] = useState(null);
  const [radius, setRadius] = useState(5);

  const API_BASE = "https://ekkilo.onrender.com";

  // ✅ PHONE POPUP STATE
  const [phone, setPhone] = useState(localStorage.getItem("phone") || "");
  const [showPhonePopup, setShowPhonePopup] = useState(!phone);

  const formatQty = (opt) =>
    `${opt?.packs ?? 1} × ${opt?.size ?? 1}${opt?.unit ?? ""}`;

  // 📍 LOCATION
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) =>
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => console.log("Location denied")
    );
  }, []);

  // 🔍 SEARCH (MANUAL ONLY)
  const search = async () => {
    if (!text) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          text,
          lat: location?.lat,
          lng: location?.lng,
          radius,
        }),
      });

      const data = await res.json();
      console.log("RESULT:", data);
      setResult(data);
    } catch (err) {
      console.error(err);
      alert("Search failed");
    }

    setLoading(false);
  };

  // 🔧 SAFE STORE FILTER
  const validStores = new Set((result?.stores || []).map(s => s.store));

  const filteredStoreView = result?.store_view
    ? Object.fromEntries(
        Object.entries(result.store_view).filter(([store]) =>
          validStores.has(store)
        )
      )
    : {};

  const toggleStore = (item, store) => {
    setSelectedStores(prev => ({ ...prev, [item]: store }));
  };

  const getBestSingleStore = () => {
    let best = null, min = Infinity;

    Object.entries(filteredStoreView).forEach(([store, items]) => {
      const total = Object.values(items).reduce((a,b)=>a+(b.price||0),0);
      if (total < min) { min = total; best = store; }
    });

    return best;
  };

  const calculateTotal = () => {
    return Object.entries(result?.comparison || {}).reduce((sum,[item,opts])=>{
      const sel = selectedStores[item];
      const opt = opts.find(o=>o.store===sel);
      return sum + (opt?.price || 0);
    },0);
  };

  useEffect(() => {
    if (result?.comparison) {
      const defaults = {};
      Object.entries(result.comparison).forEach(([item, options]) => {
        const best = options.find(o=>o.is_best);
        if (best) defaults[item] = best.store;
      });
      setSelectedStores(defaults);
    }

    if (result?.stores?.length) {
      setFavouriteStore(result.stores[0].store);
    }
  }, [result]);

  // 📦 ORDER
  const placeOrder = async () => {
    if (!phone) return setShowPhonePopup(true);
    if (!result) return alert("No result");

    await fetch(`${API_BASE}/order`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        phone,
        stores: result.stores
      }),
    });

    alert("✅ Order sent!");
  };

  return (
    <div style={{maxWidth:480, margin:"auto", padding:16}}>

      <h2>🛒 Smart Kirana</h2>

      {/* 🔥 PHONE POPUP */}
      {showPhonePopup && (
        <div style={{background:"#fff", padding:20, borderRadius:12}}>
          <h3>Enter WhatsApp Number</h3>
          <input
            value={phone}
            onChange={(e)=>setPhone(e.target.value)}
            placeholder="10 digit number"
          />
          <button onClick={()=>{
            if (!phone) return alert("Enter phone");
            localStorage.setItem("phone", phone);
            setShowPhonePopup(false);
          }}>
            Continue
          </button>
        </div>
      )}

      {/* 🔍 SEARCH */}
      <input
        value={text}
        onChange={(e)=>setText(e.target.value)}
        placeholder="milk, rice..."
      />
      <button onClick={search}>Search</button>

      {loading && <div>🔄 Loading...</div>}

      {!result && <div>Enter items to search</div>}

      {/* RESULTS */}
      {result && (
        <>
          {(result.stores || []).map((store, idx)=>(
            <div key={idx}>
              <h4>{store.store} - ₹{store.total}</h4>

              {(store.items || []).map((item,i)=>(
                <div key={i}>
                  {item.name} - ₹{item.price}
                </div>
              ))}
            </div>
          ))}

          <h3>💰 Total: ₹{result.total || 0}</h3>

          <button onClick={placeOrder}>Place Order</button>
        </>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 480,
    margin: "auto",
    padding: 16,
    fontFamily: "Inter, system-ui, Arial",
    background: "#f6f7f9",
    minHeight: "100vh"
  },

  /* 🔥 TOP BOX (NEW) */
  topBox: {
    background: "#fff",
    padding: 12,
    borderRadius: 16,
    boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
    marginBottom: 12
  },

  phoneInput: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #eee",
    marginBottom: 10,
    fontSize: 14
  },

  searchRow: {
    display: "flex",
    gap: 8
  },

  input: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #eee",
    fontSize: 14,
    outline: "none"
  },

  searchBtn: {
    background: "#ff4d4f",
    color: "white",
    border: "none",
    padding: "0 16px",
    borderRadius: 12,
    cursor: "pointer",
    fontSize: 16
  },

  /* 🔄 MODE SWITCH */
  modeSwitch: {
    display: "flex",
    gap: 8,
    marginTop: 14,
    overflowX: "auto"
  },

  modeBtn: {
    border: "none",
    padding: "6px 12px",
    borderRadius: 20,
    fontSize: 12,
    cursor: "pointer"
  },

  /* 🏪 CARD */
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    boxShadow: "0 4px 14px rgba(0,0,0,0.08)"
  },

  storeHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    fontSize: 14,
    fontWeight: 600
  },

  storeTotal: {
    color: "#28a745"
  },

  badge: {
    background: "#28a745",
    color: "white",
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 6,
    marginLeft: 6
  },

  /* 🧾 ITEMS */
  itemRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
    borderBottom: "1px solid #f0f0f0"
  },

  itemMeta: {
    fontSize: 11,
    color: "#888"
  },

  /* 💰 TOTAL */
  totalBox: {
    background: "#111",
    color: "white",
    padding: 14,
    borderRadius: 14,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 16
  },

  orderBtn: {
    marginTop: 12,
    width: "100%",
    padding: 14,
    background: "#22c55e",
    color: "white",
    border: "none",
    borderRadius: 14,
    fontSize: 16,
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow: "0 4px 10px rgba(34,197,94,0.3)"
  },

  subtotal: {
    marginTop: 10,
    borderTop: "1px solid #eee",
    paddingTop: 10,
    fontWeight: "bold"
  },

  /* ❤️ STORE SELECTOR */
  storeSelector: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 15
  },

  storeChip: {
    padding: "8px 12px",
    borderRadius: 20,
    cursor: "pointer",
    fontSize: 14
  },

  /* 📍 INFO */
  distance: {
    fontSize: 11,
    color: "#888"
  },

  reason: {
    fontSize: 12,
    color: "#555",
    marginBottom: 8,
    marginTop: -4
  }
};