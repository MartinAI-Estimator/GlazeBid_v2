import React from 'react';

const TakeoffSummary = ({ allMarkups }) => {
  // Group markups by Class and Mode to sum them up
  const summary = allMarkups.reduce((acc, m) => {
    const key = `${m.class}-${m.mode}`;
    if (!acc[key]) {
      acc[key] = { class: m.class, mode: m.mode, total: 0, color: m.color, count: 0 };
    }
    acc[key].total += parseFloat(m.value || 0);
    acc[key].count += 1;
    return acc;
  }, {});

  return (
    <div style={styles.summaryContainer}>
      <h3 style={styles.title}>TAKEOFF TOTALS</h3>
      <table style={styles.table}>
        <thead>
          <tr style={styles.headerRow}>
            <th>CLASS</th>
            <th>QTY</th>
            <th>UNIT</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(summary).map((item, i) => (
            <tr key={i} style={styles.row}>
              <td style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ ...styles.colorChip, backgroundColor: item.color }}></div>
                {item.class}
              </td>
              <td style={styles.qty}>{item.total.toFixed(2)}</td>
              <td style={styles.unit}>
                {item.mode === "Count" ? "EA" : (item.mode === "Area" ? "SF" : "LF")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const styles = {
  summaryContainer: { width: '300px', backgroundColor: '#1a252f', color: 'white', padding: '15px', borderLeft: '2px solid #2c3e50' },
  title: { fontSize: '14px', borderBottom: '1px solid #34495e', paddingBottom: '10px', color: '#bdc3c7', letterSpacing: '1px' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: '10px' },
  headerRow: { textAlign: 'left', fontSize: '10px', color: '#7f8c8d' },
  row: { borderBottom: '1px solid #2c3e50', fontSize: '12px', height: '35px' },
  colorChip: { width: '10px', height: '10px', borderRadius: '2px' },
  qty: { fontWeight: 'bold', textAlign: 'right', color: '#4fd1c5' },
  unit: { fontSize: '10px', paddingLeft: '5px', color: '#95a5a6' }
};

export default TakeoffSummary;
