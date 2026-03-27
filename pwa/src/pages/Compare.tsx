import { useEffect, useState } from 'react';
import { comparePilots } from '../services/api';
import { Link } from 'react-router-dom';

type PilotSummary = {
  pilotId: string;
  wau: number;
  totalSessions: number;
  flagCount: number;
  topLanguage: string;
};

export default function Compare() {
  const [pilots, setPilots] = useState<PilotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    comparePilots()
      .then((data) => { setPilots(data.pilots || []); setLoading(false); })
      .catch(() => { setError('Failed to load pilot comparison.'); setLoading(false); });
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <Link to="/dashboard" style={styles.back}>← Back to Dashboard</Link>
        <h1 style={styles.title}>Pilot Comparison</h1>
        <p style={styles.sub}>Admin only — compare all active pilots</p>
      </div>

      {loading ? <p style={styles.msg}>Loading comparison...</p> : error ? <p style={styles.error}>{error}</p> : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Pilot ID</th>
                <th style={styles.th}>WAU</th>
                <th style={styles.th}>Sessions</th>
                <th style={styles.th}>Flags</th>
                <th style={styles.th}>Top Language</th>
              </tr>
            </thead>
            <tbody>
              {pilots.map((p) => (
                <tr key={p.pilotId}>
                  <td style={styles.td}>{p.pilotId}</td>
                  <td style={styles.td}>{p.wau}</td>
                  <td style={styles.td}>{p.totalSessions}</td>
                  <td style={styles.td}>{p.flagCount}</td>
                  <td style={styles.td}>{p.topLanguage}</td>
                </tr>
              ))}
              {pilots.length === 0 && <tr><td colSpan={5} style={styles.td}>No pilot data available.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <footer style={styles.footer}>All data is anonymous. No student PII is collected or displayed. FERPA compliant.</footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f5f7', fontFamily: 'system-ui, sans-serif' },
  topBar: { background: 'linear-gradient(135deg, #f7941d, #f15a24)', padding: '20px 32px' },
  back: { color: 'rgba(255,255,255,0.8)', textDecoration: 'none', fontSize: 13 },
  title: { color: '#fff', fontSize: 22, margin: '8px 0 0' },
  sub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '4px 0 0' },
  msg: { textAlign: 'center', padding: 40, color: '#666' },
  tableWrap: { margin: '24px 32px', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '12px 16px', background: '#f8f8f8', fontWeight: 600, fontSize: 13, color: '#666', borderBottom: '1px solid #eee' },
  td: { padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 14 },
  error: { textAlign: 'center', padding: 40, color: '#e74c3c', fontWeight: 600 },
  footer: { textAlign: 'center', padding: 24, fontSize: 12, color: '#999', marginTop: 40 },
};
