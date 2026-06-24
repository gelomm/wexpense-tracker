/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        olive: {
          50: '#f6f8f0', 100: '#e5ebd6', 200: '#cdd8b2', 300: '#b2c48b',
          400: '#96ae64', 500: '#7a9444', 600: '#607535', 700: '#4a5a28',
          800: '#36421d', 900: '#242e14', 950: '#171f0c',
        },
        rust: {
          50: '#fdf5f0', 100: '#fce7db', 200: '#f8ceb6', 300: '#f3ae88',
          400: '#ec855a', 500: '#e05f33', 600: '#c64a22', 700: '#a33a1b',
          800: '#823015', 900: '#67270f', 950: '#3f1606',
        },
        glass: {
          DEFAULT: 'rgba(255,255,255,0.05)',
          hover: 'rgba(255,255,255,0.08)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"Fira Code"', 'monospace'],
      },
      backdropBlur: {
        md: '12px',
        lg: '20px',
      },
      boxShadow: {
        glass: '0 4px 24px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.06)',
        glow: '0 0 32px rgba(122,148,68,0.15)',
      },
    },
  },
  plugins: [],
};