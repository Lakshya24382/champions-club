import { Routes, Route, Navigate } from 'react-router';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Members from './pages/Members.jsx';
import MemberDetail from './pages/MemberDetail.jsx';
import Bookings from './pages/Bookings.jsx';
import Inventory from './pages/Inventory.jsx';
import Pos from './pages/Pos.jsx';
import Orders from './pages/Orders.jsx';
import Storefront from './pages/Storefront.jsx';
import Bar from './pages/Bar.jsx';
import Kitchen from './pages/Kitchen.jsx';
import BarReports from './pages/BarReports.jsx';

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-6">Loading…</p>;
  return user ? <Layout /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/shop" element={<Storefront />} />

      {/* Staff only */}
      <Route element={<Protected />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/members" element={<Members />} />
        <Route path="/members/:id" element={<MemberDetail />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/pos" element={<Pos />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/bar" element={<Bar />} />
        <Route path="/kitchen" element={<Kitchen />} />
        <Route path="/bar-reports" element={<BarReports />} />
      </Route>
    </Routes>
  );
}
