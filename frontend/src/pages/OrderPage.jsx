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
  const [gpsError, setGpsError] = useState(false);
  const [showCitySelector, setShowCitySelector] = useState(false);
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedStoreDetails, setSelectedStoreDetails] = useState(null);
  
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

      {/* CITY SELECTOR */}
      {showCitySelector && (
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
      {!loading && mode==="smart" && splitStores.map((s,i)=>{
        // More robust store lookup (case-insensitive, trimmed)
        const storeData = stores.find(st => 
          st.store?.toLowerCase().trim() === s.store?.toLowerCase().trim()
        );
        
        return (
          <div key={i} style={card}>
            <div 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: 8,
                cursor: 'pointer',
                padding: '4px 0'
              }}
              onClick={() => storeData && setSelectedStoreDetails(storeData)}
            >
              <b style={{ fontSize: 16 }}>🏪 {s.store}</b>
              {storeData?.distance !== undefined ? (
                <span style={{ fontSize: 13, color: '#666', fontWeight: 600 }}>
                  📍 {storeData.distance} km
                </span>
              ) : (
                <span style={{ fontSize: 13, color: '#999' }}>
                  ⏳ Distance...
                </span>
              )}
            </div>

            {s.items.map((it,j)=>(
              <div key={j} style={row}>
                <span>
                  {it.name} ({it.packs||1} × {it.size}{it.unit})
                  {it.available === false && <span style={{ fontSize: 11, color: '#ef4444', marginLeft: 6 }}>⚠️ Limited</span>}
                </span>
                <span>₹{format(it.price)}</span>
              </div>
            ))}

            <b>Subtotal: ₹{format(s.total)}</b>
          </div>
        );
      })}

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f0f0f0' }}>
            <b style={{ fontSize: 16 }}>🏪 {store}</b>
            {(() => {
              const storeData = stores.find(s => s.store === store);
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
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#92400e' }}>
                    🛒 Items Available ({selectedStoreDetails.items.length})
                  </div>
                  {selectedStoreDetails.items.map((item, i) => (
                    <div key={i} style={{ fontSize: 13, color: '#666', padding: '4px 0' }}>
                      • {item.name}
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