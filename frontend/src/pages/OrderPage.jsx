import { useState, useEffect } from "react";

const API_BASE = "https://ekkilo.onrender.com";

export default function OrderPage() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const [location, setLocation] = useState(null);
  const [radius, setRadius] = useState(5);

  const [phone, setPhone] = useState("");
  const [showPhone, setShowPhone] = useState(true);

  // 📍 LOCATION
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => console.log("Location denied")
    );
  }, []);

  // 🔍 SEARCH
  const search = async () => {
    if (!text) return;

    setLoading(true);

    try {
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
      console.log("RESULT:", data);
      setResult(data);

    } catch (err) {
      console.error(err);
      alert("Search failed");
    }

    setLoading(false);
  };

  // 🧠 BUILD STORE TOTALS
  const stores = result?.store_view
    ? Object.entries(result.store_view)
        .map(([store, items]) => {
          const list = Object.values(items);
          const total = list.reduce((sum, i) => sum + i.price, 0);
          return { store, items: list, total };
        })
        .sort((a, b) => a.total - b.total)
    : [];

  // 📦 PLACE ORDER + WHATSAPP
  const placeOrder = async (selectedStore) => {
    if (!phone) return setShowPhone(true);

    await fetch(`${API_BASE}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        stores: [selectedStore],
      }),
    });

    const message = `Hi, I want to order:\n${selectedStore.items
      .map(i => `${i.name} - ₹${i.price}`)
      .join("\n")}\nTotal: ₹${selectedStore.total}`;

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
  };

  return (
    <div style={{ maxWidth: 500, margin: "auto", padding: 16 }}>

      <h2>🛒 Smart Kirana</h2>

      {/* 📱 PHONE POPUP */}
      {showPhone && (
        <div style={popupStyle}>
          <div style={popupBox}>
            <h3>Enter WhatsApp Number</h3>

            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10 digit number"
              style={{ width: "100%", padding: 10 }}
            />

            <button onClick={() => {
              if (!phone) return alert("Enter phone");
              setShowPhone(false);
            }}>
              Continue
            </button>
          </div>
        </div>
      )}

      {/* 🔍 SEARCH */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="milk, rice..."
          style={{ flex: 1 }}
        />
        <button onClick={search}>Search</button>
      </div>

      {/* 📍 RADIUS */}
      <div style={{ marginTop: 10 }}>
        Radius:
        <select
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
        >
          <option value={3}>3 km</option>
          <option value={5}>5 km</option>
          <option value={7}>7 km</option>
        </select>
      </div>

      {loading && <div>🔄 Searching...</div>}

      {!result && <div>Enter items to search</div>}

      {/* 💰 SAVINGS */}
      {result?.comparison && (
        <div style={{ marginTop: 10, color: "green" }}>
          💰 You save up to ₹
          {Math.max(
            ...Object.values(result.comparison)
              .flat()
              .map(o => o.savings || 0)
          )}
        </div>
      )}

      {/* 🧠 STORE LIST */}
      {stores.length > 0 && (
        <div>
          <h3>🏆 Best Stores</h3>

          {stores.map((store, idx) => (
            <div key={idx} style={cardStyle}>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <b>🏪 {store.store}</b>
                  {idx === 0 && (
                    <div style={{ fontSize: 12, color: "green" }}>
                      ⭐ Best Choice
                    </div>
                  )}
                </div>

                <b>₹{store.total}</b>
              </div>

              {store.items.map((item, i) => (
                <div key={i}>
                  {item.name} ({item.size}{item.unit}) — ₹{item.price}
                </div>
              ))}

              <button
                style={{
                  marginTop: 10,
                  width: "100%",
                  padding: 10,
                  background: "#22c55e",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8
                }}
                onClick={() => placeOrder(store)}
              >
                Order from this store
              </button>

            </div>
          ))}
        </div>
      )}

      {/* 🔍 COMPARISON */}
      {result?.comparison && (
        <div>
          <h3>🔍 Compare Prices</h3>

          {Object.entries(result.comparison).map(([item, options]) => (
            <div key={item} style={cardStyle}>
              <b>{item}</b>

              {options.map((opt, i) => (
                <div key={i}>
                  {opt.store} → ₹{opt.price}
                  {opt.is_best && " ⭐"}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

const popupStyle = {
  position: "fixed",
  top: 0, left: 0, right: 0, bottom: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center"
};

const popupBox = {
  background: "#fff",
  padding: 20,
  borderRadius: 10,
  width: 300
};

const cardStyle = {
  background: "#fff",
  padding: 12,
  marginTop: 12,
  borderRadius: 10
};