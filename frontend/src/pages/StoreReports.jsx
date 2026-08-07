import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = "";

export default function StoreReports() {
  const { token } = useAuth();
  const [days, setDays] = useState(7);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, [days]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/store/reports/sales?token=${token}&days=${days}`);
      const data = await res.json();
      setReport(data);
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>📊 Reports</h1>
        <button onClick={() => window.location.href = '/store'} style={styles.backBtn}>
          ← Back
        </button>
      </div>

      {/* Time Range Selector */}
      <div style={styles.timeSelector}>
        {[7, 14, 30, 90].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={days === d ? styles.timeBtnActive : styles.timeBtn}
          >
            {d} days
          </button>
        ))}
      </div>

      {loading ? (
        <div style={styles.loading}>🔄 Loading...</div>
      ) : !report ? (
        <div style={styles.error}>Failed to load report</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>₹{report.total_sales?.toFixed(2) || 0}</div>
              <div style={styles.summaryLabel}>Total Sales</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{report.total_orders || 0}</div>
              <div style={styles.summaryLabel}>Total Orders</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>₹{report.avg_order?.toFixed(2) || 0}</div>
              <div style={styles.summaryLabel}>Avg Order</div>
            </div>
          </div>

          {/* Daily Sales Chart */}
          {report.daily_breakdown && report.daily_breakdown.length > 0 && (
            <div style={styles.chartSection}>
              <h2 style={styles.chartTitle}>📈 Daily Sales</h2>
              <div style={styles.chart}>
                {report.daily_breakdown.map((day, i) => {
                  const maxSales = Math.max(...report.daily_breakdown.map(d => d.sales || 0));
                  const height = maxSales > 0 ? (day.sales / maxSales) * 150 : 0;
                  
                  return (
                    <div key={i} style={styles.chartBar}>
                      <div style={styles.chartBarValue}>₹{day.sales?.toFixed(0)}</div>
                      <div style={{...styles.chartBarFill, height: `${height}px`}}></div>
                      <div style={styles.chartBarLabel}>
                        {new Date(day.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Products */}
          {report.top_products && report.top_products.length > 0 && (
            <div style={styles.topProducts}>
              <h2 style={styles.sectionTitle}>🏆 Top Products</h2>
              {report.top_products.map((product, i) => (
                <div key={i} style={styles.topProductItem}>
                  <div style={styles.topProductRank}>{i + 1}</div>
                  <div style={styles.topProductInfo}>
                    <div style={styles.topProductName}>{product.product_name}</div>
                    <div style={styles.topProductMeta}>
                      {product.quantity} sold • ₹{product.revenue?.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 600,
    margin: 'auto',
    padding: 16,
    paddingBottom: 80,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  backBtn: {
    padding: '8px 16px',
    background: '#f3f4f6',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  timeSelector: {
    display: 'flex',
    gap: 8,
    marginBottom: 20,
  },
  timeBtn: {
    flex: 1,
    padding: '10px',
    background: '#f3f4f6',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  timeBtnActive: {
    flex: 1,
    padding: '10px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  loading: {
    textAlign: 'center',
    padding: 60,
    color: '#666',
  },
  error: {
    textAlign: 'center',
    padding: 60,
    color: '#ef4444',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    marginBottom: 24,
  },
  summaryCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 16,
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#22c55e',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
  },
  chartSection: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  chartTitle: {
    margin: '0 0 16px 0',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  chart: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 200,
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: 8,
  },
  chartBar: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chartBarValue: {
    fontSize: 10,
    fontWeight: 600,
    color: '#666',
    marginBottom: 4,
  },
  chartBarFill: {
    width: '100%',
    background: 'linear-gradient(180deg, #3b82f6 0%, #60a5fa 100%)',
    borderRadius: '4px 4px 0 0',
    minHeight: 4,
  },
  chartBarLabel: {
    fontSize: 10,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  topProducts: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    margin: '0 0 16px 0',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  topProductItem: {
    display: 'flex',
    gap: 12,
    padding: '12px 0',
    borderBottom: '1px solid #f3f4f6',
  },
  topProductRank: {
    width: 32,
    height: 32,
    background: '#f3f4f6',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  topProductInfo: {
    flex: 1,
  },
  topProductName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#1f2937',
  },
  topProductMeta: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
};
