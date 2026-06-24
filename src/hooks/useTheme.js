import { useEffect, useState } from 'react';

export const useTheme = () => {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const stored = localStorage.getItem('gastos-theme') || 'dark';
    setTheme(stored);
    document.documentElement.className = stored;
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('gastos-theme', next);
    document.documentElement.className = next;
  };

  return { theme, toggleTheme };
};