import { useEffect, useState } from 'react';
import { supabase, formatDate, formatPHP, monthBounds } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useMonthFilter } from '../hooks/useMonthFilter';
import { Button } from '../components/UI/Button';
import { Card } from '../components/UI/Card';
import { Modal } from '../components/UI/Modal';
import { Spinner } from '../components/UI/Spinner';
import { motion } from 'framer-motion';
import { daysLabel } from '../lib/utils';

export default function Reminders({ showToast }) {
  const { user, profile } = useAuth();
  const { month } = useMonthFilter();
  const [reminders, setReminders] = useState([]);
  const [upcomingExpenses, setUpcomingExpenses] = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);

  // Quick reminder form
  const [quickForm, setQuickForm] = useState({
    expenseId: '',
    remindAt: '',
    type: 'in_app',
    message: '',
  });

  // ── Load data ──
  useEffect(() => {
    if (user?.id && profile?.household_id) {
      loadReminders();
      loadUpcoming();
      loadExpenses();
    } else {
      setLoading(false);
    }
  }, [user, profile, month]);

  const loadReminders = async () => {
    const { data } = await supabase
      .from('reminders')
      .select(`
        *,
        expense:expenses(id, title, amount, due_date),
        recurring:recurring_expenses(id, title)
      `)
      .eq('profile_id', user.id)
      .order('remind_at', { ascending: true });
    setReminders(data || []);
    setLoading(false);
  };

  const loadUpcoming = async () => {
    const hid = profile?.household_id;
    if (!hid) return;
    const { start, end } = monthBounds(month);
    const { data } = await supabase
      .from('expenses')
      .select('id, title, amount, due_date')
      .eq('household_id', hid)
      .eq('is_deleted', false)
      .neq('status', 'paid')
      .gte('due_date', start)
      .lte('due_date', end)
      .order('due_date', { ascending: true })
      .limit(50);
    setUpcomingExpenses(data || []);
  };

  const loadExpenses = async () => {
    const hid = profile?.household_id;
    if (!hid) return;
    const { data } = await supabase
      .from('expenses')
      .select('id, title')
      .eq('household_id', hid)
      .eq('is_deleted', false)
      .order('title');
    setAllExpenses(data || []);
  };

  // ── CRUD ──
  const markRead = async (id) => {
    await supabase.from('reminders').update({ is_read: true }).eq('id', id);
    loadReminders();
    showToast('Marked as read.', 'success');
  };

  const deleteReminder = async (id) => {
    if (confirm('Delete this reminder?')) {
      await supabase.from('reminders').delete().eq('id', id);
      showToast('Reminder deleted.', 'info');
      loadReminders();
    }
  };

  const markAllRead = async () => {
    await supabase
      .from('reminders')
      .update({ is_read: true })
      .eq('profile_id', user.id)
      .eq('is_read', false);
    showToast('All marked as read.', 'success');
    loadReminders();
  };

  const handleQuickReminder = async (e) => {
    e.preventDefault();
    if (!quickForm.remindAt) {
      showToast('Please set a reminder date/time.', 'warning');
      return;
    }
    const payload = {
      profile_id: user.id,
      remind_at: new Date(quickForm.remindAt).toISOString(),
      type: quickForm.type,
      message: quickForm.message || null,
      expense_id: quickForm.expenseId || null,
      is_sent: false,
      is_read: false,
    };
    const { error } = await supabase.from('reminders').insert(payload);
    if (error) {
      showToast('Failed to add reminder.', 'error');
    } else {
      showToast('Reminder set!', 'success');
      setQuickForm({ ...quickForm, message: '' });
      loadReminders();
    }
  };

  const quickSetReminder = (expenseId) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    setQuickForm({
      ...quickForm,
      expenseId: expenseId,
      remindAt: tomorrow.toISOString().slice(0, 16),
    });
    document.getElementById('quick-reminder-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ── Get type icon ──
  const getTypeIcon = (type) => {
    return type === 'email' ? '📧' : type === 'both' ? '📬' : '🔔';
  };

  const getTypeLabel = (type) => {
    return type === 'email' ? 'Email' : type === 'both' ? 'Both' : 'In-App';
  };

  // ── Filter ──
  const filtered = reminders.filter(r => {
    if (activeTab === 'unread') return !r.is_read;
    if (activeTab === 'email') return r.type === 'email' || r.type === 'both';
    if (activeTab === 'in_app') return r.type === 'in_app' || r.type === 'both';
    return true;
  });

  // ── Render ──
  if (loading) return <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
        <h2 className="text-2xl font-bold">Reminders</h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={markAllRead}>Mark all read</Button>
          <Button onClick={() => setModalOpen(true)}>＋ Add Reminder</Button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 mb-6 w-fit">
        {[
          { id: 'all', label: 'All' },
          { id: 'unread', label: 'Unread' },
          { id: 'email', label: 'Email' },
          { id: 'in_app', label: 'In-App' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-olive-600 text-white shadow-lg'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Reminder list ── */}
      <div className="space-y-3 mb-8">
        {filtered.length === 0 ? (
          <Card>
            <div className="text-neutral-400 text-center py-8">No reminders.</div>
          </Card>
        ) : (
          filtered.map((r) => {
            const isAuto = r.message === '__auto__';
            const linkedTitle = r.expense?.title || r.recurring?.title || null;
            const isPast = new Date(r.remind_at) < new Date();

            // For auto reminders, compute due date = remind_at + 1 day
            let dueDisplay = '';
            let isOverdue = false;
            if (isAuto && linkedTitle) {
              const due = new Date(r.remind_at);
              due.setDate(due.getDate() + 1);
              due.setHours(0, 0, 0, 0);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
              if (diffDays < 0) {
                isOverdue = true;
                dueDisplay = `Overdue: ${linkedTitle} (${Math.abs(diffDays)}d ago)`;
              } else if (diffDays === 0) {
                dueDisplay = `Due today: ${linkedTitle}`;
              } else if (diffDays === 1) {
                dueDisplay = `Due tomorrow: ${linkedTitle}`;
              } else {
                dueDisplay = `Due in ${diffDays} days: ${linkedTitle}`;
              }
            }

            const displayTitle = isAuto
              ? dueDisplay || `Reminder: ${linkedTitle || 'expense'}`
              : r.message || (linkedTitle ? `Reminder: ${linkedTitle}` : 'Expense Reminder');

            return (
              <Card
                key={r.id}
                className={`p-4 flex items-center justify-between transition-all ${
                  !r.is_read ? 'border-olive-500/30 bg-olive-500/5' : ''
                }`}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <span className="text-2xl flex-shrink-0">{getTypeIcon(r.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-2 flex-wrap">
                      <span className={isAuto ? 'text-olive-300' : ''}>
                        {displayTitle}
                      </span>
                      {isAuto && (
                        <span className="text-xs bg-olive-500/20 text-olive-400 px-2 py-0.5 rounded-full">Auto</span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-400 flex gap-3 flex-wrap mt-0.5">
                      <span>{getTypeIcon(r.type)} {getTypeLabel(r.type)}</span>
                      <span>⏰ {formatDate(r.remind_at)}</span>
                      {linkedTitle && <span>📎 {linkedTitle}</span>}
                      {r.is_sent ? (
                        <span className="text-olive-400">✓ Sent</span>
                      ) : isPast ? (
                        <span className="text-amber-400">⏳ Pending</span>
                      ) : (
                        <span className="text-neutral-400">Scheduled</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!r.is_read && (
                    <Button size="sm" variant="ghost" onClick={() => markRead(r.id)} title="Mark read">
                      ✓
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => deleteReminder(r.id)} title="Delete">
                    🗑️
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* ── Two-column layout for Upcoming + Quick Reminder ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Due */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">📅 Upcoming Due</h3>
            <span className="text-sm text-neutral-400">{upcomingExpenses.length} items</span>
          </div>
          <Card className="p-3">
            {upcomingExpenses.length === 0 ? (
              <div className="text-sm text-neutral-400">Nothing due in the next 14 days.</div>
            ) : (
              <div className="space-y-2">
                {upcomingExpenses.slice(0, 10).map(e => {
                  const days = Math.round((new Date(e.due_date) - new Date()) / (1000*60*60*24));
                  const urgency = days === 0 ? 'text-rust-400' : days <= 3 ? 'text-amber-400' : 'text-neutral-400';
                  return (
                    <div key={e.id} className="flex items-center justify-between border-b border-white/5 pb-2">
                      <div>
                        <div className="text-sm font-medium">{e.title}</div>
                        <div className={`text-xs ${urgency}`}>{daysLabel(days)}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm">{formatPHP(e.amount)}</span>
                        <Button size="sm" variant="ghost" onClick={() => quickSetReminder(e.id)}>🔔</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Quick Reminder Form */}
        <div id="quick-reminder-section">
          <h3 className="text-lg font-semibold mb-3">⚡ Quick Reminder</h3>
          <Card className="p-4">
            <form onSubmit={handleQuickReminder} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Expense (optional)</label>
                <select
                  value={quickForm.expenseId}
                  onChange={(e) => setQuickForm({ ...quickForm, expenseId: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                >
                  <option value="">— No linked expense —</option>
                  {allExpenses.map(e => (
                    <option key={e.id} value={e.id}>{e.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Remind at</label>
                <input
                  type="datetime-local"
                  value={quickForm.remindAt}
                  onChange={(e) => setQuickForm({ ...quickForm, remindAt: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Type</label>
                <select
                  value={quickForm.type}
                  onChange={(e) => setQuickForm({ ...quickForm, type: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                >
                  <option value="in_app">In-App only</option>
                  <option value="email">Email only</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Custom message (optional)</label>
                <input
                  type="text"
                  value={quickForm.message}
                  onChange={(e) => setQuickForm({ ...quickForm, message: e.target.value })}
                  placeholder="e.g. Don't forget to pay rent!"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                />
              </div>
              <Button type="submit" className="w-full">Set Reminder</Button>
            </form>
          </Card>
        </div>
      </div>

      {/* ── Full Add Reminder Modal ── */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add Reminder">
        <form onSubmit={handleQuickReminder} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Link to Expense (optional)</label>
            <select
              value={quickForm.expenseId}
              onChange={(e) => setQuickForm({ ...quickForm, expenseId: e.target.value })}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
            >
              <option value="">None</option>
              {allExpenses.map(e => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Remind At</label>
            <input
              type="datetime-local"
              value={quickForm.remindAt}
              onChange={(e) => setQuickForm({ ...quickForm, remindAt: e.target.value })}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Reminder Type</label>
            <select
              value={quickForm.type}
              onChange={(e) => setQuickForm({ ...quickForm, type: e.target.value })}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
            >
              <option value="in_app">In-App notification</option>
              <option value="email">Email notification</option>
              <option value="both">Both In-App and Email</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Message</label>
            <textarea
              value={quickForm.message}
              onChange={(e) => setQuickForm({ ...quickForm, message: e.target.value })}
              rows="3"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
              placeholder="Custom reminder message…"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Reminder</Button>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
}