import { useState, useEffect } from "react";

const API_BASE = "https://ekkilo.onrender.com";

export default function OrderPage() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState("smart"); // smart | one
  const [loading, setLoading] = useState(false);

  const [location, setLocation] = useState(null);
  const [radius, setRadius] = useState(5);

  const [phone, setPhone] = useState("");
  const [showPhone, setShowPhone] = useState(true);

  const formatPrice = (n) => Number(n || 0).toFixed(2);
const format = (n) => Number(n || 0).toFixed(2);
  // 📍 LOCATION
  const getLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => alert("Location denied")
    );
  };

  useEffect(() => {
    getLocation();
  }, []);

  // 🔍 SEARCH
  const search = async () => {
    if (!text) return;

    setLoading(true);

    const res = await fetch(`${API_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        lat: location?.lat,
        lng: location?.lng,
        radius,
      }),
    });

    const data = await res.json();
    setResult(data);
    setLoading(false);
  };

  // 🧠 SINGLE STORE
  const stores = result?.stores || [];

  // 🧠 SPLIT LOGIC (🔥 MAGIC)
  const splitStores = {};

  if (result?.comparison) {
    Object.entries(result.comparison).forEach(([item, options]) => {
      const best = options.find(o => o.is_best);
      if (!best) return;

      if (!splitStores[best.store]) {
        splitStores[best.store] = {
          store: best.store,
          items: [],
          total: 0
        };
      }

      splitStores[best.store].items.push({
        name: item,
        price: best.price,
        size: best.size,
        unit: best.unit
      });

      splitStores[best.store].total += best.price;
    });
  }

  const splitList = Object.values(splitStores);
  const splitTotal = splitList.reduce((sum, s) => sum + s.total, 0);

  // 📦 ORDER
  const placeOrder = async (storesPayload) => {
    if (!phone) return setShowPhone(true);

    const formattedPhone = phone.startsWith("91") ? phone : "91" + phone;

    await fetch(`${API_BASE}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: formattedPhone,
        stores: storesPayload,
      }),
    });

    alert("✅ Order placed!");
    setResult(null);
  };

  return (
    <div style={container}>

      {/* PHONE */}
      {showPhone && (
        <div style={popup}>
          <div style={popupBox}>
            <h3>Enter WhatsApp Number</h3>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={input}
            />
            <button style={btn} onClick={() => setShowPhone(false)}>
              Continue
            </button>
          </div>
        </div>
      )}

      <h2>🛒 Smart Kirana</h2>

      {/* SEARCH */}
      <div style={searchBox}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="milk, oil..."
          style={{ flex: 1, border: "none" }}
        />
        <button style={btn} onClick={search}>Search</button>
      </div>

      {/* MODES */}
      <div style={{ marginTop: 10 }}>
        <button onClick={() => setMode("smart")} style={mode === "smart" ? active : tab}>🧠 Smart</button>
        <button onClick={() => setMode("one")} style={mode === "one" ? active : tab}>🏪 One Store</button>
      </div>

      {/* SAVINGS */}
      {result?.comparison && (
        <div style={{ color: "green", marginTop: 10 }}>
          💰 Save up to ₹
          {formatPrice(Math.max(...Object.values(result.comparison).flat().map(o => o.savings || 0)))}
        </div>
      )}

      {/* 🔥 SMART SPLIT */}
      {mode === "smart" && splitList.length > 0 && (
        <div>

          <h3>⚡ Cheapest Combo (Split)</h3>

          {splitList.map((store, idx) => (
            <div key={idx} style={card}>
              <b>🏪 {store.store}</b>

              {store.items.map((item, i) => (
                <div key={i} style={row}>
                  <span>{item.name}</span>
                  <span>₹{formatPrice(item.price)}</span>
                </div>
              ))}

              <b>Subtotal: ₹{formatPrice(store.total)}</b>
            </div>
          ))}

          <div style={totalBox}>
            💰 Total: ₹{formatPrice(splitTotal)}
          </div>

          <button style={bigBtn} onClick={() => placeOrder(splitList)}>
            🚀 Order Cheapest Combo
          </button>

        </div>
      )}

      {/* 🏪 ONE STORE */}
     {stores.map((store, idx) => (
  <div key={idx} style={premiumCard}>

    {/* HEADER */}
    <div style={headerRow}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>🏪</span>
        <b style={{ fontSize: 16 }}>{store.store}</b>

        {store.is_best && (
          <span style={bestBadge}>⭐ Best</span>
        )}
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{ color: "#16a34a", fontWeight: "bold" }}>
          ₹{format(store.total)}
        </div>
        <div style={distance}>
          📍 {store.distance} km
        </div>
      </div>
    </div>

    {/* REASONS */}
    <div style={reasonText}>
      {store.reason?.join(" • ")}
    </div>

    {/* ITEMS */}
    <div style={{ marginTop: 12 }}>
      {store.items.map((item, i) => (
        <div key={i} style={itemBlock}>

          <div>
            <div style={itemName}>{item.name}</div>

            <div style={itemMeta}>
              {item.packs || 1} × {item.size}{item.unit}
            </div>
          </div>

          <div style={itemPrice}>
            ₹{format(item.price)}
          </div>

        </div>
      ))}
    </div>

    {/* SUBTOTAL */}
    <div style={divider}></div>

    <div style={subtotalRow}>
      <b>Subtotal</b>
      <b>₹{format(store.total)}</b>
    </div>

    {/* CTA */}
    <button
      style={orderButton}
      onClick={() => placeOrder([store])}
    >
      🛒 Place Order
    </button>

  </div>
))}
    </div>
  );
}

// 🎨 styles
const container = { maxWidth: 500, margin: "auto", padding: 16 };
const searchBox = { display: "flex", gap: 8, background: "#fff", padding: 10, borderRadius: 10 };
const card = { background: "#fff", padding: 12, marginTop: 10, borderRadius: 10 };
const row = { display: "flex", justifyContent: "space-between" };
const btn = { background: "#22c55e", color: "#fff", padding: 10, border: "none", borderRadius: 8 };
const bigBtn = { ...btn, width: "100%", marginTop: 10 };
const totalBox = { background: "#000", color: "#fff", padding: 10, marginTop: 10 };
const tab = { marginRight: 10 };
const active = { marginRight: 10, fontWeight: "bold" };

const popup = {
  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
  background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center"
};

const popupBox = {
  background: "#fff", padding: 20, borderRadius: 10, width: 300
};

const input = { width: "100%", padding: 10, marginBottom: 10 };
const premiumCard = {
  background: "#ffffff",
  padding: 16,
  borderRadius: 16,
  marginTop: 14,
  boxShadow: "0 6px 18px rgba(0,0,0,0.08)"
};

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center"
};

const bestBadge = {
  background: "#22c55e",
  color: "#fff",
  padding: "3px 8px",
  borderRadius: 8,
  fontSize: 11
};

const distance = {
  fontSize: 12,
  color: "#666"
};

const reasonText = {
  marginTop: 6,
  fontSize: 12,
  color: "#6b7280"
};

const itemBlock = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 10
};

const itemName = {
  fontSize: 15,
  fontWeight: 500
};

const itemMeta = {
  fontSize: 12,
  color: "#888"
};

const itemPrice = {
  fontWeight: "bold"
};

const divider = {
  height: 1,
  background: "#eee",
  marginTop: 12
};

const subtotalRow = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: 10
};

const orderButton = {
  marginTop: 12,
  width: "100%",
  padding: 12,
  background: "#22c55e",
  color: "#fff",
  border: "none",
  borderRadius: 12,
  fontWeight: "bold"
};