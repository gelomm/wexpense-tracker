import { useTheme } from '../../hooks/useTheme';

export const Topbar = ({ pageTitle, onMenuClick }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 glass border-b border-white/5 px-6 py-3 flex items-center justify-between backdrop-blur-lg">
      <div className="flex items-center gap-4">
        <button onClick={onMenuClick} className="lg:hidden text-neutral-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-white">{pageTitle}</h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white transition-all"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  );
};