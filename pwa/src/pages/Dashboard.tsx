import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getDashboardData } from '../services/api';
import { Link } from 'react-router-dom';

type DashboardStats = {
  wau: number;
  totalSessions: number;
  totalTranslations: number;
  flagCount: number;
  languages: { language: string; count: number }[];
  weeklyTrend: { week: string; sessions: number }[];
};

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pilotId = 'greenbriar-001';

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      setError('Sign-out failed. Please try again.');
    }
  };

  useEffect(() => {
    getDashboardData(pilotId)
      .then((data) => { setStats(data); setLoading(false); })
      .catch(() => { setError('Could not load dashboard data.'); setLoading(false); });
  }, []);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.headerTitle}>🌉 LanguageBridge Dashboard</h1>
          <p style={styles.headerSub}>{user?.email} · Pilot: {pilotId}</p>
        </div>
        <button onClick={handleSignOut} style={styles.logoutBtn}>Sign Out</button>
      </header>

      <nav style={styles.nav}>
        <Link to="/dashboard" style={styles.navLink}>Overview</Link>
        <Link to="/dashboard/flags" style={styles.navLink}>Flags</Link>
        <Link to="/dashboard/compare" style={styles.navLink}>Compare</Link>
        <Link to="/dashboard/export" style={styles.navLink}>Export PDF</Link>
      </nav>

      {loading && <p style={styles.message}>Loading dashboard...</p>}
      {error && <p style={styles.error}>{error}</p>}

      {stats && (
        <>
          <div style={styles.cardRow}>
            <div style={styles.card}>
              <p style={styles.cardLabel}>Weekly Active Users</p>
              <p style={styles.cardValue}>{stats.wau}</p>
            </div>
            <div style={styles.card}>
              <p style={styles.cardLabel}>Total Sessions</p>
              <p style={styles.cardValue}>{stats.totalSessions}</p>
            </div>
            <div style={styles.card}>
              <p style={styles.cardLabel}>Translations</p>
              <p style={styles.cardValue}>{stats.totalTranslations}</p>
            </div>
            <div style={styles.card}>
              <p style={styles.cardLabel}>Flagged Words</p>
              <p style={styles.cardValue}>{stats.flagCount}</p>
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Language Breakdown</h2>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr><th style={styles.th}>Language</th><th style={styles.th}>Sessions</th></tr>
                </thead>
                <tbody>
                  {stats.languages.map((l) => (
                    <tr key={l.language}>
                      <td style={styles.td}>{l.language}</td>
                      <td style={styles.td}>{l.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Weekly Trend</h2>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr><th style={styles.th}>Week</th><th style={styles.th}>Sessions</th></tr>
                </thead>
                <tbody>
                  {stats.weeklyTrend.map((w) => (
                    <tr key={w.week}>
                      <td style={styles.td}>{w.week}</td>
                      <td style={styles.td}>{w.sessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <footer style={styles.footer}>
        All data is anonymous. No student PII is collected or displayed. FERPA compliant.
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f5f7', fontFamily: 'system-ui, sans-serif' },
  header: { background: 'linear-gradient(135deg, #f7941d, #f15a24)', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 22, margin: 0 },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: '4px 0 0' },
  logoutBtn: { background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 14 },
  nav: { display: 'flex', gap: 8, padding: '16px 32px', background: '#fff', borderBottom: '1px solid #e0e0e0' },
  navLink: { padding: '8px 16px', borderRadius: 6, background: '#f0f0f0', color: '#333', textDecoration: 'none', fontSize: 14, fontWeight: 500 },
  message: { textAlign: 'center', padding: 40, color: '#666', fontSize: 16 },
  cardRow: { display: 'flex', gap: 16, padding: '24px 32px', flexWrap: 'wrap' },
  card: { flex: '1 1 200px', background: '#fff', borderRadius: 12, padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  cardLabel: { fontSize: 13, color: '#888', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardValue: { fontSize: 36, fontWeight: 700, color: '#1a1a2e', margin: 0 },
  section: { padding: '0 32px 24px' },
  sectionTitle: { fontSize: 18, fontWeight: 600, color: '#333', margin: '24px 0 12px' },
  tableWrap: { background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '12px 16px', background: '#f8f8f8', fontWeight: 600, fontSize: 13, color: '#666', borderBottom: '1px solid #eee' },
  td: { padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 14 },
  error: { textAlign: 'center', padding: 40, color: '#e74c3c', fontSize: 16, fontWeight: 600 },
  footer: { textAlign: 'center', padding: '24px', fontSize: 12, color: '#999', borderTop: '1px solid #e0e0e0', marginTop: 40 },
};