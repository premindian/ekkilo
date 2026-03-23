import { Routes, Route } from "react-router-dom";

import OrderPage from "./pages/OrderPage";
import WhatsAppDashboard from "./pages/WhatsAppDashboard";

function App() {
  return (
    <Routes>
      <Route path="/" element={<OrderPage />} />
      <Route path="/admin/messages" element={<WhatsAppDashboard />} />
    </Routes>
  );
}

export default App;