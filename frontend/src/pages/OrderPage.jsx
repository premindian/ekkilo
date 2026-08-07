import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const API_BASE = "https://ekkilo.onrender.com";

export default function OrderPage({ initialSearchText }) {
  const { user, token } = useAuth();
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState("smart");
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState(null);
  const [radius, setRadius] = useState(5);
  const [manualCart, setManualCart] = useState({});
  const [favorites, setFavorites] = useState([]);
  const [regularStore, setRegularStore] = useState(null);
  
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

  // 📍 LOCATION
  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => console.log("GPS denied")
    );
  }, []);

  // ⭐ LOAD FAVORITES & PREFERENCES
  useEffect(() => {
    if (!token) return;
    
    const loadFavorites = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/favorites/stores?token=${token}`);
        const data = await res.json();
        setFavorites(data);
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
    console.log('📊 Search Result:', data);
    console.log('📦 Stores:', data.stores);
    setResult(data);
    setLoading(false);
  };

  const stores = result?.stores || [];
  console.log('🏪 Rendering stores:', stores.length, stores);

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

  // 🧩 MANUAL MODE
  const toggleManual = (store, item) => {
    const key = `${store}-${item.name}`;

    setManualCart((prev) => {
      const copy = { ...prev };

      if (copy[key]) delete copy[key];
      else copy[key] = { ...item, store };

      return copy;
    });
  };

  const manualItems = Object.values(manualCart);
  const manualTotal = manualItems.reduce((s, i) => s + (i.price || 0), 0);

  // 📦 ORDER
  const placeOrder = async (storesPayload) => {
    if (!user?.phone) {
      alert("Please login to place order");
      return;
    }

    // Build confirmation message
    const orderSummary = storesPayload.map(store => {
      const itemsList = store.items.map(item => 
        `  • ${item.name} (${item.packs || 1} × ${item.size}${item.unit})`
      ).join('\n');
      return `📍 ${store.store}\n${itemsList}\n💰 Subtotal: ₹${store.total.toFixed(2)}`;
    }).join('\n\n');

    const grandTotal = storesPayload.reduce((sum, store) => sum + store.total, 0);
    
    const confirmMessage = `🛒 Confirm Your Order?\n\n${orderSummary}\n\n💳 Grand Total: ₹${grandTotal.toFixed(2)}\n\n${storesPayload.length} store(s) will be notified.`;

    if (!window.confirm(confirmMessage)) {
      return; // User cancelled
    }

    const formatted = user.phone.startsWith("91") ? user.phone : "91" + user.phone;

    await fetch(`${API_BASE}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: formatted,
        stores: storesPayload,
      }),
    });

    alert("✅ Order placed! You'll receive a WhatsApp confirmation.");
  };

  return (
    <div style={container}>

      <h2>🛒 Smart Kirana</h2>

      {/* GPS */}
      <div style={{ fontSize: 12 }}>
        📍 {location
          ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
          : "Fetching location..."}
      </div>

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

      {/* MODES */}
      <div style={{ marginTop: 10, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <button onClick={() => setMode("regular")} style={mode==="regular"?active:tab}>
          🏪 Regular
        </button>
        <button onClick={() => setMode("favorites")} style={mode==="favorites"?active:tab}>
          ⭐ Favorites
        </button>
        <button onClick={() => setMode("smart")} style={mode==="smart"?active:tab}>
          💰 Smart Buy
        </button>
        <button onClick={() => setMode("manual")} style={mode==="manual"?active:tab}>
          ✋ Manual
        </button>
      </div>

      {/* REGULAR STORE INFO */}
      {mode === "regular" && regularStore && (
        <div style={{ marginTop: 10, padding: 10, background: '#f0f8ff', borderRadius: 8, fontSize: 14 }}>
          🏪 Ordering from: <strong>{regularStore}</strong>
          <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>
            (Change in Profile → Settings)
          </span>
        </div>
      )}

      {/* SAVINGS */}
      {result?.comparison && Object.keys(result.comparison).length > 0 && (() => {
        const maxSavings = Math.max(...Object.values(result.comparison).flat().map(o=>o.savings||0), 0);
        return maxSavings > 0 ? (
          <div style={{ color: "green", marginTop: 10 }}>
            💰 Save up to ₹{format(maxSavings)}
          </div>
        ) : null;
      })()}

      {/* LOADING */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
          🔍 Searching for best prices...
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
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>💰 Smart Buy Mode</div>
              <div style={{ fontSize: 14, color: '#666' }}>
                Showing optimal split across stores for best price + convenience
              </div>
            </>
          )}
          {mode === "favorites" && (
            <>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>⭐ Favorites Mode</div>
              <div style={{ fontSize: 14, color: '#666' }}>
                Showing only your favorite stores
              </div>
            </>
          )}
          {mode === "regular" && (
            <>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>🏪 Regular Store Mode</div>
              <div style={{ fontSize: 14, color: '#666' }}>
                Showing your trusted regular store: <strong>{regularStore || "Not set"}</strong>
              </div>
            </>
          )}
          {mode === "manual" && (
            <>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>✋ Manual Mode</div>
              <div style={{ fontSize: 14, color: '#666' }}>
                Pick items yourself from any store
              </div>
            </>
          )}
        </div>
      )}

      {/* 💡 SAVINGS HINT */}
      {!loading && result && stores.length > 0 && mode !== "smart" && splitTotal > 0 && (() => {
        let currentTotal = 0;
        
        // Calculate current mode's total
        if (mode === "regular") {
          const myRegularStore = stores.find(s => s.store === regularStore);
          currentTotal = myRegularStore?.total || 0;
        } else if (mode === "favorites") {
          const favoriteStoreNames = favorites.map(f => f.store_name);
          const filteredStores = stores.filter(s => favoriteStoreNames.includes(s.store));
          const bestFavorite = filteredStores.sort((a, b) => a.total - b.total)[0];
          currentTotal = bestFavorite?.total || 0;
        } else if (mode === "manual") {
          currentTotal = manualTotal;
        }
        
        const savings = currentTotal - splitTotal;
        
        if (savings > 5) { // Only show if savings is significant (>₹5)
          return (
            <div 
              onClick={() => setMode("smart")}
              style={{ 
                marginTop: 10,
                padding: 12, 
                background: '#fff8e1', 
                borderRadius: 8, 
                borderLeft: '4px solid #FFC107',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#fff3cd'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#fff8e1'}
            >
              <div style={{ fontWeight: 'bold', color: '#f57c00', marginBottom: 4 }}>
                💡 Savings Tip
              </div>
              <div style={{ fontSize: 14, color: '#666' }}>
                Switch to <strong>Smart Buy</strong> mode to save ₹{format(savings)}
                <span style={{ marginLeft: 8, fontSize: 12, color: '#999' }}>
                  👆 Click here to switch
                </span>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* 🧠 SMART */}
      {!loading && mode==="smart" && splitStores.map((s,i)=>(
        <div key={i} style={card}>
          <b>🏪 {s.store}</b>

          {s.items.map((it,j)=>(
            <div key={j} style={row}>
              <span>{it.name} ({it.packs||1} × {it.size}{it.unit})</span>
              <span>₹{format(it.price)}</span>
            </div>
          ))}

          <b>Subtotal: ₹{format(s.total)}</b>
        </div>
      ))}

      {/* ⭐ FAVORITES MODE */}
      {!loading && mode==="favorites" && (() => {
        const favoriteStoreNames = favorites.map(f => f.store_name);
        const filteredStores = stores.filter(s => favoriteStoreNames.includes(s.store));
        
        if (filteredStores.length === 0 && stores.length > 0) {
          return (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              <p>😕 None of your favorite stores have these items</p>
              <p style={{ fontSize: 14 }}>Try switching to Smart mode or add more favorites</p>
            </div>
          );
        }
        
        return filteredStores.map((store, idx) => (
          <div key={idx} style={premiumCard}>
            <div style={headerRow}>
              <div>
                <b>⭐ {store.store}</b>
                {store.is_best && <span style={bestBadge}>Best Price</span>}
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
                    {item.packs||1} × {item.size}{item.unit}
                  </div>
                </div>
                <div>₹{format(item.price)}</div>
              </div>
            ))}

            <button style={orderButton} onClick={()=>placeOrder([store])}>
              🛒 Place Order
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
              <p style={{ fontSize: 14 }}>Add a favorite store first in your Profile</p>
            </div>
          );
        }
        
        const myRegularStore = stores.find(s => s.store === regularStore);
        
        if (!myRegularStore && stores.length > 0) {
          return (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              <p>😕 {regularStore} doesn't have these items</p>
              <p style={{ fontSize: 14 }}>Try switching to Smart mode</p>
            </div>
          );
        }
        
        if (!myRegularStore) return null;
        
        return (
          <div style={premiumCard}>
            <div style={headerRow}>
              <div>
                <b>🏪 {myRegularStore.store}</b>
                <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>Your Regular Store</span>
              </div>
              <div>
                ₹{format(myRegularStore.total)}
                <div style={distance}>📍 {myRegularStore.distance} km</div>
              </div>
            </div>

            <div style={reasonText}>
              {myRegularStore.reason?.join(" • ")}
            </div>

            {myRegularStore.items.map((item,i)=>(
              <div key={i} style={itemBlock}>
                <div>
                  <div>{item.name}</div>
                  <div style={itemMeta}>
                    {item.packs||1} × {item.size}{item.unit}
                  </div>
                </div>
                <div>₹{format(item.price)}</div>
              </div>
            ))}

            <button style={orderButton} onClick={()=>placeOrder([myRegularStore])}>
              🛒 Place Order
            </button>
          </div>
        );
      })()}

      {/* 🧩 MANUAL */}
      {!loading && mode==="manual" && Object.entries(result?.store_view || {}).map(([store, items])=>(
        <div key={store} style={premiumCard}>
          <b>🏪 {store}</b>

          {Object.values(items).map((it,i)=>{
            const key=`${store}-${it.name}`;
            const selected=manualCart[key];

            return (
              <div key={i} style={itemBlock}>
                <div>
                  <div>{it.name}</div>
                  <div style={itemMeta}>
                    {it.brand} • {it.variant} • {it.size}{it.unit}
                  </div>
                </div>

                <div style={{display:"flex",gap:8}}>
                  <span>₹{format(it.price)}</span>
                  <button
                    onClick={()=>toggleManual(store,it)}
                    style={{
                      background:selected?"#ef4444":"#22c55e",
                      color:"#fff",
                      border:"none",
                      borderRadius:6,
                      padding:"4px 8px"
                    }}
                  >
                    {selected?"Remove":"Add"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* 🔥 STICKY BAR */}
      {((mode==="smart" && splitStores.length > 0) || (mode==="manual" && manualItems.length > 0)) && (
        <div style={bottom}>
          <div>
            ₹{format(mode==="smart"?splitTotal:manualTotal)}
          </div>

          <button
            style={btn}
            onClick={()=>{
              if(mode==="smart"){
                placeOrder(splitStores);
              } else {
                const grouped = manualItems.reduce((acc,item)=>{
                  let s=acc.find(x=>x.store===item.store);
                  if(!s){
                    // Find store_phone from result.stores
                    const storeData = stores.find(st => st.store === item.store);
                    s={store:item.store, store_phone: storeData?.store_phone, items:[]};
                    acc.push(s);
                  }
                  s.items.push(item);
                  return acc;
                },[]);
                placeOrder(grouped);
              }
            }}
          >
            🚀 Place Order
          </button>
        </div>
      )}

    </div>
  );
}

// 🎨 styles
const container={maxWidth:520,margin:"auto",padding:16,paddingBottom:90};
const searchBox={display:"flex",gap:8,background:"#fff",padding:10,borderRadius:12,marginTop:10};
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