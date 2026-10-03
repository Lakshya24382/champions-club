import { Routes, Route, Navigate, Outlet } from 'react-router';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import PublicLayout from './components/PublicLayout.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Book from './pages/Book.jsx';
import QuotePage from './pages/QuotePage.jsx';
import SharedReport from './pages/SharedReport.jsx';
import Storefront from './pages/Storefront.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Members from './pages/Members.jsx';
import MemberDetail from './pages/MemberDetail.jsx';
import Bookings from './pages/Bookings.jsx';
import Leads from './pages/Leads.jsx';
import LeadDetail from './pages/LeadDetail.jsx';
import Inventory from './pages/Inventory.jsx';
import Pos from './pages/Pos.jsx';
import Orders from './pages/Orders.jsx';
import Bar from './pages/Bar.jsx';
import Kitchen from './pages/Kitchen.jsx';
import BarReports from './pages/BarReports.jsx';
import Leave from './pages/Leave.jsx';
import Finance from './pages/Finance.jsx';
import Collections from './pages/Collections.jsx';
import Invoices from './pages/Invoices.jsx';
import InvoiceDetail from './pages/InvoiceDetail.jsx';
import Expenses from './pages/Expenses.jsx';
import Payroll from './pages/Payroll.jsx';

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-6">Loading…</p>;
  return user ? <Layout /> : <Navigate to="/login" replace />;
}

// Owner / admin pages. The API enforces this too; this just keeps staff out of screens that would only show errors.
function ManagerOnly() {
  const { user } = useAuth();
  return ['owner', 'admin'].includes(user.role) ? <Outlet /> : <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Public website */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/book" element={<Book />} />
        <Route path="/quote/:token" element={<QuotePage />} />
        <Route path="/report/:token" element={<SharedReport />} />
      </Route>
      <Route path="/shop" element={<Storefront />} />
      <Route path="/login" element={<Login />} />

      {/* Staff */}
      <Route element={<Protected />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/members" element={<Members />} />
        <Route path="/members/:id" element={<MemberDetail />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/pos" element={<Pos />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/bar" element={<Bar />} />
        <Route path="/kitchen" element={<Kitchen />} />
        <Route path="/leave" element={<Leave />} />

        {/* Owner / admin only */}
        <Route element={<ManagerOnly />}>
          <Route path="/bar-reports" element={<BarReports />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/payroll" element={<Payroll />} />
        </Route>
      </Route>
    </Routes>
  );
}
