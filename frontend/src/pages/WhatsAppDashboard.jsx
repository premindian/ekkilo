import React, { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, Tooltip
} from "recharts";

const API_BASE = "https://ekkilo.onrender.com";
const WS_BASE = "wss://ekkilo.onrender.com";

export default function AdminDashboard() {
  const [messages, setMessages] = useState([]);
  const [orders, setOrders] = useState([]);
  const [analytics, setAnalytics] = useState({});
  const [stores, setStores] = useState([]);
  const [stats, setStats] = useState({});
  const [filter, setFilter] = useState("ALL");

  // -----------------------------
  // 🚀 FETCH ALL DATA
  // -----------------------------
  const fetchAll = async () => {
    try {
      const [m, a, s, o, st] = await Promise.all([
        fetch(`${API_BASE}/admin/messages`).then(r => r.json()),
        fetch(`${API_BASE}/admin/message-analytics`).then(r => r.json()),
        fetch(`${API_BASE}/admin/store-performance`).then(r => r.json()),
        fetch(`${API_BASE}/admin/store-orders`).then(r => r.json()),
        fetch(`${API_BASE}/admin/stats`).then(r => r.json())
      ]);

      setMessages(m);
      setAnalytics(a);
      setStores(s);
      setOrders(o);
      setStats(st);
    } catch (e) {
      console.error(e);
    }
  };

  // -----------------------------
  // ⚡ WEBSOCKET
  // -----------------------------
  useEffect(() => {
    fetchAll();

    const ws = new WebSocket(`${WS_BASE}/ws/admin`);

    ws.onmessage = () => fetchAll();

    const interval = setInterval(fetchAll, 10000);

    return () => {
      ws.close();
      clearInterval(interval);
    };
  }, []);

  // -----------------------------
  // 🔁 RETRY MESSAGE
  // -----------------------------
  const retryMessage = async (id) => {
    await fetch(`${API_BASE}/admin/retry-message/${id}`, {
      method: "POST"
    });
    fetchAll();
  };

  // -----------------------------
  // 🔄 UPDATE ORDER STATUS
  // -----------------------------
  const updateOrder = async (id, status) => {
    await fetch(`${API_BASE}/admin/store-orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    fetchAll();
  };

  // -----------------------------
  // 📊 CHART DATA
  // -----------------------------
  const pieData = [
    { name: "Sent", value: analytics.sent || 0 },
    { name: "Delivered", value: analytics.delivered || 0 },
    { name: "Read", value: analytics.read || 0 },
    { name: "Failed", value: analytics.failed || 0 }
  ];

  const COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#ef4444"];

  const filteredMessages = messages.filter(m =>
    filter === "ALL" ? true : m.status === filter
  );

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="p-6 bg-gray-50 min-h-screen">

      <h1 className="text-2xl font-bold mb-6">
        🚀 Ekkilo Admin Control Tower
      </h1>

      {/* 🔥 ORDER STATS */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card title="Total Orders" value={stats.total || 0} />
        <Card title="Sent" value={stats.sent || 0} />
        <Card title="Accepted" value={stats.accepted || 0} />
        <Card title="Ready" value={stats.ready || 0} />
      </div>

      {/* 📊 MESSAGE ANALYTICS */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card title="Delivery %" value={`${analytics.delivery_rate || 0}%`} />
        <Card title="Read %" value={`${analytics.read_rate || 0}%`} />
        <Card title="Failure %" value={`${analytics.failure_rate || 0}%`} />
        <Card title="Total Msg" value={analytics.total || 0} />
      </div>

      {/* 📊 CHARTS */}
      <div className="grid grid-cols-2 gap-6 mb-6">

        <div className="bg-white p-4 rounded-xl shadow">
          <h2>Status Distribution</h2>
          <PieChart width={300} height={250}>
            <Pie data={pieData} dataKey="value" outerRadius={100}>
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </div>

        <div className="bg-white p-4 rounded-xl shadow">
          <h2>Retry Activity</h2>
          <LineChart width={400} height={250} data={messages.slice(0, 10)}>
            <XAxis dataKey="id" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="attempts" stroke="#3b82f6" />
          </LineChart>
        </div>

      </div>

      {/* 🏪 STORE PERFORMANCE */}
      <div className="bg-white p-4 rounded-xl shadow mb-6">
        <h2>🏪 Store Performance</h2>
        {stores.map((s, i) => (
          <div key={i} className="flex justify-between border-b py-2">
            <span>{s.store_name}</span>
            <span>{s.total_orders} orders</span>
          </div>
        ))}
      </div>

      {/* 📦 ORDER CONTROL TABLE */}
      <div className="bg-white p-4 rounded-xl shadow mb-6">
        <h2>📦 Store Orders</h2>

        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {orders.map(o => (
              <tr key={o.id} className="border-t">
                <td>#{o.final_order_id} ({o.store})</td>
                <td>{o.customer}</td>
                <td>{o.status}</td>
                <td>
                  <button onClick={() => updateOrder(o.id, "ACCEPTED")}>Accept</button>
                  <button onClick={() => updateOrder(o.id, "READY")}>Ready</button>
                  <button onClick={() => updateOrder(o.id, "COMPLETED")}>Complete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 💬 MESSAGE TABLE */}
      <div className="bg-white p-4 rounded-xl shadow">
        <h2>📩 Messages</h2>

        <div className="flex gap-3 mb-4">
          {["ALL", "SENT", "DELIVERED", "READ", "FAILED"].map(f => (
            <button key={f} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Phone</th>
              <th>Message</th>
              <th>Status</th>
              <th>Retry</th>
            </tr>
          </thead>

          <tbody>
            {filteredMessages.map(m => (
              <tr key={m.id}>
                <td>{m.phone}</td>
                <td>{m.message}</td>
                <td>{m.status}</td>
                <td>
                  {m.status === "FAILED" && (
                    <button onClick={() => retryMessage(m.id)}>
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

function Card({ title, value }) {
  return (
    <div className="bg-white p-4 rounded-xl shadow">
      <div className="text-gray-500 text-sm">{title}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}