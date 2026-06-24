import { NavLink } from 'react-router-dom';

const mobileItems = [
  { to: '/', icon: '📊', label: 'Dashboard' },
  { to: '/expenses', icon: '💸', label: 'Expenses' },
  { to: '/recurring', icon: '🔁', label: 'Recurring' },
  { to: '/splits', icon: '👥', label: 'Splits' },
  { to: '/reminders', icon: '🔔', label: 'Reminders' },
];

export const MobileNav = () => {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-neutral-900/90 dark:bg-black/80 backdrop-blur-xl border-t border-white/5 flex justify-around py-2 px-4">
      {mobileItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-xs font-medium transition-all ${
              isActive ? 'text-olive-400' : 'text-neutral-400 hover:text-white'
            }`
          }
        >
          <span className="text-xl">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
};