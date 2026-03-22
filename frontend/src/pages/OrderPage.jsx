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
    <div style={container}>

      {/* 📱 PHONE MODAL */}
      {showPhone && (
        <div style={popupStyle}>
          <div style={popupBox}>
            <h3>Enter WhatsApp Number</h3>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10 digit number"
              style={input}
            />
            <button
              style={primaryBtn}
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

      {/* 🔝 HEADER */}
      <div style={header}>
        <h2 style={{ margin: 0 }}>🛒 Smart Kirana</h2>

        <div style={locationBox}>
          📍 {location
            ? `${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}`
            : "Fetching location..."}
          <button onClick={getLocation} style={smallBtn}>🔄</button>
        </div>
      </div>

      {/* 🔍 SEARCH */}
      <div style={searchBox}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="milk, oil..."
          style={{ flex: 1, border: "none", outline: "none" }}
        />
        <button style={primaryBtn} onClick={search}>Search</button>
      </div>

      {/* 📍 RADIUS */}
      <div style={{ marginTop: 10 }}>
        Radius:
        <select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
          <option value={3}>3 km</option>
          <option value={5}>5 km</option>
          <option value={7}>7 km</option>
        </select>
      </div>

      {loading && <div style={{ marginTop: 10 }}>🔄 Searching...</div>}

      {/* 💰 SAVINGS */}
      {result?.comparison && (
        <div style={savings}>
          💰 Save up to ₹
          {formatPrice(
            Math.max(...Object.values(result.comparison).flat().map(o => o.savings || 0))
          )}
        </div>
      )}

      {/* 🏪 STORE CARDS */}
      <div style={{ marginTop: 10 }}>
        {stores.map((store, idx) => (
          <div key={idx} style={card}>

            <div style={cardHeader}>
              <div>
                <b>{store.store}</b>
                {store.is_best && <span style={badge}>Best</span>}
              </div>
              <b style={{ color: "#16a34a" }}>₹{formatPrice(store.total)}</b>
            </div>

            <div style={subText}>
              {store.reason?.join(" • ")} • {store.distance} km
            </div>

            <div style={{ marginTop: 8 }}>
              {store.items.map((item, i) => (
                <div key={i} style={itemRow}>
                  <span>{item.name} ({item.size}{item.unit})</span>
                  <span>₹{formatPrice(item.price)}</span>
                </div>
              ))}
            </div>

            <button style={orderBtn} onClick={() => placeOrder(store)}>
              Order from this store
            </button>

          </div>
        ))}
      </div>

      {/* 🧾 STICKY TOTAL BAR */}
      {stores.length > 0 && (
        <div style={bottomBar}>
          <div>
            <div style={{ fontSize: 12 }}>Total</div>
            <div style={{ fontWeight: "bold" }}>
              ₹{formatPrice(stores[0]?.total)}
            </div>
          </div>

          <button style={placeBtn} onClick={() => placeOrder(stores[0])}>
            Place Order
          </button>
        </div>
      )}

    </div>
  );
}

// 🎨 STYLES

const container = {
  maxWidth: 520,
  margin: "auto",
  padding: 16,
  paddingBottom: 100,
  background: "#f8fafc"
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center"
};

const locationBox = {
  fontSize: 12,
  color: "#666"
};

const searchBox = {
  display: "flex",
  gap: 8,
  background: "#fff",
  padding: 10,
  borderRadius: 12,
  marginTop: 10
};

const card = {
  background: "#fff",
  padding: 14,
  borderRadius: 14,
  marginTop: 12,
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
};

const cardHeader = {
  display: "flex",
  justifyContent: "space-between"
};

const subText = {
  fontSize: 12,
  color: "#666",
  marginTop: 4
};

const itemRow = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: 4
};

const badge = {
  marginLeft: 6,
  background: "#22c55e",
  color: "#fff",
  padding: "2px 6px",
  borderRadius: 6,
  fontSize: 10
};

const orderBtn = {
  marginTop: 10,
  width: "100%",
  padding: 10,
  background: "#16a34a",
  color: "#fff",
  border: "none",
  borderRadius: 10
};

const primaryBtn = {
  padding: "8px 12px",
  background: "#22c55e",
  color: "#fff",
  border: "none",
  borderRadius: 8
};

const smallBtn = {
  marginLeft: 6,
  fontSize: 10
};

const bottomBar = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  background: "#000",
  color: "#fff",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 20px"
};

const placeBtn = {
  background: "#22c55e",
  border: "none",
  color: "#fff",
  padding: "10px 16px",
  borderRadius: 10
};

const savings = {
  marginTop: 10,
  color: "green",
  fontWeight: "bold"
};

const popupStyle = {
  position: "fixed",
  top: 0, left: 0, right: 0, bottom: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 10
};

const popupBox = {
  background: "#fff",
  padding: 20,
  borderRadius: 12,
  width: 300
};

const input = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ccc",
  marginTop: 10,
  marginBottom: 10
};