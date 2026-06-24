import { useState, useCallback } from 'react';

export const useMonthFilter = (onChange) => {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth] = useState(defaultMonth);

  const handleChange = useCallback((e) => {
    setMonth(e.target.value);
    if (onChange) onChange(e.target.value);
  }, [onChange]);

  return { month, handleChange };
};