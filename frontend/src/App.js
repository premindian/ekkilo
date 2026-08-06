import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import OrderPage from './pages/OrderPage';
import GroceryListsPage from './pages/GroceryListsPage';
import ProfilePage from './pages/ProfilePage';

function App() {
  const { isAuthenticated, loading, user } = useAuth();
  const [currentPage, setCurrentPage] = useState('order'); // order, lists, profile
  const [searchText, setSearchText] = useState('');

  if (loading) {
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
          📋 My Lists
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
