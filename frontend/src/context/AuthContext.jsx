import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const API_BASE = "";

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

function safeParseUser(raw) {
  try {
    const user = JSON.parse(raw);
    if (!user || typeof user !== 'object') return null;
    return user;
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('ekkilo_token');
    localStorage.removeItem('ekkilo_user');
  };

  // Load + validate token from localStorage on mount
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const savedToken = localStorage.getItem('ekkilo_token');
      const savedUser = localStorage.getItem('ekkilo_user');

      if (!savedToken || !savedUser) {
        if (!cancelled) setLoading(false);
        return;
      }

      const parsed = safeParseUser(savedUser);
      if (!parsed) {
        clearSession();
        if (!cancelled) setLoading(false);
        return;
      }

      // Optimistic restore so UI can paint, then validate
      if (!cancelled) {
        setToken(savedToken);
        setUser(parsed);
      }

      try {
        const res = await fetch(`${API_BASE}/api/auth/me?token=${encodeURIComponent(savedToken)}`);
        if (!res.ok) {
          clearSession();
        } else {
          const me = await res.json();
          if (!cancelled && me && !me.detail) {
            setUser(me);
            localStorage.setItem('ekkilo_user', JSON.stringify(me));
          }
        }
      } catch (err) {
        // Offline / transient error: keep optimistic session
        console.warn('Auth validate failed, keeping local session', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    restore();
    return () => { cancelled = true; };
  }, []);

  const login = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('ekkilo_token', newToken);
    localStorage.setItem('ekkilo_user', JSON.stringify(newUser));
  };

  const logout = () => {
    clearSession();
    // Return to home login instead of staying on /admin or /store blank routes
    if (window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: { to: '/' } }));
    }
  };

  const updateUser = (updates) => {
    setUser((prev) => {
      const updated = { ...(prev || {}), ...updates };
      localStorage.setItem('ekkilo_user', JSON.stringify(updated));
      return updated;
    });
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token,
    login,
    logout,
    updateUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
