import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

export default function Login() {
  const { user, loading, signInWithGoogle } = useAuth();
  const [error, setError] = useState('');

  if (loading) return <div style={styles.container}><p>Loading...</p></div>;
  if (user) return <Navigate to="/dashboard" />;

  const handleSignIn = async () => {
    setError('');
    try {
      await signInWithGoogle();
    } catch {
      setError('Sign-in failed. Please try again.');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>🌉</div>
        <h1 style={styles.title}>LanguageBridge</h1>
        <p style={styles.subtitle}>Admin Dashboard</p>
        {error && <p style={styles.error}>{error}</p>}
        <button onClick={handleSignIn} style={styles.button}>
          Sign in with Google
        </button>
        <p style={styles.footer}>
          For authorized school administrators only.
          <br />All data is anonymous. No student PII is collected or displayed.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '48px 40px',
    textAlign: 'center',
    maxWidth: 400,
    width: '90%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  logo: { fontSize: 64, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: 700, color: '#1a1a2e', margin: '0 0 4px' },
  subtitle: { fontSize: 16, color: '#666', margin: '0 0 32px' },
  button: {
    width: '100%',
    padding: '14px 24px',
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    background: 'linear-gradient(135deg, #f7941d, #f15a24)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  error: { color: '#e74c3c', fontSize: 14, marginBottom: 16 },
  footer: { marginTop: 24, fontSize: 12, color: '#999', lineHeight: 1.5 },
};