import { Navigate, Route, Routes } from "react-router";
import { RequireAuth, RequireManager, useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import MembersPage from "./pages/MembersPage";
import MemberDetailPage from "./pages/MemberDetailPage";
import BookingsPage from "./pages/BookingsPage";
import AlertsPage from "./pages/AlertsPage";
import ShopPage from "./pages/ShopPage";
import OrdersPage from "./pages/OrdersPage";
import InventoryPage from "./pages/InventoryPage";
import BarPage from "./pages/BarPage";
import QueuePage from "./pages/QueuePage";
import BarReportPage from "./pages/BarReportPage";
import EnquiriesPage from "./pages/EnquiriesPage";
import EnquiryDetailPage from "./pages/EnquiryDetailPage";
import CollectionsPage from "./pages/CollectionsPage";
import LeavePage from "./pages/LeavePage";
import InvoicesPage from "./pages/InvoicesPage";
import ExpensesPage from "./pages/ExpensesPage";
import PayrollPage from "./pages/PayrollPage";
import ReportsPage from "./pages/ReportsPage";
import PublicSite from "./pages/PublicSite";

function Home() {
  const { isManager } = useAuth();
  return isManager ? <DashboardPage /> : <Navigate to="/app/bookings" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicSite />} />
      <Route path="/login" element={<LoginPage />} />

      <Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="dashboard" element={<RequireManager><DashboardPage /></RequireManager>} />
        <Route path="members" element={<MembersPage />} />
        <Route path="members/:id" element={<MemberDetailPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="shop" element={<ShopPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="bar" element={<BarPage />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="bar-report" element={<RequireManager><BarReportPage /></RequireManager>} />
        <Route path="enquiries" element={<EnquiriesPage />} />
        <Route path="enquiries/:id" element={<EnquiryDetailPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="invoices" element={<RequireManager><InvoicesPage /></RequireManager>} />
        <Route path="expenses" element={<RequireManager><ExpensesPage /></RequireManager>} />
        <Route path="payroll" element={<RequireManager><PayrollPage /></RequireManager>} />
        <Route path="reports" element={<RequireManager><ReportsPage /></RequireManager>} />
        <Route path="alerts" element={<AlertsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
