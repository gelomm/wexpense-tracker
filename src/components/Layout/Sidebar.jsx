import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const navItems = [
  { to: '/', icon: '📊', label: 'Dashboard' },
  { to: '/expenses', icon: '💸', label: 'Expenses' },
  { to: '/recurring', icon: '🔁', label: 'Recurring' },
  { to: '/splits', icon: '👥', label: 'Splits' },
  { to: '/reminders', icon: '🔔', label: 'Reminders' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
];

export const Sidebar = ({ mobileOpen, setMobileOpen }) => {
  const { profile } = useAuth();
  const initial = profile?.full_name?.[0] || 'U';

  return (
    <aside
      className={`fixed top-0 left-0 z-40 w-64 h-full bg-neutral-900/90 dark:bg-black/80 backdrop-blur-xl border-r border-white/5 p-4 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-olive-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-olive-600/20">
          W
        </div>
        <div>
          <div className="text-lg font-bold text-white">WeXpense</div>
          <div className="text-xs text-neutral-400 uppercase tracking-wider">{profile?.household?.name || 'Household'}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-olive-600/20 text-olive-400 border border-olive-500/30 shadow-lg shadow-olive-500/10'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`
            }
            onClick={() => setMobileOpen(false)}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/5 pt-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-olive-700 flex items-center justify-center text-white font-semibold text-sm">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{profile?.full_name || 'User'}</div>
          <div className="text-xs text-neutral-400 capitalize">{profile?.role || 'member'}</div>
        </div>
        <button className="text-neutral-400 hover:text-white">⋮</button>
      </div>
    </aside>
  );
};