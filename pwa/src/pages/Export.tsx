import { useState } from 'react';
import { generateReport } from '../services/api';
import { Link } from 'react-router-dom';

export default function Export() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const pilotId = 'greenbriar-001';

  const handleExport = async () => {
    setLoading(true);
    try {
      const blob = await generateReport(pilotId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LanguageBridge-Report-${pilotId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      setDone(true);
    } catch {
      alert('Could not generate report. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <Link to="/dashboard" style={styles.back}>← Back to Dashboard</Link>
        <h1 style={styles.title}>Export PDF Report</h1>
      </div>

      <div style={styles.content}>
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Pilot Report: {pilotId}</h2>
          <p style={styles.cardText}>
            Generate a PDF report for the school board. Includes weekly active users,
            session trends, language breakdown, and flagged words summary.
          </p>
          <p style={styles.cardText}>
            All data is anonymous. No student names, emails, or identifying information
            is included in the report.
          </p>
          <button onClick={handleExport} disabled={loading} style={{
            ...styles.btn,
            opacity: loading ? 0.6 : 1,
          }}>
            {loading ? 'Generating...' : done ? 'Download Again' : 'Generate PDF Report'}
          </button>
          {done && <p style={styles.success}>Report downloaded successfully!</p>}
        </div>
      </div>

      <footer style={styles.footer}>All data is anonymous. No student PII is collected or displayed. FERPA compliant.</footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f5f7', fontFamily: 'system-ui, sans-serif' },
  topBar: { background: 'linear-gradient(135deg, #f7941d, #f15a24)', padding: '20px 32px' },
  back: { color: 'rgba(255,255,255,0.8)', textDecoration: 'none', fontSize: 13 },
  title: { color: '#fff', fontSize: 22, margin: '8px 0 0' },
  content: { padding: '32px', display: 'flex', justifyContent: 'center' },
  card: { background: '#fff', borderRadius: 12, padding: '40px', maxWidth: 500, width: '100%', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', textAlign: 'center' },
  cardTitle: { fontSize: 20, fontWeight: 600, margin: '0 0 16px', color: '#1a1a2e' },
  cardText: { fontSize: 14, color: '#666', lineHeight: 1.6, margin: '0 0 12px' },
  btn: { marginTop: 16, padding: '14px 32px', fontSize: 16, fontWeight: 600, color: '#fff', background: 'linear-gradient(135deg, #f7941d, #f15a24)', border: 'none', borderRadius: 8, cursor: 'pointer' },
  success: { marginTop: 16, color: '#27ae60', fontWeight: 600, fontSize: 14 },
  footer: { textAlign: 'center', padding: 24, fontSize: 12, color: '#999', marginTop: 40 },
};
