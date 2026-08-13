import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { pathToPage } from './utils/navigate';
import LoginPage from './pages/LoginPage';
import OrderPage from './pages/OrderPage';
import GroceryListsPage from './pages/GroceryListsPage';
import OrderHistoryPage from './pages/OrderHistoryPage';
import TrackOrder from './pages/TrackOrder';
import ProfilePage from './pages/ProfilePage';
import Onboarding from './components/Onboarding';
import BrandLogo from './components/BrandLogo';
import StoreDashboard from './pages/StoreDashboard';
import StoreProducts from './pages/StoreProducts';
import StoreOrders from './pages/StoreOrders';
import StoreReports from './pages/StoreReports';
import StoreSettings from './pages/StoreSettings';
import AdminDashboard from './pages/AdminDashboard';
import AdminStores from './pages/AdminStores';
import AdminUsers from './pages/AdminUsers';
import AdminOrders from './pages/AdminOrders';
import AdminWhatsApp from './pages/AdminWhatsApp';
import AdminProducts from './pages/AdminProducts';

const API_BASE = "";

function App() {
  const { isAuthenticated, loading, user, token } = useAuth();
  // Initialize currentPage from URL pathname
  const [currentPage, setCurrentPage] = useState(() => pathToPage(window.location.pathname));
  const [searchText, setSearchText] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  // SPA navigation (no full reloads)
  useEffect(() => {
    const applyPath = (to) => {
      const page = pathToPage(to || window.location.pathname);
      setCurrentPage(page);
    };
    const onNav = (e) => applyPath(e.detail?.to);
    const onPop = () => applyPath(window.location.pathname + window.location.search);
    window.addEventListener('app:navigate', onNav);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('app:navigate', onNav);
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  useEffect(() => {
    // Wait for auth to finish loading first
    if (loading) return;
    
    if (isAuthenticated && token) {
      checkOnboardingStatus();
    } else {
      // Not authenticated, no need to check onboarding
      setCheckingOnboarding(false);
    }
  }, [isAuthenticated, token, loading, user?.is_admin, user?.is_store_owner]);

  const checkOnboardingStatus = async () => {
    try {
      // Staff portals skip customer onboarding
      if (user?.is_admin || user?.is_store_owner) {
        setShowOnboarding(false);
        return;
      }
      const res = await fetch(`${API_BASE}/api/preferences?token=${token}`);
      if (!res.ok) {
        setShowOnboarding(false);
        return;
      }
      const prefs = await res.json();
      if (prefs && prefs.onboarding_completed === false) {
        setShowOnboarding(true);
      } else {
        setShowOnboarding(false);
      }
    } catch (err) {
      console.error('Failed to check onboarding:', err);
      setShowOnboarding(false);
    } finally {
      setCheckingOnboarding(false);
    }
  };

  const completeOnboarding = async () => {
    try {
      await fetch(`${API_BASE}/api/preferences?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding_completed: true })
      });
      setShowOnboarding(false);
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      setShowOnboarding(false);
    }
  };

  if (loading || checkingOnboarding) {
    return (
      <div style={styles.loadingContainer}>
        <p>Loading...</p>
      </div>
    );
  }

  // Public track order page (no auth needed)
  if (currentPage === '/track') {
    return <TrackOrder />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Check if this is an admin portal route
  if (currentPage.startsWith('/admin')) {
    if (!user?.is_admin) {
      return <LoginPage />;
    }
    if (currentPage === '/admin/stores') {
      return <AdminStores />;
    }
    if (currentPage === '/admin/users') {
      return <AdminUsers />;
    }
    if (currentPage === '/admin/orders') {
      return <AdminOrders />;
    }
    if (currentPage === '/admin/whatsapp') {
      return <AdminWhatsApp />;
    }
    if (currentPage === '/admin/products') {
      return <AdminProducts />;
    }
    return <AdminDashboard />;
  }

  // Check if this is a store portal route
  if (currentPage.startsWith('/store')) {
    if (!user?.is_store_owner) {
      return <LoginPage />;
    }
    if (currentPage.startsWith('/store/products')) {
      return <StoreProducts />;
    }
    if (currentPage.startsWith('/store/orders')) {
      return <StoreOrders />;
    }
    if (currentPage.startsWith('/store/reports')) {
      return <StoreReports />;
    }
    if (currentPage.startsWith('/store/settings')) {
      return <StoreSettings />;
    }
    return <StoreDashboard />;
  }

  return (
    <div style={styles.app}>
      {/* Onboarding */}
      {showOnboarding && (
        <Onboarding
          onComplete={completeOnboarding}
          onSkip={completeOnboarding}
          token={token}
        />
      )}
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.logo}>
          <BrandLogo height={40} alt="Ekkilo" />
        </h1>
        <div style={styles.userInfo}>
          <span style={styles.userName}>{user?.name || user?.phone}</span>
        </div>
      </div>

      {/* Navigation */}
      <div style={styles.nav}>
        <button
          onClick={() => setCurrentPage('order')}
          style={currentPage === 'order' ? styles.navBtnActive : styles.navBtn}
        >
          <span style={styles.navLabel}>
            <BrandLogo variant="icon" height={18} alt="" style={{ display: 'inline-block' }} />
            Order
          </span>
        </button>
        <button
          onClick={() => setCurrentPage('lists')}
          style={currentPage === 'lists' ? styles.navBtnActive : styles.navBtn}
        >
          📋 Lists
        </button>
        <button
          onClick={() => setCurrentPage('history')}
          style={currentPage === 'history' ? styles.navBtnActive : styles.navBtn}
        >
          📜 Orders
        </button>
        <button
          onClick={() => setCurrentPage('profile')}
          style={currentPage === 'profile' ? styles.navBtnActive : styles.navBtn}
        >
          👤 Profile
        </button>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {currentPage === 'order' && (
          <OrderPage initialSearchText={searchText} />
        )}
        {currentPage === 'lists' && (
          <GroceryListsPage
            onSelectList={(text) => {
              setSearchText(text);
              setCurrentPage('order');
            }}
          />
        )}
        {currentPage === 'history' && (
          <OrderHistoryPage
            onReorder={(text) => {
              setSearchText(text);
              setCurrentPage('order');
            }}
          />
        )}
        {currentPage === 'profile' && <ProfilePage />}
      </div>
    </div>
  );
}

const styles = {
  app: {
    minHeight: '100vh',
    background: '#f3f4f6'
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh'
  },
  header: {
    background: '#fff',
    padding: '16px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #e5e7eb'
  },
  logo: {
    margin: 0,
    lineHeight: 0
  },
  navLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12
  },
  userName: {
    fontSize: 14,
    color: '#666'
  },
  nav: {
    background: '#fff',
    display: 'flex',
    padding: '0 20px',
    borderBottom: '1px solid #e5e7eb',
    gap: 4
  },
  navBtn: {
    padding: '12px 20px',
    background: 'none',
    border: 'none',
    borderBottom: '3px solid transparent',
    cursor: 'pointer',
    fontSize: 14,
    color: '#666'
  },
  navBtnActive: {
    padding: '12px 20px',
    background: 'none',
    border: 'none',
    borderBottom: '3px solid #667eea',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#667eea'
  },
  content: {
    paddingBottom: 80
  }
};

export default App;
