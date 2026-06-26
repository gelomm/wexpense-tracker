import { useEffect, useState } from 'react';
import { supabase, formatPHP, formatDate, monthBounds } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useMonthFilter } from '../hooks/useMonthFilter';
import { Button } from '../components/UI/Button';
import { Card } from '../components/UI/Card';
import { Modal } from '../components/UI/Modal';
import { Spinner } from '../components/UI/Spinner';
import { motion } from 'framer-motion';
import { daysLabel, hexToAlpha } from '../lib/utils';
import { syncAutoReminder } from '../lib/reminderHelpers';

export default function Expenses({ showToast }) {
  const { profile, user } = useAuth();
  const { month, handleChange } = useMonthFilter();
  const [expenses, setExpenses]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving]       = useState(false);

  const [formData, setFormData] = useState({
    title: '', amount: '', date: '', dueDate: '',
    category: '', status: 'unpaid', notes: '',
  });

  const [categories, setCategories] = useState([]);
  const [members, setMembers]       = useState([]);

  // ── Split state ──
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitType, setSplitType]       = useState('equal');
  const [splitConfig, setSplitConfig]   = useState([]);

  useEffect(() => {
    if (profile?.household_id) {
      loadExpenses();
      loadCategories();
      loadMembers();
    }
  }, [month, profile]);

  // Recalculate equal/pct splits whenever amount or type changes
  useEffect(() => {
    if (splitEnabled && members.length > 0 && splitType !== 'fixed') {
      recalculateSplits(parseFloat(formData.amount) || 0, user?.id);
    }
  }, [formData.amount, splitType, splitEnabled]);

  // ── Data loaders ──────────────────────────────────────────────────
  const loadExpenses = async () => {
    setLoading(true);
    const { start, end } = monthBounds(month);
    const { data } = await supabase
      .from('expenses')
      .select(`
        *,
        category:categories(*),
        payer:profiles!expenses_paid_by_fkey(id, full_name),
        splits:expense_splits(profile_id, amount, split_type, percentage, is_settled, profile:profiles(id, full_name))
      `)
      .eq('household_id', profile.household_id)
      .gte('expense_date', start)
      .lte('expense_date', end)
      .eq('is_deleted', false)
      .order('expense_date', { ascending: false });
    setExpenses(data || []);
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

  // ── Split helpers ──────────────────────────────────────────────────
  const recalculateSplits = (amount, payerId) => {
    const others = members.filter(m => m.id !== payerId);
    if (others.length === 0) { setSplitConfig([]); return; }

    if (splitType === 'equal') {
      const share = amount > 0 ? Number((amount / (others.length + 1)).toFixed(2)) : 0;
      setSplitConfig(others.map(m => ({ profile_id: m.id, amount: share, percentage: null })));
    } else if (splitType === 'percentage') {
      const pct = Math.round(100 / (others.length + 1));
      setSplitConfig(others.map(m => ({
        profile_id: m.id,
        amount: amount > 0 ? Number((amount * (pct / 100)).toFixed(2)) : 0,
        percentage: pct,
      })));
    } else {
      // fixed — preserve existing values or start at 0
      setSplitConfig(prev => {
        const existingById = Object.fromEntries(prev.map(s => [s.profile_id, s]));
        return others.map(m => existingById[m.id] ?? { profile_id: m.id, amount: 0, percentage: null });
      });
    }
  };

  const updateSplitAmount = (profileId, value) => {
    const num = parseFloat(value) || 0;
    setSplitConfig(prev => prev.map(s => {
      if (s.profile_id !== profileId) return s;
      if (splitType === 'percentage') {
        const amt = parseFloat(formData.amount) || 0;
        return { ...s, percentage: num, amount: amt > 0 ? Number((amt * (num / 100)).toFixed(2)) : 0 };
      }
      return { ...s, amount: num, percentage: null };
    }));
  };

  const getTotalAssigned = () => splitConfig.reduce((sum, s) => sum + (s.amount || 0), 0);
  const isSplitBalanced = () => {
    const total = parseFloat(formData.amount) || 0;
    if (total === 0) return true;
    if (splitType === 'percentage') {
      return Math.abs(splitConfig.reduce((s, x) => s + (x.percentage || 0), 0) - 100) < 0.01;
    }
    return Math.abs(getTotalAssigned() - total) < 0.01;
  };

  // ── Modal open helpers ─────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setFormData({
      title: '', amount: '',
      date: new Date().toISOString().split('T')[0],
      dueDate: '', category: '', status: 'unpaid', notes: '',
    });
    setSplitEnabled(false);
    setSplitType('equal');
    setSplitConfig([]);
    setModalOpen(true);
  };

  const openEdit = (exp) => {
    setEditingId(exp.id);
    setFormData({
      title:    exp.title,
      amount:   String(exp.amount),
      date:     exp.expense_date,
      dueDate:  exp.due_date || '',
      category: exp.category_id || '',
      status:   exp.status,
      notes:    exp.notes || '',
    });

    const splits = exp.splits || [];
    if (splits.length > 0) {
      setSplitEnabled(true);
      const type = splits[0]?.split_type || 'equal';
      setSplitType(type);
      setSplitConfig(splits.map(s => ({
        profile_id: s.profile_id,
        amount:     s.amount || 0,
        percentage: s.percentage || null,
      })));
    } else {
      setSplitEnabled(false);
      setSplitType('equal');
      setSplitConfig([]);
    }
    setModalOpen(true);
  };

  // ── Save ──────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(formData.amount);
    if (!formData.title || isNaN(amount) || amount <= 0 || !formData.date) {
      showToast('Title, amount, and date are required.', 'warning');
      return;
    }

    setSaving(true);

    const payload = {
      household_id: profile.household_id,
      title:        formData.title,
      amount,
      expense_date: formData.date,
      due_date:     formData.dueDate || null,
      category_id:  formData.category || null,
      paid_by:      user?.id,
      status:       formData.status,
      notes:        formData.notes || null,
      created_by:   user?.id,
    };

    let expenseId = editingId;

    // ── INSERT or UPDATE ──────────────────────────────────────────────
    if (editingId) {
      const { error } = await supabase.from('expenses').update(payload).eq('id', editingId);
      if (error) {
        showToast('Failed to update: ' + error.message, 'error');
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase.from('expenses').insert(payload).select().single();
      if (error) {
        showToast('Failed to create: ' + error.message, 'error');
        setSaving(false);
        return;
      }
      expenseId = data.id;   // ← now has the real id regardless of add/edit
    }

    // ── Splits ───────────────────────────────────────────────────────
    if (expenseId) {
      if (splitEnabled && splitConfig.length > 0) {
        await supabase.from('expense_splits').delete().eq('expense_id', expenseId);
        const splitRows = splitConfig
          .filter(s => (s.amount || 0) > 0.01)
          .map(s => ({
            expense_id: expenseId,
            profile_id: s.profile_id,
            split_type: splitType,
            amount:     s.amount || 0,
            percentage: s.percentage || null,
            is_settled: false,
          }));
        if (splitRows.length > 0) await supabase.from('expense_splits').insert(splitRows);
      } else if (!splitEnabled && editingId) {
        // Split was toggled off during edit — clear any existing splits
        await supabase.from('expense_splits').delete().eq('expense_id', expenseId);
      }

      // ── Auto-reminder (AFTER we have a valid expenseId) ───────────
      await syncAutoReminder(expenseId, formData.dueDate || null, user.id);
    }

    showToast(editingId ? 'Expense updated!' : 'Expense added!', 'success');
    setModalOpen(false);
    setSaving(false);
    loadExpenses();
  };

  const handleDelete = async (id) => {
    if (!confirm('Archive this expense?')) return;
    await supabase.from('expenses').update({ is_deleted: true }).eq('id', id);
    showToast('Archived.', 'info');
    loadExpenses();
  };

  const markPaid = async (id) => {
    await supabase.from('expenses').update({ status: 'paid' }).eq('id', id);
    showToast('Marked as paid!', 'success');
    loadExpenses();
  };

  if (loading) return <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>

      {/* ── Header ── */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold">Expenses</h2>
          <select value={month} onChange={handleChange} className="form-select !w-auto">
            {(() => {
              const now = new Date();
              const opts = [];
              for (let i = -12; i <= 2; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
                const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                opts.push({ val, label: d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) });
              }
              return opts.map(m => <option key={m.val} value={m.val}>{m.label}</option>);
            })()}
          </select>
        </div>
        <Button onClick={openAdd}>＋ Add Expense</Button>
      </div>

      {/* ── List ── */}
      <div className="space-y-3">
        {expenses.length === 0 ? (
          <Card>
            <div className="text-neutral-400 text-center py-8">No expenses this month.</div>
          </Card>
        ) : (
          expenses.map((exp) => {
            const splits     = exp.splits || [];
            const hasSplit   = splits.length > 0;
            const splitNames = splits.map(s => s.profile?.full_name || 'Unknown').join(', ');
            return (
              <Card key={exp.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <span className="text-2xl flex-shrink-0">{exp.category?.icon || '📦'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{exp.title}</div>
                    <div className="text-xs text-neutral-400 flex gap-2 flex-wrap">
                      <span>{formatDate(exp.expense_date)}</span>
                      {exp.due_date && <span>· Due: {formatDate(exp.due_date)}</span>}
                      {hasSplit && (
                        <span className="text-olive-400" title={`Split with: ${splitNames}`}>
                          👥 {splits.length} way{splits.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-mono text-sm">{formatPHP(exp.amount)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    exp.status === 'paid'    ? 'bg-olive-500/20 text-olive-400'   :
                    exp.status === 'overdue' ? 'bg-rust-500/20 text-rust-400'     :
                                              'bg-amber-500/20 text-amber-400'
                  }`}>
                    {exp.status}
                  </span>
                  {exp.status !== 'paid' && (
                    <Button size="sm" variant="ghost" onClick={() => markPaid(exp.id)} title="Mark paid">✅</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(exp)}>✏️</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(exp.id)}>🗑️</Button>
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
        title={editingId ? 'Edit Expense' : 'Add Expense'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Title */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-300 mb-1">Title <span className="text-rust-400">*</span></label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="form-input"
                placeholder="e.g. Monthly Rent"
                required
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Amount <span className="text-rust-400">*</span></label>
              <input
                type="number" step="0.01" min="0"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="form-input"
                placeholder="0.00"
                required
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="form-select"
              >
                <option value="">— None —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>

            {/* Expense Date */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Expense Date <span className="text-rust-400">*</span></label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="form-input"
                required
              />
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Due Date <span className="text-neutral-500 text-xs">(optional)</span></label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="form-input"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="form-select"
              >
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-300 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows="2"
                className="form-input resize-none"
                placeholder="Optional notes…"
              />
            </div>
          </div>

          {/* ── Split Section ── */}
          <div className="border-t border-white/5 pt-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-semibold text-white">Split this expense</div>
                <div className="text-xs text-neutral-400">Divide among household members</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={splitEnabled}
                  onChange={(e) => {
                    setSplitEnabled(e.target.checked);
                    if (e.target.checked) {
                      recalculateSplits(parseFloat(formData.amount) || 0, user?.id);
                    } else {
                      setSplitConfig([]);
                    }
                  }}
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:ring-2 peer-focus:ring-olive-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-olive-600"></div>
              </label>
            </div>

            {splitEnabled && (
              <div className="space-y-4">
                {/* Split type tabs */}
                <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                  {['equal', 'percentage', 'fixed'].map((type) => (
                    <button
                      key={type} type="button"
                      onClick={() => setSplitType(type)}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-medium transition-all ${
                        splitType === type ? 'bg-olive-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {type === 'equal' ? 'Equal' : type === 'percentage' ? 'By %' : 'Fixed ₱'}
                    </button>
                  ))}
                </div>

                {splitConfig.length === 0 ? (
                  <p className="text-neutral-400 text-sm">No other members to split with.</p>
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
                          <div className="relative w-28">
                            <input
                              type="number" min="0"
                              step={splitType === 'percentage' ? '1' : '0.01'}
                              value={val}
                              onChange={(e) => updateSplitAmount(s.profile_id, e.target.value)}
                              disabled={splitType === 'equal'}
                              className={`form-input text-right pr-6 py-1.5 ${splitType === 'equal' ? 'opacity-60 cursor-not-allowed' : ''}`}
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400 pointer-events-none">
                              {splitType === 'percentage' ? '%' : '₱'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {splitConfig.length > 0 && (
                  <div className="bg-white/5 rounded-lg p-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Total expense</span>
                      <span className="font-mono">{formatPHP(parseFloat(formData.amount) || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Assigned</span>
                      <span className={`font-mono ${isSplitBalanced() ? 'text-olive-400' : 'text-rust-400'}`}>
                        {splitType === 'percentage'
                          ? `${splitConfig.reduce((s, x) => s + (x.percentage || 0), 0).toFixed(0)}%`
                          : formatPHP(getTotalAssigned())}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Actions ── */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner size="sm" /> : editingId ? 'Update' : 'Add Expense'}
            </Button>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
}