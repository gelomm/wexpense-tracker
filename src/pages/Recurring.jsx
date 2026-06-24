import { useEffect, useState } from 'react';
import { supabase, formatPHP, formatDate } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/UI/Button';
import { Card } from '../components/UI/Card';
import { Modal } from '../components/UI/Modal';
import { Spinner } from '../components/UI/Spinner';
import { motion } from 'framer-motion';
import { frequencyLabel } from '../lib/utils';
import { syncAutoReminder } from '../lib/reminderHelpers';

export default function Recurring({ showToast }) {
  const { profile, user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [members, setMembers] = useState([]);

  // ── Form state ──
  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    frequency: 'monthly',
    startDate: '',
    endDate: '',
    category: '',
    paidBy: '',
    notes: '',
  });

  // ── Split state ──
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitType, setSplitType] = useState('equal');
  const [splitConfig, setSplitConfig] = useState([]);

  // ── Load data ──
  useEffect(() => {
    if (profile?.household_id) {
      loadRecurring();
      loadCategories();
      loadMembers();
    }
  }, [profile]);

  // ── Recalculate splits when amount, payer, or split type changes ──
  useEffect(() => {
    if (splitEnabled && members.length > 0) {
      const amount = parseFloat(formData.amount) || 0;
      const payerId = formData.paidBy || user?.id;
      recalculateSplits(amount, payerId);
    }
  }, [formData.amount, formData.paidBy, splitType, splitEnabled, members]);

  const loadRecurring = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('recurring_expenses')
      .select('*, category:categories(*), payer:profiles!recurring_expenses_paid_by_fkey(id, full_name)')
      .eq('household_id', profile.household_id)
      .order('next_due_date', { ascending: true });
    setItems(data || []);
    setLoading(false);
  };

  const loadCategories = async () => {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .or(`household_id.is.null,household_id.eq.${profile.household_id}`)
      .order('name');
    setCategories(data || []);
  };

  const loadMembers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('household_id', profile.household_id);
    setMembers(data || []);
  };

  // ── Split helpers ──
  const recalculateSplits = (amount, payerId) => {
    const others = members.filter(m => m.id !== payerId);
    if (others.length === 0) {
      setSplitConfig([]);
      return;
    }

    let newConfig;
    if (splitType === 'equal') {
      const equalShare = amount > 0 ? Number((amount / (others.length + 1)).toFixed(2)) : 0;
      newConfig = others.map(m => ({
        profile_id: m.id,
        amount: equalShare,
        percentage: null,
      }));
    } else if (splitType === 'percentage') {
      const pct = Math.round(100 / (others.length + 1));
      newConfig = others.map(m => ({
        profile_id: m.id,
        amount: amount > 0 ? Number((amount * (pct / 100)).toFixed(2)) : 0,
        percentage: pct,
      }));
    } else {
      newConfig = others.map(m => ({
        profile_id: m.id,
        amount: 0,
        percentage: null,
      }));
    }
    setSplitConfig(newConfig);
  };

  const updateSplitAmount = (profileId, value) => {
    setSplitConfig(prev =>
      prev.map(s => {
        if (s.profile_id !== profileId) return s;
        const num = parseFloat(value) || 0;
        if (splitType === 'percentage') {
          const amount = parseFloat(formData.amount) || 0;
          return { ...s, percentage: num, amount: amount > 0 ? Number((amount * (num / 100)).toFixed(2)) : 0 };
        } else {
          return { ...s, amount: num, percentage: null };
        }
      })
    );
  };

  const getSplitTotal = () => {
    return splitConfig.reduce((sum, s) => sum + (splitType === 'percentage' ? (s.percentage || 0) : (s.amount || 0)), 0);
  };

  const getTotalAssigned = () => {
    return splitConfig.reduce((sum, s) => sum + (s.amount || 0), 0);
  };

  const isSplitBalanced = () => {
    const total = parseFloat(formData.amount) || 0;
    if (total === 0) return splitConfig.every(s => (s.amount || 0) === 0);
    if (splitType === 'percentage') {
      return Math.abs(getSplitTotal() - 100) < 0.01;
    }
    return Math.abs(getTotalAssigned() - total) < 0.01;
  };

  // ── Form handlers ──
  const openAdd = () => {
    setEditingId(null);
    const today = new Date().toISOString().split('T')[0];
    setFormData({
      title: '',
      amount: '',
      frequency: 'monthly',
      startDate: today,
      endDate: '',
      category: '',
      paidBy: user?.id || '',
      notes: '',
    });
    setSplitEnabled(false);
    setSplitType('equal');
    setSplitConfig([]);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setFormData({
      title: item.title,
      amount: String(item.amount),
      frequency: item.frequency,
      startDate: item.start_date,
      endDate: item.end_date || '',
      category: item.category_id || '',
      paidBy: item.paid_by || user?.id || '',
      notes: item.notes || '',
    });

    const config = item.split_config || [];
    if (config && config.length > 0) {
      setSplitEnabled(true);
      const type = config[0]?.split_type || 'equal';
      setSplitType(type);
      setSplitConfig(config.map(s => ({
        profile_id: s.profile_id,
        amount: s.amount || 0,
        percentage: s.percentage || null,
      })));
    } else {
      setSplitEnabled(false);
      setSplitType('equal');
      setSplitConfig([]);
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(formData.amount);
    if (!formData.title || isNaN(amount) || amount <= 0 || !formData.startDate) {
      showToast('Title, amount, and start date are required.', 'warning');
      return;
    }

    let finalSplitConfig = [];
    if (splitEnabled && splitConfig.length > 0) {
      const payerId = formData.paidBy || user?.id;
      const others = members.filter(m => m.id !== payerId);

      finalSplitConfig = splitConfig
        .filter(s => {
          const val = splitType === 'percentage' ? (s.percentage || 0) : (s.amount || 0);
          return val > 0.01;
        })
        .map(s => {
          const val = splitType === 'percentage' ? (s.percentage || 0) : (s.amount || 0);
          const amt = splitType === 'percentage'
            ? Number((amount * (val / 100)).toFixed(2))
            : Number(val.toFixed(2));
          return {
            profile_id: s.profile_id,
            split_type: splitType,
            amount: amt,
            percentage: splitType === 'percentage' ? val : null,
          };
        });

      if (splitType === 'equal') {
        const included = finalSplitConfig.length;
        if (included > 0) {
          const equalShare = Number((amount / (included + 1)).toFixed(2));
          finalSplitConfig = finalSplitConfig.map(s => ({
            ...s,
            amount: equalShare,
          }));
        }
      }

      const assignedTotal = finalSplitConfig.reduce((sum, s) => sum + (s.amount || 0), 0);
      if (assignedTotal > amount + 0.01) {
        showToast('Total assigned exceeds the expense amount.', 'warning');
        return;
      }
    }

    const payload = {
      household_id: profile.household_id,
      title: formData.title,
      amount: amount,
      frequency: formData.frequency,
      start_date: formData.startDate,
      end_date: formData.endDate || null,
      category_id: formData.category || null,
      paid_by: formData.paidBy || user?.id,
      notes: formData.notes || null,
      next_due_date: formData.startDate,
      is_active: true,
      created_by: user?.id,
      split_config: finalSplitConfig,
    };

    let result;
    if (editingId) {
      result = await supabase.from('recurring_expenses').update(payload).eq('id', editingId);
    } else {
      result = await supabase.from('recurring_expenses').insert(payload);
    }

    if (result.error) {
      showToast('Failed to save: ' + result.error.message, 'error');
      return;
    }
    // After saving recurring
    if (savedId) {
      await syncRecurringAutoReminder(savedId, formData.startDate, user.id, !!editingId);
    }
    showToast(editingId ? 'Updated!' : 'Added!', 'success');
    setModalOpen(false);
    loadRecurring();
  };

  const toggleActive = async (id, current) => {
    await supabase.from('recurring_expenses').update({ is_active: !current }).eq('id', id);
    loadRecurring();
  };

  const generateNow = async (id) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    const { data: expense, error: expError } = await supabase
      .from('expenses')
      .insert({
        household_id: profile.household_id,
        title: item.title,
        amount: item.amount,
        category_id: item.category_id,
        paid_by: item.paid_by,
        expense_date: new Date().toISOString().split('T')[0],
        due_date: item.next_due_date,
        is_recurring: true,
        recurring_id: item.id,
        status: 'unpaid',
        created_by: user?.id,
      })
      .select()
      .single();

    if (expError) {
      showToast('Failed to generate expense.', 'error');
      return;
    }

    const splitConfig = item.split_config || [];
    if (splitConfig.length > 0) {
      const splitRows = splitConfig.map(sc => ({
        expense_id: expense.id,
        profile_id: sc.profile_id,
        split_type: sc.split_type || 'equal',
        amount: sc.amount || 0,
        percentage: sc.percentage || null,
        is_settled: false,
      }));
      await supabase.from('expense_splits').insert(splitRows);
      // After expense and splits are created
      await syncAutoReminder(expense.id, item.next_due_date, user.id);
    }

    showToast('Expense generated! ⚡', 'success');
    loadRecurring();
  };

  const deleteItem = async (id) => {
    if (confirm('Delete this recurring expense?')) {
      await supabase.from('recurring_expenses').delete().eq('id', id);
      showToast('Deleted.', 'info');
      loadRecurring();
    }
  };

  // ── Render ──
  if (loading) return <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Recurring Expenses</h2>
        <Button onClick={openAdd}>＋ Add Recurring</Button>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <Card>
            <div className="text-neutral-400 text-center py-8">No recurring expenses.</div>
          </Card>
        ) : (
          items.map((item) => {
            const hasSplit = item.split_config && item.split_config.length > 0;
            return (
              <Card key={item.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <span className="text-2xl">{item.category?.icon || '🔁'}</span>
                  <div>
                    <div className="font-medium">{item.title}</div>
                    <div className="text-xs text-neutral-400 flex gap-2 flex-wrap">
                      <span>{frequencyLabel(item.frequency)}</span>
                      <span>· Next: {formatDate(item.next_due_date)}</span>
                      {hasSplit && <span className="text-olive-400">👥 Split ({item.split_config.length} members)</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono">{formatPHP(item.amount)}</span>
                  <span className={`badge ${item.is_active ? 'bg-olive-500/20 text-olive-400' : 'bg-neutral-500/20 text-neutral-400'}`}>
                    {item.is_active ? 'Active' : 'Paused'}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(item.id, item.is_active)}>
                    {item.is_active ? '⏸️' : '▶️'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => generateNow(item.id)}>⚡</Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>✏️</Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteItem(item.id)}>🗑️</Button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* ── MODAL ── */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Recurring Expense' : 'Add Recurring Expense'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-300 mb-1">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Frequency</label>
              <select
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
                <option value="bimonthly">Bi-monthly</option>
                <option value="annually">Annually</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Paid By</label>
              <select
                value={formData.paidBy}
                onChange={(e) => setFormData({ ...formData, paidBy: e.target.value })}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Start Date</label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">End Date (optional)</label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-300 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows="2"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                placeholder="Optional notes..."
              />
            </div>
          </div>

          {/* ── Split Section ── */}
          <div className="border-t border-white/5 pt-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-semibold text-white">Split this recurring expense</div>
                <div className="text-xs text-neutral-400">Auto-split every generated instance</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={splitEnabled}
                  onChange={(e) => {
                    setSplitEnabled(e.target.checked);
                    if (e.target.checked) {
                      const amount = parseFloat(formData.amount) || 0;
                      const payerId = formData.paidBy || user?.id;
                      recalculateSplits(amount, payerId);
                    } else {
                      setSplitConfig([]);
                    }
                  }}
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:ring-2 peer-focus:ring-olive-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-olive-600"></div>
              </label>
            </div>

            {splitEnabled && (
              <div className="mt-4 space-y-4">
                {/* Split type tabs */}
                <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                  {['equal', 'percentage', 'fixed'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSplitType(type)}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-medium transition-all ${
                        splitType === type
                          ? 'bg-olive-600 text-white shadow-lg'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {type === 'equal' ? 'Equal Split' : type === 'percentage' ? 'By %' : 'Fixed ₱'}
                    </button>
                  ))}
                </div>

                {/* Member rows */}
                {splitConfig.length === 0 ? (
                  <div className="text-neutral-400 text-sm">No other members to split with.</div>
                ) : (
                  <div className="space-y-2">
                    {splitConfig.map((s) => {
                      const member = members.find(m => m.id === s.profile_id);
                      if (!member) return null;
                      const val = splitType === 'percentage' ? (s.percentage || 0) : (s.amount || 0);

                      return (
                        <div key={s.profile_id} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-olive-700 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                            {member.full_name[0].toUpperCase()}
                          </div>
                          <span className="text-sm flex-1">{member.full_name}</span>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              step={splitType === 'percentage' ? '1' : '0.01'}
                              value={val}
                              onChange={(e) => updateSplitAmount(s.profile_id, e.target.value)}
                              className={`w-24 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-right text-sm focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white ${
                                splitType === 'equal' ? 'opacity-60 cursor-not-allowed' : ''
                              }`}
                              disabled={splitType === 'equal'}
                            />
                            {splitType === 'percentage' && (
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">%</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Summary */}
                {splitConfig.length > 0 && (
                  <div className="bg-white/5 rounded-lg p-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Expense amount</span>
                      <span className="font-mono">{formatPHP(parseFloat(formData.amount) || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Total assigned</span>
                      <span className={`font-mono ${isSplitBalanced() ? 'text-olive-400' : 'text-rust-400'}`}>
                        {splitType === 'percentage'
                          ? `${getSplitTotal().toFixed(0)}%`
                          : formatPHP(getTotalAssigned())}
                      </span>
                    </div>
                    {!isSplitBalanced() && (
                      <div className="flex justify-between text-rust-400 text-xs">
                        <span>Unassigned</span>
                        <span>
                          {splitType === 'percentage'
                            ? `${(100 - getSplitTotal()).toFixed(0)}%`
                            : formatPHP((parseFloat(formData.amount) || 0) - getTotalAssigned())}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-neutral-400 border-l-2 border-olive-500 pl-3">
                  💡 Splits are saved as a template. Each time you tap ⚡ Generate, the expense is created
                  and the split amounts are automatically recorded in the <span className="text-olive-400">Splits</span> page.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">{editingId ? 'Update' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
}