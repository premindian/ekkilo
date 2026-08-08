// Simple lightweight chart component (no external dependencies)

export function BarChart({ data, title, height = 200 }) {
  if (!data || data.length === 0) return null;

  const maxValue = Math.max(...data.map(d => d.value));
  const barWidth = 100 / data.length;

  return (
    <div style={styles.container}>
      {title && <h3 style={styles.title}>{title}</h3>}
      <svg width="100%" height={height} style={styles.svg}>
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * (height - 40);
          const x = index * barWidth;
          
          return (
            <g key={index}>
              {/* Bar */}
              <rect
                x={`${x}%`}
                y={height - barHeight - 20}
                width={`${barWidth * 0.8}%`}
                height={barHeight}
                fill="#3b82f6"
                rx="4"
              />
              {/* Value */}
              <text
                x={`${x + barWidth / 2}%`}
                y={height - barHeight - 25}
                textAnchor="middle"
                fontSize="12"
                fill="#374151"
                fontWeight="600"
              >
                {item.value}
              </text>
              {/* Label */}
              <text
                x={`${x + barWidth / 2}%`}
                y={height - 5}
                textAnchor="middle"
                fontSize="11"
                fill="#6b7280"
              >
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function PieChart({ data, title, size = 200 }) {
  if (!data || data.length === 0) return null;

  const total = data.reduce((sum, d) => sum + d.value, 0);
  let currentAngle = 0;
  const radius = size / 2 - 10;
  const centerX = size / 2;
  const centerY = size / 2;

  const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div style={styles.container}>
      {title && <h3 style={styles.title}>{title}</h3>}
      <div style={{display: 'flex', alignItems: 'center', gap: 20}}>
        <svg width={size} height={size} style={styles.svg}>
          {data.map((item, index) => {
            const angle = (item.value / total) * 360;
            const startAngle = currentAngle;
            const endAngle = currentAngle + angle;
            
            const x1 = centerX + radius * Math.cos((startAngle - 90) * Math.PI / 180);
            const y1 = centerY + radius * Math.sin((startAngle - 90) * Math.PI / 180);
            const x2 = centerX + radius * Math.cos((endAngle - 90) * Math.PI / 180);
            const y2 = centerY + radius * Math.sin((endAngle - 90) * Math.PI / 180);
            
            const largeArc = angle > 180 ? 1 : 0;
            const path = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
            
            currentAngle += angle;
            
            return (
              <path
                key={index}
                d={path}
                fill={colors[index % colors.length]}
                stroke="white"
                strokeWidth="2"
              />
            );
          })}
        </svg>
        
        {/* Legend */}
        <div style={styles.legend}>
          {data.map((item, index) => (
            <div key={index} style={styles.legendItem}>
              <div 
                style={{
                  ...styles.legendColor,
                  background: colors[index % colors.length]
                }}
              />
              <span style={styles.legendText}>
                {item.label}: {item.value} ({Math.round(item.value / total * 100)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LineChart({ data, title, height = 200 }) {
  if (!data || data.length === 0) return null;

  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue || 1;

  const points = data.map((item, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = height - 40 - ((item.value - minValue) / range) * (height - 60);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div style={styles.container}>
      {title && <h3 style={styles.title}>{title}</h3>}
      <svg width="100%" height={height} style={styles.svg}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((fraction, i) => (
          <line
            key={i}
            x1="0"
            y1={height - 40 - (height - 60) * fraction}
            x2="100%"
            y2={height - 40 - (height - 60) * fraction}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}
        
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        
        {/* Points and labels */}
        {data.map((item, index) => {
          const x = (index / (data.length - 1)) * 100;
          const y = height - 40 - ((item.value - minValue) / range) * (height - 60);
          
          return (
            <g key={index}>
              {/* Point */}
              <circle
                cx={`${x}%`}
                cy={y}
                r="4"
                fill="#3b82f6"
              />
              {/* Value */}
              <text
                x={`${x}%`}
                y={y - 10}
                textAnchor="middle"
                fontSize="12"
                fill="#374151"
                fontWeight="600"
              >
                {item.value}
              </text>
              {/* Label */}
              <text
                x={`${x}%`}
                y={height - 5}
                textAnchor="middle"
                fontSize="11"
                fill="#6b7280"
              >
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const styles = {
  container: {
    background: 'white',
    borderRadius: 12,
    padding: 20,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  title: {
    margin: '0 0 16px 0',
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  svg: {
    overflow: 'visible',
  },
  legend: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 13,
    color: '#374151',
  },
};
