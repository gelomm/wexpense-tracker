import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useToast } from './hooks/useToast';
import { ToastContainer } from './components/UI/Toast';
import { Sidebar } from './components/Layout/Sidebar';
import { Topbar } from './components/Layout/Topbar';
import { MobileNav } from './components/Layout/MobileNav';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import Recurring from './pages/Recurring';
import Splits from './pages/Splits';
import Reminders from './pages/Reminders';
import Settings from './pages/Settings';
import Auth from './pages/Auth';

const pageTitles = {
  '/': 'Dashboard',
  '/expenses': 'Expenses',
  '/recurring': 'Recurring',
  '/splits': 'Splits & Settlements',
  '/reminders': 'Reminders',
  '/settings': 'Settings',
};

// Lives inside <HashRouter>, so useLocation() reflects the hash route
// (e.g. "#/expenses" → pathname "/expenses"). window.location.pathname
// would always be "/wexpense-tracker/" regardless of route and never
// matched anything in pageTitles.
function AppLayout({ showToast, sidebarOpen, setSidebarOpen }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 flex">
      <Sidebar mobileOpen={sidebarOpen} setMobileOpen={setSidebarOpen} />
      <div className="flex-1 lg:ml-64 flex flex-col pb-20 lg:pb-0">
        <Topbar
          pageTitle={pageTitles[location.pathname] || 'WeXpense'}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 p-6">
          <Routes>
            <Route path="/" element={<Dashboard showToast={showToast} />} />
            <Route path="/expenses" element={<Expenses showToast={showToast} />} />
            <Route path="/recurring" element={<Recurring showToast={showToast} />} />
            <Route path="/splits" element={<Splits showToast={showToast} />} />
            <Route path="/reminders" element={<Reminders showToast={showToast} />} />
            <Route path="/settings" element={<Settings showToast={showToast} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

function App() {
  const { user, loading } = useAuth();
  const { toasts, showToast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-900">
        <div className="w-12 h-12 border-4 border-olive-500/30 border-t-olive-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <HashRouter>
      <AppLayout
        showToast={showToast}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
      <ToastContainer toasts={toasts} />
    </HashRouter>
  );
}

export default App;