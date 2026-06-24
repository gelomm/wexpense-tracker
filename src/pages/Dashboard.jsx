import { useEffect, useState } from 'react';
import { supabase, formatPHP, monthBounds, daysUntil } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useMonthFilter } from '../hooks/useMonthFilter';
import { StatCard } from '../components/UI/StatCard';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Spinner } from '../components/UI/Spinner';
import { Modal } from '../components/UI/Modal';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { daysLabel, frequencyLabel } from '../lib/utils';
import { FREQ_TO_MONTHLY } from '../lib/constants';
import { syncAutoReminder } from '../lib/reminderHelpers';

export default function Dashboard({ showToast }) {
  const { user, profile } = useAuth();
  const { month, handleChange } = useMonthFilter();
  const [data, setData] = useState({ expenses: [], budgets: [], recurring: [], splits: [], members: [] });
  const [loading, setLoading] = useState(true);

  // ── Quick Add state ──
  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const [quickForm, setQuickForm] = useState({
    title: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    dueDate: '',
    category: '',
  });
  const [categories, setCategories] = useState([]);
  const [quickSplitEnabled, setQuickSplitEnabled] = useState(false);
  const [quickSplitMembers, setQuickSplitMembers] = useState([]);
  const [quickSplitType, setQuickSplitType] = useState('equal'); // 'equal', 'percentage', 'fixed'
  const [members, setMembers] = useState([]);

  // ── Load data ──
  useEffect(() => {
    if (profile?.household_id) {
      loadData();
      loadCategories();
      loadMembers();
    }
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

  const loadCategories = async () => {
    const hid = profile?.household_id;
    if (!hid) return;
    const { data } = await supabase
      .from('categories')
      .select('*')
      .or(`household_id.is.null,household_id.eq.${hid}`)
      .order('name');
    setCategories(data || []);
  };

  const loadMembers = async () => {
    const hid = profile?.household_id;
    if (!hid) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('household_id', hid)
      .neq('id', user.id);
    setMembers(data || []);
  };

  // ── Quick add handlers ──
  const openQuickAdd = () => {
    const today = new Date().toISOString().split('T')[0];
    setQuickForm({
      title: '',
      amount: '',
      date: today,
      dueDate: '',
      category: '',
    });
    setQuickSplitEnabled(false);
    setQuickSplitMembers(members.map(m => ({ ...m, amount: 0, percentage: 0, checked: false })));
    setQuickSplitType('equal');
    setQuickModalOpen(true);
  };

  const handleQuickSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(quickForm.amount);
    if (!quickForm.title || isNaN(amount) || amount <= 0) {
      showToast('Please enter a title and valid amount.', 'warning');
      return;
    }

    const payload = {
      household_id: profile.household_id,
      title: quickForm.title,
      amount: amount,
      expense_date: quickForm.date,
      due_date: quickForm.dueDate || null,
      category_id: quickForm.category || null,
      paid_by: user.id,
      status: 'unpaid',
      created_by: user.id,
    };

    const { data: expense, error } = await supabase
      .from('expenses')
      .insert(payload)
      .select()
      .single();

    if (error) {
      showToast('Failed to add expense.', 'error');
      return;
    }

    // ── Handle splits ──
    if (quickSplitEnabled) {
      const checked = quickSplitMembers.filter(m => m.checked);
      if (checked.length > 0) {
        let splitRows = [];
        if (quickSplitType === 'equal') {
          const share = amount / (checked.length + 1);
          splitRows = checked.map(m => ({
            expense_id: expense.id,
            profile_id: m.id,
            split_type: 'equal',
            amount: share,
          }));
        } else {
          // For percentage or fixed, use the amounts from the form
          splitRows = checked.map(m => ({
            expense_id: expense.id,
            profile_id: m.id,
            split_type: quickSplitType,
            amount: quickSplitType === 'percentage'
              ? amount * (m.percentage / 100)
              : m.amount,
            percentage: quickSplitType === 'percentage' ? m.percentage : null,
          }));
        }
        await supabase.from('expense_splits').insert(splitRows);
      }
    }

    // ── Auto-reminder ──
    await syncAutoReminder(expense.id, quickForm.dueDate, user.id);

    showToast('Expense added!', 'success');
    setQuickModalOpen(false);
    loadData();
  };

  // ── Split helpers for quick form ──
  const updateQuickSplit = (memberId, field, value) => {
    setQuickSplitMembers(prev =>
      prev.map(m =>
        m.id === memberId
          ? { ...m, [field]: field === 'percentage' || field === 'amount' ? parseFloat(value) || 0 : value }
          : m
      )
    );
  };

  const toggleQuickSplitMember = (memberId) => {
    setQuickSplitMembers(prev =>
      prev.map(m =>
        m.id === memberId ? { ...m, checked: !m.checked } : m
      )
    );
  };

  // ── Render ──
  if (loading) return <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>;

  const { expenses, budgets, recurring, splits, members: allMembers } = data;
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalBudget = budgets.reduce((s, b) => s + Number(b.amount), 0);
  const today = new Date(); today.setHours(0,0,0,0);
  const overdue = expenses.filter(e => e.status !== 'paid' && e.due_date && new Date(e.due_date) < today).length;
  const upcoming7 = expenses.filter(e => e.due_date && daysUntil(e.due_date) >= 0 && daysUntil(e.due_date) <= 7 && e.status !== 'paid').length;
  const recurringTotal = recurring.reduce((s, r) => s + Number(r.amount) * (FREQ_TO_MONTHLY[r.frequency] || 1), 0);

  // Month options
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
        <div className="flex items-center gap-4">
          <select value={month} onChange={handleChange} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
            {monthOptions.map((m) => (
              <option key={m.val} value={m.val}>{m.label}</option>
            ))}
          </select>
          <Button onClick={openQuickAdd}>＋ Quick Add</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon="💸" label="Total Spent" value={formatPHP(totalSpent)} sub={`${totalBudget > 0 ? Math.round((totalSpent/totalBudget)*100) : 0}% of budget`} />
        <StatCard icon="⚠️" label="Overdue" value={overdue} accent="rust" />
        <StatCard icon="📅" label="Due This Week" value={upcoming7} accent="amber" />
        <StatCard icon="🔁" label="Recurring / Month" value={formatPHP(recurringTotal)} sub={`${recurring.length} active`} accent="sky" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <div className="text-white font-semibold mb-3">Spending by Category</div>
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
          <div className="flex justify-between items-center mb-3">
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

      {/* Bottom row */}
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
            {allMembers.slice(0, 3).map((m) => {
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

      {/* ── Quick Add Modal ── */}
      <Modal isOpen={quickModalOpen} onClose={() => setQuickModalOpen(false)} title="Quick Add Expense">
        <form onSubmit={handleQuickSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Title</label>
            <input
              type="text"
              value={quickForm.title}
              onChange={(e) => setQuickForm({ ...quickForm, title: e.target.value })}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={quickForm.amount}
                onChange={(e) => setQuickForm({ ...quickForm, amount: e.target.value })}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Date</label>
              <input
                type="date"
                value={quickForm.date}
                onChange={(e) => setQuickForm({ ...quickForm, date: e.target.value })}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Category</label>
            <select
              value={quickForm.category}
              onChange={(e) => setQuickForm({ ...quickForm, category: e.target.value })}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Due Date</label>
            <input
              type="date"
              value={quickForm.dueDate}
              onChange={(e) => setQuickForm({ ...quickForm, dueDate: e.target.value })}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
            />
          </div>

          {/* Split toggle */}
          <div className="border-t border-white/5 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Split this expense</div>
                <div className="text-xs text-neutral-400">Divide among members</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={quickSplitEnabled}
                  onChange={(e) => setQuickSplitEnabled(e.target.checked)}
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:ring-2 peer-focus:ring-olive-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-olive-600"></div>
              </label>
            </div>

            {quickSplitEnabled && (
              <div className="mt-3 space-y-3">
                <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                  {['equal', 'percentage', 'fixed'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setQuickSplitType(type)}
                      className={`flex-1 py-1 px-3 rounded-lg text-xs font-medium transition-all ${
                        quickSplitType === type
                          ? 'bg-olive-600 text-white'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {type === 'equal' ? 'Equal' : type === 'percentage' ? '%' : '₱ Fixed'}
                    </button>
                  ))}
                </div>
                {members.length === 0 ? (
                  <div className="text-xs text-neutral-400">No other members to split with.</div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {quickSplitMembers.map((m) => (
                      <div key={m.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={m.checked}
                          onChange={() => toggleQuickSplitMember(m.id)}
                          className="w-4 h-4 accent-olive-500"
                        />
                        <span className="text-sm flex-1">{m.full_name}</span>
                        {quickSplitType !== 'equal' && (
                          <input
                            type="number"
                            min="0"
                            step={quickSplitType === 'percentage' ? '1' : '0.01'}
                            value={quickSplitType === 'percentage' ? m.percentage : m.amount}
                            onChange={(e) =>
                              updateQuickSplit(m.id, quickSplitType === 'percentage' ? 'percentage' : 'amount', e.target.value)
                            }
                            className="w-20 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                            disabled={!m.checked || quickSplitType === 'equal'}
                            placeholder={quickSplitType === 'percentage' ? '%' : '₱'}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setQuickModalOpen(false)}>Cancel</Button>
            <Button type="submit">Add Expense</Button>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
}