import { useState } from 'react';

export default function Onboarding({ onComplete, onSkip }) {
  const [step, setStep] = useState(1);
  const totalSteps = 4;

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
            <div style={styles.emoji}>🎉</div>
            <h2 style={styles.stepTitle}>Welcome to Ekkilo!</h2>
            <p style={styles.stepDesc}>
              Compare grocery prices from your local kiranas and save money on every order.
            </p>
            <div style={styles.features}>
              <div style={styles.feature}>
                <span style={styles.featureIcon}>💰</span>
                <span>Best prices automatically</span>
              </div>
              <div style={styles.feature}>
                <span style={styles.featureIcon}>⭐</span>
                <span>Save your favorites</span>
              </div>
              <div style={styles.feature}>
                <span style={styles.featureIcon}>🚀</span>
                <span>Quick reordering</span>
              </div>
            </div>
          </div>
        );
      
      case 2:
        return (
          <div style={styles.stepContent}>
            <div style={styles.emoji}>🛒</div>
            <h2 style={styles.stepTitle}>How to Order</h2>
            <p style={styles.stepDesc}>
              Just type what you need - "milk, rice, oil" - and we'll find the best deals!
            </p>
            <div style={styles.howto}>
              <div style={styles.step}>
                <div style={styles.stepNum}>1</div>
                <div>Search for your groceries</div>
              </div>
              <div style={styles.step}>
                <div style={styles.stepNum}>2</div>
                <div>Choose your ordering mode</div>
              </div>
              <div style={styles.step}>
                <div style={styles.stepNum}>3</div>
                <div>Place order & get it delivered!</div>
              </div>
            </div>
          </div>
        );
      
      case 3:
        return (
          <div style={styles.stepContent}>
            <div style={styles.emoji}>🎯</div>
            <h2 style={styles.stepTitle}>4 Ordering Modes</h2>
            <p style={styles.stepDesc}>
              Choose how you want to shop:
            </p>
            <div style={styles.modes}>
              <div style={styles.mode}>
                <span style={styles.modeIcon}>🏪</span>
                <div>
                  <div style={styles.modeTitle}>Regular</div>
                  <div style={styles.modeDesc}>Your trusted store</div>
                </div>
              </div>
              <div style={styles.mode}>
                <span style={styles.modeIcon}>⭐</span>
                <div>
                  <div style={styles.modeTitle}>Favorites</div>
                  <div style={styles.modeDesc}>Your preferred stores</div>
                </div>
              </div>
              <div style={styles.mode}>
                <span style={styles.modeIcon}>💰</span>
                <div>
                  <div style={styles.modeTitle}>Smart Buy</div>
                  <div style={styles.modeDesc}>Best price guaranteed</div>
                </div>
              </div>
              <div style={styles.mode}>
                <span style={styles.modeIcon}>✋</span>
                <div>
                  <div style={styles.modeTitle}>Manual</div>
                  <div style={styles.modeDesc}>Full control</div>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 4:
        return (
          <div style={styles.stepContent}>
            <div style={styles.emoji}>🚀</div>
            <h2 style={styles.stepTitle}>Ready to Start!</h2>
            <p style={styles.stepDesc}>
              You're all set! Here's what to do next:
            </p>
            <div style={styles.nextSteps}>
              <div style={styles.nextStep}>
                <div style={styles.nextStepNum}>1</div>
                <div style={styles.nextStepText}>
                  <strong>Search</strong> for your first order
                </div>
              </div>
              <div style={styles.nextStep}>
                <div style={styles.nextStepNum}>2</div>
                <div style={styles.nextStepText}>
                  <strong>Add favorites</strong> in your Profile
                </div>
              </div>
              <div style={styles.nextStep}>
                <div style={styles.nextStepNum}>3</div>
                <div style={styles.nextStepText}>
                  <strong>Set your regular store</strong> for quick orders
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
  }
};
