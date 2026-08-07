import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = window.location.hostname.includes("localhost") ? "http://localhost:8000" : "";

export default function LoginPage() {
  const { login } = useAuth();
  const [step, setStep] = useState('phone'); // 'phone' or 'otp'
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentOtp, setSentOtp] = useState(''); // For development

  const sendOTP = async () => {
    if (!phone) {
      setError('Please enter phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });

      const data = await res.json();

      if (res.ok) {
        // OTP will be sent via WhatsApp in production
        // Only available in response during development
        if (data.otp) {
          setSentOtp(data.otp); // Development mode
          console.log('🔐 DEV OTP:', data.otp);
        }
        setStep('otp');
      } else {
        setError(data.detail || 'Failed to send OTP');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (!otp) {
      setError('Please enter OTP');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp })
      });

      const data = await res.json();

      if (res.ok) {
        login(data.token, data.user);
        // Redirect handled by parent
      } else {
        setError(data.detail || 'Invalid OTP');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.box}>
        <h1 style={styles.title}>🛒 Ekkilo</h1>
        <p style={styles.subtitle}>Your Smart Kirana Platform</p>

        {step === 'phone' && (
          <>
            <input
              type="tel"
              placeholder="Enter mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={styles.input}
              disabled={loading}
            />

            {error && <p style={styles.error}>{error}</p>}

            <button
              onClick={sendOTP}
              disabled={loading}
              style={styles.button}
            >
              {loading ? 'Sending...' : 'Send OTP'}
            </button>

            <p style={styles.hint}>
              We'll send you a 6-digit code via WhatsApp
            </p>
          </>
        )}

        {step === 'otp' && (
          <>
            <p style={styles.info}>
              OTP sent to {phone}
              <button
                onClick={() => setStep('phone')}
                style={styles.changeLink}
              >
                Change
              </button>
            </p>

            {/* Development only - remove in production */}
            {sentOtp && (
              <p style={styles.devOtp}>
                Dev OTP: <strong>{sentOtp}</strong>
              </p>
            )}

            <input
              type="text"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
              style={styles.input}
              disabled={loading}
            />

            {error && <p style={styles.error}>{error}</p>}

            <button
              onClick={verifyOTP}
              disabled={loading}
              style={styles.button}
            >
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>

            <button
              onClick={() => { setStep('phone'); setOtp(''); setSentOtp(''); }}
              style={styles.backButton}
              disabled={loading}
            >
              ← Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: 20
  },
  box: {
    background: '#fff',
    borderRadius: 16,
    padding: 40,
    maxWidth: 400,
    width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    color: '#333'
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32
  },
  input: {
    width: '100%',
    padding: 14,
    fontSize: 16,
    border: '2px solid #e0e0e0',
    borderRadius: 8,
    marginBottom: 16,
    boxSizing: 'border-box'
  },
  button: {
    width: '100%',
    padding: 14,
    fontSize: 16,
    fontWeight: 'bold',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    marginBottom: 12
  },
  backButton: {
    width: '100%',
    padding: 14,
    fontSize: 16,
    background: '#f3f4f6',
    color: '#666',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer'
  },
  error: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center'
  },
  info: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center'
  },
  hint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 8
  },
  changeLink: {
    marginLeft: 8,
    color: '#667eea',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontSize: 14
  },
  devOtp: {
    background: '#fef3c7',
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
    border: '1px solid #fbbf24'
  }
};
