import { useEffect, useState } from 'react';
import { supabase, formatPHP, monthBounds, daysUntil } from '../lib/supabase';
import { useMonthFilter } from '../hooks/useMonthFilter';
import { useAuth } from '../hooks/useAuth';
import { StatCard } from '../components/UI/StatCard';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Spinner } from '../components/UI/Spinner';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { daysLabel, frequencyLabel } from '../lib/utils';
import { FREQ_TO_MONTHLY } from '../lib/constants';

export default function Dashboard({ showToast }) {
  const { profile } = useAuth();
  const { month, handleChange } = useMonthFilter();
  const [data, setData] = useState({ expenses: [], budgets: [], recurring: [], splits: [], members: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.household_id) loadData();
  }, [month, profile]);

  const loadData = async () => {
    setLoading(true);
    const hid = profile.household_id;
    const { start, end } = monthBounds(month);

    const [expRes, budRes, recRes, splitRes, memRes] = await Promise.all([
      supabase.from('expenses').select('*, category:categories(*)').eq('household_id', hid).gte('expense_date', start).lte('expense_date', end).eq('is_deleted', false),
      supabase.from('budgets').select('*, category:categories(*)').eq('household_id', hid).eq('month', month),
      supabase.from('recurring_expenses').select('*, category:categories(*)').eq('household_id', hid).eq('is_active', true),
      supabase.from('expense_splits').select('*, expense:expenses(title, amount, household_id), profile:profiles(id, full_name)').eq('is_settled', false),
      supabase.from('profiles').select('id, full_name').eq('household_id', hid),
    ]);

    setData({
      expenses: expRes.data || [],
      budgets: budRes.data || [],
      recurring: recRes.data || [],
      splits: splitRes.data || [],
      members: memRes.data || [],
    });
    setLoading(false);
  };

  if (loading) return <div className="flex justify-center"><Spinner size="lg" /></div>;

  const { expenses, budgets, recurring, splits, members } = data;
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalBudget = budgets.reduce((s, b) => s + Number(b.amount), 0);
  const today = new Date(); today.setHours(0,0,0,0);
  const overdue = expenses.filter(e => e.status !== 'paid' && e.due_date && new Date(e.due_date) < today).length;
  const upcoming7 = expenses.filter(e => e.due_date && daysUntil(e.due_date) >= 0 && daysUntil(e.due_date) <= 7 && e.status !== 'paid').length;
  const recurringTotal = recurring.reduce((s, r) => s + Number(r.amount) * (FREQ_TO_MONTHLY[r.frequency] || 1), 0);

  // Generate month options
  const now = new Date();
  const monthOptions = [];
  for (let i = -12; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthOptions.push({ val, label: d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <select value={month} onChange={handleChange} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
          {monthOptions.map((m) => (
            <option key={m.val} value={m.val}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon="💸" label="Total Spent" value={formatPHP(totalSpent)} sub={`${totalBudget > 0 ? Math.round((totalSpent/totalBudget)*100) : 0}% of budget`} />
        <StatCard icon="⚠️" label="Overdue" value={overdue} accent="rust" />
        <StatCard icon="📅" label="Due This Week" value={upcoming7} accent="amber" />
        <StatCard icon="🔁" label="Recurring / Month" value={formatPHP(recurringTotal)} sub={`${recurring.length} active`} accent="sky" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <div className="text-white font-semibold mb-2">Spending by Category</div>
          <div className="space-y-2">
            {Object.entries(
              expenses.reduce((acc, e) => {
                const key = e.category?.name || 'Uncategorized';
                acc[key] = (acc[key] || 0) + Number(e.amount);
                return acc;
              }, {})
            ).slice(0, 5).map(([name, amount]) => (
              <div key={name} className="flex justify-between text-sm">
                <span>{name}</span>
                <span className="font-mono">{formatPHP(amount)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="flex justify-between items-center mb-2">
            <div className="text-white font-semibold">Budget vs Actual</div>
            <Link to="/settings"><Button size="sm" variant="ghost">Manage</Button></Link>
          </div>
          {budgets.slice(0, 5).map((b) => {
            const spent = expenses.filter(e => e.category_id === b.category_id).reduce((s, e) => s + Number(e.amount), 0);
            const pct = Math.min(Math.round((spent / b.amount) * 100), 100);
            return (
              <div key={b.id} className="mb-2">
                <div className="flex justify-between text-sm">
                  <span>{b.category?.icon} {b.category?.name}</span>
                  <span>{formatPHP(spent)} / {formatPHP(b.amount)}</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-olive-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <div className="flex justify-between items-center mb-3">
            <span className="text-white font-semibold">Due This Week</span>
            <Link to="/expenses"><Button size="sm" variant="ghost">View all</Button></Link>
          </div>
          {upcoming7 === 0 ? (
            <div className="text-neutral-400 text-sm">Nothing due this week!</div>
          ) : (
            <div className="space-y-2">
              {expenses.filter(e => e.due_date && daysUntil(e.due_date) >= 0 && daysUntil(e.due_date) <= 7 && e.status !== 'paid').slice(0, 4).map((e) => (
                <div key={e.id} className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div>
                    <div className="text-sm font-medium">{e.title}</div>
                    <div className="text-xs text-neutral-400">{daysLabel(daysUntil(e.due_date))}</div>
                  </div>
                  <div className="font-mono text-sm">{formatPHP(e.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex justify-between items-center mb-3">
            <span className="text-white font-semibold">Who Owes Who</span>
            <Link to="/splits"><Button size="sm" variant="ghost">Settle up</Button></Link>
          </div>
          <div className="space-y-1">
            {members.slice(0, 3).map((m) => {
              const theyOwe = splits.filter(s => s.profile_id === m.id && s.expense?.household_id === profile.household_id).reduce((s, x) => s + Number(x.amount), 0);
              return (
                <div key={m.id} className="flex justify-between text-sm border-b border-white/5 py-1">
                  <span>{m.full_name}</span>
                  <span className={theyOwe > 0 ? 'text-olive-400' : 'text-rust-400'}>
                    {formatPHP(Math.abs(theyOwe))}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="flex justify-between items-center mb-3">
            <span className="text-white font-semibold">Recurring Expenses</span>
            <Link to="/recurring"><Button size="sm" variant="ghost">Manage</Button></Link>
          </div>
          {recurring.length === 0 ? (
            <div className="text-neutral-400 text-sm">No recurring expenses.</div>
          ) : (
            <div className="space-y-2">
              {recurring.slice(0, 4).map((r) => (
                <div key={r.id} className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-sm">{r.title}</span>
                  <span className="text-sm font-mono">{formatPHP(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </motion.div>
  );
}