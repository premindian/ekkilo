import { useState, useEffect } from "react";

const API_BASE = "https://ekkilo.onrender.com";

export default function OrderPage() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState("smart");
  const [loading, setLoading] = useState(false);

  const [location, setLocation] = useState(null);
  const [radius, setRadius] = useState(5);

  const [phone, setPhone] = useState("");
  const [showPhone, setShowPhone] = useState(true);

  const format = (n) => Number(n || 0).toFixed(2);

  // 📍 LOCATION
  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
      },
      () => console.log("GPS denied")
    );
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

  const stores = result?.stores || [];

  // 🧠 SPLIT LOGIC
  const splitMap = {};

  if (result?.comparison) {
    Object.entries(result.comparison).forEach(([item, options]) => {
      const best = options.find(o => o.is_best);
      if (!best) return;

      if (!splitMap[best.store]) {
        splitMap[best.store] = { store: best.store, items: [], total: 0 };
      }

      splitMap[best.store].items.push({
        name: item,
        price: best.price,
        size: best.size,
        unit: best.unit,
        packs: best.packs
      });

      splitMap[best.store].total += best.price;
    });
  }

  const splitStores = Object.values(splitMap);
  const splitTotal = splitStores.reduce((s, x) => s + x.total, 0);

  // 📦 ORDER
  const placeOrder = async (storesPayload) => {
    if (!phone) return setShowPhone(true);

    const formatted = phone.startsWith("91") ? phone : "91" + phone;

    await fetch(`${API_BASE}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: formatted,
        stores: storesPayload,
      }),
    });

    alert("✅ Order placed!");
  };

  return (
    <div style={container}>

      {/* PHONE */}
      {showPhone && (
        <div style={popup}>
          <div style={popupBox}>
            <h3>Enter WhatsApp Number</h3>
            <input value={phone} onChange={e => setPhone(e.target.value)} style={input}/>
            <button style={btn} onClick={() => setShowPhone(false)}>Continue</button>
          </div>
        </div>
      )}

      <h2>🛒 Smart Kirana</h2>

      {/* GPS */}
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        📍 {location
          ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
          : "Fetching location..."}
      </div>

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
        <button onClick={() => setMode("smart")} style={mode==="smart"?active:tab}>🧠 Smart</button>
        <button onClick={() => setMode("one")} style={mode==="one"?active:tab}>🏪 One Store</button>
      </div>

      {/* SAVINGS */}
      {result?.comparison && (
        <div style={{ color: "green", marginTop: 10 }}>
          💰 Save up to ₹
          {format(Math.max(...Object.values(result.comparison).flat().map(o=>o.savings||0)))}
        </div>
      )}

      {/* 🔥 SMART */}
      {mode==="smart" && splitStores.map((s,i)=>(
        <div key={i} style={card}>
          <b>🏪 {s.store}</b>

          {s.items.map((it,j)=>(
            <div key={j} style={row}>
              <span>
                {it.name} ({it.packs || 1} × {it.size}{it.unit})
              </span>
              <span>₹{format(it.price)}</span>
            </div>
          ))}

          <b>Subtotal: ₹{format(s.total)}</b>
        </div>
      ))}

      {/* 🏪 ONE STORE */}
      {mode==="one" && stores.map((store, idx) => (
        <div key={idx} style={premiumCard}>

          <div style={headerRow}>
            <div>
              <b>🏪 {store.store}</b>
              {store.is_best && <span style={bestBadge}>⭐ Best</span>}
            </div>

            <div>
              ₹{format(store.total)}
              <div style={distance}>📍 {store.distance} km</div>
            </div>
          </div>

          <div style={reasonText}>
            {store.reason?.join(" • ")}
          </div>

          {store.items.map((item,i)=>(
            <div key={i} style={itemBlock}>
              <div>
                <div>{item.name}</div>
                <div style={itemMeta}>
                  {item.packs || 1} × {item.size}{item.unit}
                </div>
              </div>
              <div>₹{format(item.price)}</div>
            </div>
          ))}

          <button style={orderButton} onClick={()=>placeOrder([store])}>
            🛒 Place Order
          </button>
        </div>
      ))}

      {/* 🔥 STICKY */}
      {(mode==="smart" && splitStores.length>0) && (
        <div style={bottom}>
          <div>₹{format(splitTotal)}</div>
          <button style={btn} onClick={()=>placeOrder(splitStores)}>
            Place Order
          </button>
        </div>
      )}

    </div>
  );
}

// 🎨 styles (same as yours, slightly improved)
const container={maxWidth:520,margin:"auto",padding:16,paddingBottom:80};
const searchBox={display:"flex",gap:8,background:"#fff",padding:10,borderRadius:12};
const card={background:"#fff",padding:12,marginTop:10,borderRadius:12};
const row={display:"flex",justifyContent:"space-between"};
const btn={background:"#22c55e",color:"#fff",border:"none",padding:10,borderRadius:10};
const tab={marginRight:10};
const active={marginRight:10,fontWeight:"bold"};

const bottom={
  position:"fixed",
  bottom:0,left:0,right:0,
  background:"#000",
  color:"#fff",
  display:"flex",
  justifyContent:"space-between",
  padding:12
};

const popup={position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",display:"flex",justifyContent:"center",alignItems:"center"};
const popupBox={background:"#fff",padding:20,borderRadius:10,width:300};
const input={width:"100%",padding:10};

const premiumCard={background:"#fff",padding:16,borderRadius:16,marginTop:14,boxShadow:"0 4px 14px rgba(0,0,0,0.08)"};
const headerRow={display:"flex",justifyContent:"space-between"};
const bestBadge={marginLeft:8,background:"#22c55e",color:"#fff",padding:"2px 6px",borderRadius:6,fontSize:10};
const distance={fontSize:12,color:"#666"};
const reasonText={fontSize:12,color:"#666",marginTop:6};
const itemBlock={display:"flex",justifyContent:"space-between",marginTop:10};
const itemMeta={fontSize:12,color:"#888"};
const orderButton={marginTop:12,width:"100%",padding:12,background:"#22c55e",color:"#fff",border:"none",borderRadius:12};