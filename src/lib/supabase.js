import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tdpabktyawspqzvbyier.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkcGFia3R5YXdzcHF6dmJ5aWVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNzE1NzIsImV4cCI6MjA5Njk0NzU3Mn0.SZ9yIpDRbdkbA5l4kUJxnS18Fjn4YzlqBW7TZkiKZoM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const formatPHP = (amount) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount ?? 0);

export const formatDate = (dateStr) =>
  dateStr ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(dateStr)) : '—';

export const monthBounds = (monthStr) => {
  const [year, month] = monthStr.split('-').map(Number);
  const start = new Date(year, month - 1, 1).toISOString().split('T')[0];
  const end = new Date(year, month, 0).toISOString().split('T')[0];
  return { start, end };
};

export const daysUntil = (dateStr) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
};

export const signOut = async () => {
  await supabase.auth.signOut();
  window.location.href = '/';
};