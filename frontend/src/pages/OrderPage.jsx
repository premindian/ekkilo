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

  const formatPrice = (n) => Number(n || 0).toFixed(2);

  // 📍 LOCATION
  const getLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => alert("Location permission denied")
    );
  };

  useEffect(() => {
    getLocation();
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
      setResult(data);

    } catch (err) {
      alert("Search failed");
    }

    setLoading(false);
  };

  // 🧠 STORE LIST (SMART)
  const stores = result?.stores || [];

  // 📦 ORDER
  const placeOrder = async (store) => {
    if (!phone) return setShowPhone(true);

    const formattedPhone = phone.startsWith("91") ? phone : "91" + phone;

    try {
      const res = await fetch(`${API_BASE}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formattedPhone,
          stores: [store],
        }),
      });

      const data = await res.json();

      alert(`✅ Order placed! ID: ${data.final_order_id}`);

      setResult(null);
      setText("");

    } catch (err) {
      alert("Order failed");
    }
  };

  return (
    <div style={{ maxWidth: 520, margin: "auto", padding: 16 }}>

      <h2>🛒 Smart Kirana</h2>

      {/* 📱 PHONE MODAL */}
      {showPhone && (
        <div style={popupStyle}>
          <div style={popupBox}>
            <h3>Enter WhatsApp Number</h3>

            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10 digit number"
              style={inputStyle}
            />

            <button
              style={btnPrimary}
              onClick={() => {
                if (!phone) return alert("Enter phone");
                setShowPhone(false);
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* 🔍 SEARCH BAR */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="milk, oil..."
          style={inputStyle}
        />
        <button style={btnPrimary} onClick={search}>
          Search
        </button>
      </div>

      {/* 📍 LOCATION */}
      <div style={{ marginTop: 10 }}>
        📍 Radius:
        <select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
          <option value={3}>3 km</option>
          <option value={5}>5 km</option>
          <option value={7}>7 km</option>
        </select>

        <button onClick={getLocation} style={{ marginLeft: 10 }}>
          🔄 Refresh GPS
        </button>

        {location && (
          <div style={{ fontSize: 12, color: "#666" }}>
            {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
          </div>
        )}
      </div>

      {loading && <div>🔄 Searching...</div>}

      {/* 💰 SAVINGS */}
      {result?.comparison && (
        <div style={{ marginTop: 10, color: "green" }}>
          💰 Save up to ₹
          {formatPrice(
            Math.max(...Object.values(result.comparison).flat().map(o => o.savings || 0))
          )}
        </div>
      )}

      {/* 🏪 STORES */}
      {stores.map((store, idx) => (
        <div key={idx} style={cardStyle}>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <b>🏪 {store.store}</b>
              {store.is_best && (
                <span style={badge}>⭐ Best</span>
              )}
            </div>

            <b style={{ color: "green" }}>₹{formatPrice(store.total)}</b>
          </div>

          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            {store.reason?.join(" • ")} • {store.distance} km
          </div>

          {store.items.map((item, i) => (
            <div key={i} style={{ marginTop: 6 }}>
              {item.name} ({item.size}{item.unit}) — ₹{formatPrice(item.price)}
            </div>
          ))}

          <button
            style={btnOrder}
            onClick={() => placeOrder(store)}
          >
            🛒 Order from this store
          </button>

        </div>
      ))}

    </div>
  );
}

// 🎨 STYLES

const inputStyle = {
  flex: 1,
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ccc"
};

const btnPrimary = {
  padding: "10px 14px",
  background: "#22c55e",
  color: "#fff",
  border: "none",
  borderRadius: 8
};

const btnOrder = {
  marginTop: 10,
  width: "100%",
  padding: 10,
  background: "#16a34a",
  color: "#fff",
  border: "none",
  borderRadius: 8
};

const badge = {
  marginLeft: 6,
  background: "#22c55e",
  color: "#fff",
  padding: "2px 6px",
  borderRadius: 6,
  fontSize: 10
};

const cardStyle = {
  background: "#fff",
  padding: 14,
  marginTop: 12,
  borderRadius: 12,
  boxShadow: "0 2px 6px rgba(0,0,0,0.08)"
};

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
  borderRadius: 12,
  width: 300
};