import axios from 'axios';
import { supabase } from './supabase';

if (!import.meta.env.VITE_API_BASE_URL) {
  throw new Error('Missing VITE_API_BASE_URL environment variable');
}

const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// Attach the Supabase token to every request
API.interceptors.request.use(async (config) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch {
    // Continue without auth header — API will return 401 if needed
  }
  return config;
});

// Dashboard data: WAU, sessions, language breakdown
export async function getDashboardData(pilotId: string) {
  const res = await API.get('/dashboard-reader', { params: { pilotId } });
  return res.data;
}

// Flag report: all flagged words
export async function getFlagReport(pilotId: string) {
  const res = await API.get('/dashboard-reader', { params: { pilotId, type: 'flags' } });
  return res.data;
}

// Compare pilots (admin only)
export async function comparePilots() {
  const res = await API.get('/dashboard-reader', { params: { type: 'compare' } });
  return res.data;
}

// Generate PDF report
export async function generateReport(pilotId: string) {
  const res = await API.get('/report-generator', { params: { pilotId }, responseType: 'blob' });
  return res.data;
}