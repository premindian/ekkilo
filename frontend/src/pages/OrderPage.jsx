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

  const [phone, setPhone] = useState(localStorage.getItem("phone") || "");
  // -----------------------------
  // 🔧 FORMAT QTY (FIXED)
  // -----------------------------
  const formatQty = (opt) => {
    const packs = opt?.packs ?? 1;
    const size = opt?.size ?? 1;
    const unit = opt?.unit ?? "";
    return `${packs} × ${size}${unit}`;
  };


  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        console.log("📍 Location:", loc);
        setLocation(loc);
      },
      () => {
        console.log("⚠️ Location permission denied");
      }
    );
  }, []);

  // -----------------------------
  // 🔧 FILTER VALID STORES (CRITICAL FIX)
  // -----------------------------
  const validStores = new Set(
    (result?.stores || []).map((s) => s.store)
  );

  const filteredStoreView = Object.fromEntries(
    Object.entries(result?.store_view || {}).filter(([store]) =>
      validStores.has(store)
    )
  );

  // -----------------------------
  const toggleStore = (item, store) => {
    setSelectedStores((prev) => ({
      ...prev,
      [item]: store,
    }));
  };

  const search = async () => {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          lat: location?.lat,
          lng: location?.lng,
          radius,
        }),
      });

      const data = await res.json();
      setResult(data);
    } catch (err) {
      alert("Search failed");
    }

    setLoading(false);
  };

  // -----------------------------
  // 🔧 BEST STORE FIXED
  // -----------------------------
  const getBestSingleStore = () => {
    if (!filteredStoreView) return null;

    let bestStore = null;
    let bestTotal = Infinity;

    Object.entries(filteredStoreView).forEach(([store, items]) => {
      let total = 0;

      Object.values(items).forEach((i) => {
        total += i.price || 0;
      });

      if (total < bestTotal) {
        bestTotal = total;
        bestStore = store;
      }
    });

    return bestStore;
  };

  const calculateTotal = () => {
    if (!result?.comparison) return 0;

    let total = 0;

    Object.entries(result.comparison).forEach(([item, options]) => {
      const selectedStore = selectedStores[item];
      const selectedOption = options.find(
        (opt) => opt.store === selectedStore
      );

      if (selectedOption) total += selectedOption.price;
    });

    return total;
  };

  useEffect(() => {
    if (text && location) {
      search();
    }
  }, [text, location, radius]);

  const refreshLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        console.log("🔄 Refreshed location:", loc);
        setLocation(loc);
      },
      () => {
        alert("Unable to fetch location");
      }
    );
  };

  // -----------------------------
  // 🔧 DEFAULT STORE SELECTIONS
  // -----------------------------
  useEffect(() => {
    if (result?.comparison) {
      const defaults = {};
      Object.entries(result.comparison).forEach(([item, options]) => {
        const best = options.find((o) => o.is_best);
        if (best) defaults[item] = best.store;
      });
      setSelectedStores(defaults);
    }

    // 🔥 FIX: favourite default
    if (result?.stores?.length) {
      setFavouriteStore(result.stores[0].store);
    }
  }, [result]);

  const placeOrder = async () => {
    if (!result) return;

    await fetch(`${API_BASE}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: phone,
        stores: result.stores.map((s) => ({
          store: s.store,
          store_phone: s.store_phone || "",
          items: s.items.map((i) => ({
            name: i.name,
            qty: i.packs,
            price: i.price,
          })),
        })),
      }),
    });

    alert("✅ Order sent!");
  };



  return (
    <div style={styles.container}>
      <h2>🛒 Smart Kirana</h2>

      {/* 🔥 TOP BOX */}
      <div style={styles.topBox}>

        {/* 📱 PHONE */}
        <input
          placeholder="📱 WhatsApp number"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            localStorage.setItem("phone", e.target.value);
          }}
          style={styles.phoneInput}
        />

        {/* 🔍 SEARCH */}
        <div style={styles.searchRow}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add items (milk, rice...)"
            style={styles.input}
          />

          <button
            onClick={search}
            disabled={!location}
            style={{
              ...styles.searchBtn,
              opacity: location ? 1 : 0.5,
            }}
          >
            🔍
          </button>
        </div>

      </div>

      {/* 🔄 LOADING */}
      {loading && (
        <div style={{ fontSize: 12, color: "gray", marginTop: 6 }}>
          🔄 Finding best prices...
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        📍 Radius:
        <select
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          style={{ marginLeft: 8 }}
        >
          <option value={3}>3 km</option>
          <option value={5}>5 km</option>
          <option value={7}>7 km</option>
        </select>
      </div>
      <div style={{ marginTop: 6 }}>
        <button
          onClick={refreshLocation}
          style={{
            fontSize: 11,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: "pointer"
          }}
        >
          🔄 Refresh GPS
        </button>
      </div>

      <div style={{ fontSize: 11, color: "gray", marginTop: 4 }}>
        📍{" "}
        {location
          ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
          : "Fetching location..."}
      </div>

      {/* MODES */}
      <div style={styles.modeSwitch}>
        {[
          { key: "smart_multi", label: "🧠 Smart" },
          { key: "smart_single", label: "🏪 One Store" },
          { key: "manual", label: "🎛 Manual" },
          { key: "favourite", label: "❤️ Fav" },
        ].map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            style={{
              ...styles.modeBtn,
              background: mode === m.key ? "#111" : "#eee",
              color: mode === m.key ? "#fff" : "#333",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {!result && <div>👉 Enter items</div>}

      {result && (
        <>
          {/* MANUAL */}
          {mode === "manual" &&
            Object.entries(result.comparison || {}).map(
              ([item, options]) => (
                <div key={item} style={styles.card}>
                  <b>{item}</b>

                  {options.map((opt, i) => (
                    <div
                      key={i}
                      onClick={() => toggleStore(item, opt.store)}
                      style={{
                        ...styles.itemRow,
                        background:
                          selectedStores[item] === opt.store
                            ? "#e6fff2"
                            : "",
                        cursor: "pointer",
                      }}
                    >
                      <div>
                        {opt.store}
                        <div style={styles.itemMeta}>
                          {formatQty(opt)}
                        </div>
                      </div>

                      <div>₹{opt.price}</div>
                    </div>
                  ))}
                </div>
              )
            )}

          {/* ONE STORE */}
          {mode === "smart_single" && (
            <div style={styles.card}>
              <b>{getBestSingleStore()}</b>

              {Object.keys(result.comparison || {}).map((item) => {
                const data =
                  filteredStoreView[getBestSingleStore()]?.[item];

                return (
                  <div key={item} style={styles.itemRow}>
                    <div>
                      {item}
                      <div style={styles.itemMeta}>
                        {data ? formatQty(data) : "❌ Not Available"}
                      </div>
                    </div>

                    <div>{data ? `₹${data.price}` : "--"}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* FAV */}
          {mode === "favourite" && (
            <>
              <div style={styles.storeSelector}>
                {Object.keys(filteredStoreView).map((store) => (
                  <div
                    key={store}
                    onClick={() => setFavouriteStore(store)}
                    style={{
                      ...styles.storeChip,
                      background:
                        favouriteStore === store ? "#28a745" : "#eee",
                      color:
                        favouriteStore === store ? "#fff" : "#000",
                    }}
                  >
                    {store}
                  </div>
                ))}
              </div>

              {favouriteStore && (
                <div style={styles.card}>
                  <b>{favouriteStore}</b>

                  {Object.keys(result.comparison || {}).map((item) => {
                    const data =
                      filteredStoreView[favouriteStore]?.[item];

                    return (
                      <div key={item} style={styles.itemRow}>
                        <div>
                          {item}
                          <div style={styles.itemMeta}>
                            {data
                              ? formatQty(data)
                              : "❌ Not Available"}
                          </div>
                        </div>

                        <div>{data ? `₹${data.price}` : "--"}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* SMART MULTI */}
          {/* SMART MULTI */}
          {mode === "smart_multi" &&
            (result?.stores || []).map((store, idx) => (
              <div key={idx} style={styles.card}>

                {/* STORE HEADER */}
                <div style={styles.storeHeader}>
                  <div>
                    🏪 {store.store}

                    {store.is_best && (
                      <span style={styles.badge}> ⭐ Best</span>
                    )}
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={styles.storeTotal}>₹{store.total}</div>

                    {/* 📍 DISTANCE */}
                    {store.distance !== undefined && (
                      <div style={styles.distance}>
                        📍 {store.distance} km
                      </div>
                    )}
                  </div>
                </div>

                {/* 🧠 AI REASON */}
                {store.reason && (
                  <div style={styles.reason}>
                    {store.reason.join(" • ")}
                  </div>
                )}

                {/* ITEMS */}
                {store.items.map((item, i) => (
                  <div key={i} style={styles.itemRow}>
                    <div>
                      {item.name}
                      <div style={styles.itemMeta}>
                        {formatQty(item)}
                      </div>
                    </div>

                    <div>₹{item.price}</div>
                  </div>
                ))}

                {/* SUBTOTAL */}
                <div style={styles.subtotal}>
                  Subtotal: ₹{store.total}
                </div>
              </div>
            ))}
          {/* TOTAL */}
          <div style={styles.totalBox}>
            💰 ₹
            {mode === "manual"
              ? calculateTotal()
              : mode === "smart_single"
                ? Object.values(
                  filteredStoreView[getBestSingleStore()] || {}
                ).reduce((a, b) => a + (b.price || 0), 0)
                : mode === "favourite"
                  ? Object.values(
                    filteredStoreView[favouriteStore] || {}
                  ).reduce((a, b) => a + (b.price || 0), 0)
                  : result.total}
          </div>

          <button onClick={placeOrder} style={styles.orderBtn}>
            📲 Place Order
          </button>
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