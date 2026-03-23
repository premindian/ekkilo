import React, { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, Tooltip
} from "recharts";

const API_BASE = "https://ekkilo.onrender.com";
const WS_BASE = "wss://ekkilo.onrender.com";

export default function WhatsAppDashboard() {
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [analytics, setAnalytics] = useState({});
  const [stores, setStores] = useState([]);

  // -----------------------------
  // 📡 FETCH ALL DATA
  // -----------------------------
  const fetchAll = async () => {
    try {
      const [m, a, s] = await Promise.all([
        fetch(`${API_BASE}/admin/messages`).then(r => r.json()),
        fetch(`${API_BASE}/admin/message-analytics`).then(r => r.json()),
        fetch(`${API_BASE}/admin/store-performance`).then(r => r.json())
      ]);

      setMessages(m);
      setAnalytics(a);
      setStores(s);
    } catch (e) {
      console.error(e);
    }
  };

  // -----------------------------
  // 🚀 WEBSOCKET LIVE UPDATES
  // -----------------------------
  useEffect(() => {
    fetchAll();

    const ws = new WebSocket(`${WS_BASE}/ws/admin`);

    ws.onopen = () => console.log("✅ WS Connected");

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "message_update") {
        setMessages(prev =>
          prev.map(m =>
            m.whatsapp_message_id === data.wa_id
              ? { ...m, status: data.status }
              : m
          )
        );
      }
    };

    const interval = setInterval(fetchAll, 10000);

    return () => {
      ws.close();
      clearInterval(interval);
    };
  }, []);

  // -----------------------------
  // 🔁 RETRY
  // -----------------------------
  const retryMessage = async (id) => {
    await fetch(`${API_BASE}/admin/retry-message/${id}`, {
      method: "POST"
    });
  };

  // -----------------------------
  // 🔍 FILTER
  // -----------------------------
  const filtered = messages.filter(m =>
    filter === "ALL" ? true : m.status === filter
  );

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

  // -----------------------------
  // ICONS
  // -----------------------------
  const getIcon = (s) => {
    if (s === "READ") return "✔✔👀";
    if (s === "DELIVERED") return "✔✔";
    if (s === "SENT") return "✔";
    if (s === "FAILED") return "❌";
    return "⏳";
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">

      <h1 className="text-2xl font-bold mb-6">
        📊 WhatsApp Ops Dashboard
      </h1>

      {/* 🔥 KPI CARDS */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card title="Delivery %" value={`${analytics.delivery_rate || 0}%`} />
        <Card title="Read %" value={`${analytics.read_rate || 0}%`} />
        <Card title="Failure %" value={`${analytics.failure_rate || 0}%`} />
        <Card title="Total" value={analytics.total || 0} />
      </div>

      {/* 📊 CHARTS */}
      <div className="grid grid-cols-2 gap-6 mb-6">

        <div className="bg-white p-4 rounded-xl shadow">
          <h2 className="font-semibold mb-3">Status Distribution</h2>
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
          <h2 className="font-semibold mb-3">Retry Activity</h2>
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
        <h2 className="font-semibold mb-3">🏪 Store Performance</h2>

        {stores.map((s, i) => (
          <div key={i} className="flex justify-between border-b py-2">
            <span>{s.store_name}</span>
            <span>{s.total_orders} orders</span>
          </div>
        ))}
      </div>

      {/* FILTERS */}
      <div className="flex gap-3 mb-4">
        {["ALL", "SENT", "DELIVERED", "READ", "FAILED"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full 
              ${filter === f ? "bg-black text-white" : "bg-white border"}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* TABLE */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3">Phone</th>
              <th className="p-3">Message</th>
              <th className="p-3">Status</th>
              <th className="p-3">Retry</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map(m => (
              <tr key={m.id} className="border-t">
                <td className="p-3">{m.phone}</td>

                <td className="p-3 max-w-xs truncate">
                  {m.message}
                </td>

                <td className="p-3 font-semibold">
                  {getIcon(m.status)} {m.status}
                </td>

                <td className="p-3">
                  {m.status === "FAILED" && (
                    <button
                      onClick={() => retryMessage(m.id)}
                      className="bg-red-500 text-white px-3 py-1 rounded"
                    >
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

// -----------------------------
// CARD COMPONENT
// -----------------------------
function Card({ title, value }) {
  return (
    <div className="bg-white p-4 rounded-xl shadow">
      <div className="text-gray-500 text-sm">{title}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}