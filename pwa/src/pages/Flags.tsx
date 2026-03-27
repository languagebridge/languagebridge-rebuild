import { useEffect, useState } from 'react';
import { getFlagReport } from '../services/api';
import { Link } from 'react-router-dom';

type FlagItem = {
  word: string;
  language: string;
  flagCount: number;
  status: 'logged' | 'review' | 'bounty' | 'high_priority';
  lastFlagged: string;
};

export default function Flags() {
  const [flags, setFlags] = useState<FlagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const pilotId = 'greenbriar-001';

  useEffect(() => {
    getFlagReport(pilotId)
      .then((data) => { setFlags(data.flags || []); setLoading(false); })
      .catch(() => { setError('Failed to load flag report.'); setLoading(false); });
  }, []);

  const filtered = filter === 'all' ? flags : flags.filter((f) => f.status === filter);

  const statusColor = (s: string) => {
    if (s === 'bounty' || s === 'high_priority') return '#e74c3c';
    if (s === 'review') return '#f39c12';
    return '#95a5a6';
  };

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <Link to="/dashboard" style={styles.back}>← Back to Dashboard</Link>
        <h1 style={styles.title}>Flagged Words Report</h1>
      </div>

      <div style={styles.filters}>
        {['all', 'logged', 'review', 'bounty', 'high_priority'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ ...styles.filterBtn, background: filter === s ? '#f7941d' : '#e0e0e0', color: filter === s ? '#fff' : '#333' }}>
            {s === 'all' ? 'All' : s.replaceAll('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? <p style={styles.msg}>Loading flags...</p> : error ? <p style={styles.error}>{error}</p> : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Word</th>
                <th style={styles.th}>Language</th>
                <th style={styles.th}>Flags</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Last Flagged</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={`${f.word}-${f.language}`}>
                  <td style={styles.td}>{f.word}</td>
                  <td style={styles.td}>{f.language}</td>
                  <td style={styles.td}>{f.flagCount}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, background: statusColor(f.status) }}>
                      {f.status.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td style={styles.td}>{new Date(f.lastFlagged).toLocaleDateString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} style={styles.td}>No flags found.</td></tr>}
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
  filters: { display: 'flex', gap: 8, padding: '16px 32px', flexWrap: 'wrap' },
  filterBtn: { padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, textTransform: 'capitalize' },
  msg: { textAlign: 'center', padding: 40, color: '#666' },
  tableWrap: { margin: '0 32px', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '12px 16px', background: '#f8f8f8', fontWeight: 600, fontSize: 13, color: '#666', borderBottom: '1px solid #eee' },
  td: { padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 14 },
  badge: { padding: '4px 10px', borderRadius: 12, color: '#fff', fontSize: 12, fontWeight: 600 },
  error: { textAlign: 'center', padding: 40, color: '#e74c3c', fontWeight: 600 },
  footer: { textAlign: 'center', padding: 24, fontSize: 12, color: '#999', marginTop: 40 },
};