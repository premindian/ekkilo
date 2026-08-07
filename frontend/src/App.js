import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import OrderPage from './pages/OrderPage';
import GroceryListsPage from './pages/GroceryListsPage';
import OrderHistoryPage from './pages/OrderHistoryPage';
import ProfilePage from './pages/ProfilePage';
import Onboarding from './components/Onboarding';

const API_BASE = window.location.hostname.includes("localhost") ? "http://localhost:8000" : "";

function App() {
  const { isAuthenticated, loading, user, token } = useAuth();
  const [currentPage, setCurrentPage] = useState('order'); // order, lists, history, profile
  const [searchText, setSearchText] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  useEffect(() => {
    // Wait for auth to finish loading first
    if (loading) return;
    
    if (isAuthenticated && token) {
      checkOnboardingStatus();
    } else {
      // Not authenticated, no need to check onboarding
      setCheckingOnboarding(false);
    }
  }, [isAuthenticated, token, loading]);

  const checkOnboardingStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/preferences?token=${token}`);
      const prefs = await res.json();
      
      if (!prefs.onboarding_completed) {
        setShowOnboarding(true);
      }
    } catch (err) {
      console.error('Failed to check onboarding:', err);
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

  if (!isAuthenticated) {
    return <LoginPage />;
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
        <h1 style={styles.logo}>🛒 Ekkilo</h1>
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
          🛒 Order
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
    fontSize: 24,
    fontWeight: 'bold',
    margin: 0
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
