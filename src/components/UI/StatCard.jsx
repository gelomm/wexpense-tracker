export const StatCard = ({ icon, label, value, sub, accent = 'olive' }) => {
  const colors = {
    olive: 'border-olive-500/30',
    rust: 'border-rust-500/30',
    amber: 'border-amber-500/30',
    sky: 'border-sky-500/30',
  };
  return (
    <div className={`stat-card border-t-2 ${colors[accent]}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-neutral-400">{label}</div>
          <div className="text-2xl font-bold text-white">{value}</div>
          {sub && <div className="text-xs text-neutral-400 mt-1">{sub}</div>}
        </div>
        <div className="text-2xl">{icon}</div>
      </div>
    </div>
  );
};