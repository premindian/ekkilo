import { useState } from 'react';
import BrandLogo from './BrandLogo';

const API_BASE = "";

export default function Onboarding({ onComplete, onSkip, token }) {
  const [step, setStep] = useState(1);
  const totalSteps = 5; // Updated from 4 to 5
  const [kiranaPhone, setKiranaPhone] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);

  const searchKirana = async () => {
    if (!kiranaPhone || kiranaPhone.length < 10) {
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`${API_BASE}/api/stores/by-phone/${kiranaPhone}`);
      const data = await res.json();
      setSearchResult(data);
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResult({ found: false });
    } finally {
      setSearching(false);
    }
  };

  const addAsRegularStore = async (storeId) => {
    if (!token) return;
    
    try {
      // Add to favorites
      await fetch(`${API_BASE}/api/favorites/stores?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, rank: 1 })
      });

      // Set as regular store
      await fetch(`${API_BASE}/api/preferences?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regular_store_id: storeId })
      });

      // Move to next step
      setStep(step + 1);
      setSearchResult(null);
      setKiranaPhone('');
    } catch (err) {
      console.error('Failed to add store:', err);
    }
  };

  const nextStep = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <div style={styles.stepContent}>
            <div style={styles.emoji}>
              <BrandLogo height={64} alt="Ekkilo" style={{ margin: '0 auto' }} />
            </div>
            <h2 style={styles.stepTitle}>Welcome to Ekkilo</h2>
            <p style={styles.stepDesc}>
              Order from your local kirana — and see how prices stack up against Blinkit, Zepto & Instamart.
            </p>
            <div style={styles.features}>
              <div style={styles.feature}>
                <span style={styles.featureIcon}>🛒</span>
                <span>Shop like a catalog</span>
              </div>
              <div style={styles.feature}>
                <span style={styles.featureIcon}>💰</span>
                <span>Compare vs big stores</span>
              </div>
              <div style={styles.feature}>
                <span style={styles.featureIcon}>📦</span>
                <span>Pickup or store delivery</span>
              </div>
            </div>
          </div>
        );
      
      case 2:
        return (
          <div style={styles.stepContent}>
            <div style={styles.emoji}>🏪</div>
            <h2 style={styles.stepTitle}>Find Your Regular Kirana</h2>
            <p style={styles.stepDesc}>
              Enter your kirana's WhatsApp number to add them as your regular store
            </p>
            
            {!searchResult ? (
              <>
                <input
                  type="tel"
                  placeholder="Enter 10-digit WhatsApp number"
                  value={kiranaPhone}
                  onChange={(e) => setKiranaPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  style={styles.phoneInput}
                  maxLength={10}
                />
                
                <button
                  onClick={searchKirana}
                  disabled={kiranaPhone.length !== 10 || searching}
                  style={{
                    ...styles.searchBtn,
                    opacity: kiranaPhone.length !== 10 ? 0.5 : 1
                  }}
                >
                  {searching ? 'Searching...' : '🔍 Find Store'}
                </button>

                <p style={styles.skipText}>
                  Don't know the number?{' '}
                  <button onClick={nextStep} style={styles.skipLink}>
                    Skip for now
                  </button>
                </p>
              </>
            ) : searchResult.found ? (
              <div style={styles.foundStore}>
                <div style={styles.foundIcon}>✅</div>
                <h3 style={styles.foundTitle}>Found Your Store!</h3>
                <div style={styles.storeInfo}>
                  <div style={styles.storeName}>🏪 {searchResult.store.name}</div>
                  <div style={styles.storePhone}>📞 {searchResult.store.phone}</div>
                </div>
                <button
                  onClick={() => addAsRegularStore(searchResult.store.id)}
                  style={styles.confirmBtn}
                >
                  ⭐ Yes, This is My Regular Store
                </button>
                <button
                  onClick={() => setSearchResult(null)}
                  style={styles.tryAgainBtn}
                >
                  Not Mine - Try Another Number
                </button>
              </div>
            ) : (
              <div style={styles.notFound}>
                <div style={styles.notFoundIcon}>😕</div>
                <h3 style={styles.notFoundTitle}>Store Not Found</h3>
                <p style={styles.notFoundDesc}>
                  This kirana is not on Ekkilo yet. You can still order from other stores!
                </p>
                <button
                  onClick={() => setSearchResult(null)}
                  style={styles.tryAgainBtn}
                >
                  Try Another Number
                </button>
                <button
                  onClick={nextStep}
                  style={styles.skipLink}
                >
                  Continue Without Adding
                </button>
              </div>
            )}
          </div>
        );
      
      case 3:
        return (
          <div style={styles.stepContent}>
            <div style={styles.emoji}>🛒</div>
            <h2 style={styles.stepTitle}>How Ekkilo works</h2>
            <p style={styles.stepDesc}>
              Five quick steps — nothing is ordered until you confirm checkout.
            </p>
            <div style={styles.howto}>
              <div style={styles.step}>
                <div style={styles.stepNum}>1</div>
                <div><strong>Shop</strong> — browse categories or search products</div>
              </div>
              <div style={styles.step}>
                <div style={styles.stepNum}>2</div>
                <div><strong>List</strong> — add to Daily or Monthly (your cart)</div>
              </div>
              <div style={styles.step}>
                <div style={styles.stepNum}>3</div>
                <div><strong>Prices</strong> — kirana total vs Blinkit / Zepto / Instamart estimate</div>
              </div>
              <div style={styles.step}>
                <div style={styles.stepNum}>4</div>
                <div><strong>Pay</strong> — UPI or pay at store; pickup or delivery</div>
              </div>
              <div style={styles.step}>
                <div style={styles.stepNum}>5</div>
                <div><strong>Track</strong> — WhatsApp + Track link for updates</div>
              </div>
            </div>
          </div>
        );
      
      case 4:
        return (
          <div style={styles.stepContent}>
            <div style={styles.emoji}>🎯</div>
            <h2 style={styles.stepTitle}>Prices modes</h2>
            <p style={styles.stepDesc}>
              On Prices, pick how you want to buy:
            </p>
            <div style={styles.modes}>
              <div style={styles.mode}>
                <span style={styles.modeIcon}>🏪</span>
                <div>
                  <div style={styles.modeTitle}>My Kirana</div>
                  <div style={styles.modeDesc}>Your go-to shop</div>
                </div>
              </div>
              <div style={styles.mode}>
                <span style={styles.modeIcon}>📍</span>
                <div>
                  <div style={styles.modeTitle}>Nearby</div>
                  <div style={styles.modeDesc}>Complete from around you</div>
                </div>
              </div>
              <div style={styles.mode}>
                <span style={styles.modeIcon}>★</span>
                <div>
                  <div style={styles.modeTitle}>Favorites</div>
                  <div style={styles.modeDesc}>Saved shops only</div>
                </div>
              </div>
              <div style={styles.mode}>
                <span style={styles.modeIcon}>🗺️</span>
                <div>
                  <div style={styles.modeTitle}>All Stores</div>
                  <div style={styles.modeDesc}>Pick any shop</div>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 5:
        return (
          <div style={styles.stepContent}>
            <div style={styles.emoji}>🚀</div>
            <h2 style={styles.stepTitle}>You’re ready</h2>
            <p style={styles.stepDesc}>
              Start on Shop, build a list, then open Prices to checkout.
            </p>
            <div style={styles.nextSteps}>
              <div style={styles.nextStep}>
                <div style={styles.nextStepNum}>1</div>
                <div style={styles.nextStepText}>
                  <strong>Shop</strong> for milk, atta, oil…
                </div>
              </div>
              <div style={styles.nextStep}>
                <div style={styles.nextStepNum}>2</div>
                <div style={styles.nextStepText}>
                  <strong>Prices</strong> to check big-store estimate & order
                </div>
              </div>
              <div style={styles.nextStep}>
                <div style={styles.nextStepNum}>3</div>
                <div style={styles.nextStepText}>
                  Replay anytime in <strong>Profile → Settings</strong>
                </div>
              </div>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <button onClick={onSkip} style={styles.skipBtn}>
          Skip
        </button>

        {renderStep()}

        <div style={styles.progress}>
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <div
              key={idx}
              style={{
                ...styles.dot,
                ...(idx + 1 === step ? styles.dotActive : {})
              }}
            />
          ))}
        </div>

        <div style={styles.nav}>
          {step > 1 && (
            <button onClick={prevStep} style={styles.btnSecondary}>
              ← Back
            </button>
          )}
          <button onClick={nextStep} style={styles.btnPrimary}>
            {step === totalSteps ? "Let's Go! 🎉" : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 🎨 Styles
const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    padding: 16
  },
  modal: {
    background: '#fff',
    borderRadius: 20,
    maxWidth: 480,
    width: '100%',
    padding: '32px 24px 24px',
    position: 'relative',
    maxHeight: '90vh',
    overflowY: 'auto'
  },
  skipBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    background: 'none',
    border: 'none',
    color: '#999',
    fontSize: 14,
    cursor: 'pointer',
    padding: '8px 12px',
    minHeight: 36,
    touchAction: 'manipulation'
  },
  stepContent: {
    textAlign: 'center',
    padding: '20px 0'
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#1f2937'
  },
  stepDesc: {
    fontSize: 16,
    color: '#6b7280',
    lineHeight: 1.6,
    marginBottom: 24
  },
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    textAlign: 'left'
  },
  feature: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    background: '#f9fafb',
    borderRadius: 10,
    fontSize: 15
  },
  featureIcon: {
    fontSize: 24
  },
  howto: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    textAlign: 'left'
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: 12,
    background: '#f9fafb',
    borderRadius: 10
  },
  stepNum: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: '#667eea',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 'bold',
    flexShrink: 0
  },
  modes: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12
  },
  mode: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    background: '#f9fafb',
    borderRadius: 10,
    textAlign: 'left'
  },
  modeIcon: {
    fontSize: 28,
    flexShrink: 0
  },
  modeTitle: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 2
  },
  modeDesc: {
    fontSize: 12,
    color: '#6b7280'
  },
  nextSteps: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    textAlign: 'left'
  },
  nextStep: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
    padding: 12,
    background: '#f0fdf4',
    borderRadius: 10,
    border: '2px solid #22c55e'
  },
  nextStepNum: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: '#22c55e',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 'bold',
    flexShrink: 0
  },
  nextStepText: {
    fontSize: 15,
    lineHeight: 1.5
  },
  progress: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    marginBottom: 20
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#e5e7eb',
    transition: 'all 0.3s'
  },
  dotActive: {
    width: 24,
    background: '#667eea',
    borderRadius: 4
  },
  nav: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center'
  },
  btnPrimary: {
    flex: 1,
    padding: '14px 24px',
    background: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 50,
    touchAction: 'manipulation'
  },
  btnSecondary: {
    flex: 1,
    padding: '14px 24px',
    background: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 50,
    touchAction: 'manipulation'
  },
  phoneInput: {
    width: '100%',
    padding: '16px',
    border: '2px solid #e5e7eb',
    borderRadius: 10,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: 16,
    fontWeight: 600
  },
  searchBtn: {
    width: '100%',
    padding: '14px',
    background: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 12,
    minHeight: 50,
    touchAction: 'manipulation'
  },
  skipText: {
    marginTop: 16,
    fontSize: 14,
    color: '#666'
  },
  skipLink: {
    background: 'none',
    border: 'none',
    color: '#667eea',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontSize: 14,
    padding: 0
  },
  foundStore: {
    marginTop: 16,
    textAlign: 'center'
  },
  foundIcon: {
    fontSize: 48,
    marginBottom: 12
  },
  foundTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#22c55e'
  },
  storeInfo: {
    background: '#f9fafb',
    padding: 16,
    borderRadius: 10,
    marginBottom: 16
  },
  storeName: {
    fontSize: 17,
    fontWeight: 600,
    marginBottom: 8
  },
  storePhone: {
    fontSize: 15,
    color: '#666'
  },
  confirmBtn: {
    width: '100%',
    padding: '14px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: 8,
    minHeight: 50,
    touchAction: 'manipulation'
  },
  tryAgainBtn: {
    width: '100%',
    padding: '14px',
    background: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 50,
    touchAction: 'manipulation'
  },
  notFound: {
    marginTop: 16,
    textAlign: 'center'
  },
  notFoundIcon: {
    fontSize: 48,
    marginBottom: 12
  },
  notFoundTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#ef4444'
  },
  notFoundDesc: {
    fontSize: 15,
    color: '#666',
    marginBottom: 16,
    lineHeight: 1.5
  }
};
