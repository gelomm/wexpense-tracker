import { useEffect, useState } from 'react';
import { supabase, formatDate, formatPHP } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/UI/Button';
import { Card } from '../components/UI/Card';
import { Modal } from '../components/UI/Modal';
import { Spinner } from '../components/UI/Spinner';
import { motion } from 'framer-motion';
import { daysLabel } from '../lib/utils';

export default function Reminders({ showToast }) {
  const { user, profile } = useAuth();
  const [reminders, setReminders] = useState([]);
  const [upcomingExpenses, setUpcomingExpenses] = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
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
  }, [user, profile]);

  const loadReminders = async () => {
    const { data } = await supabase
      .from('reminders')
      .select(`
        *,
        expense:expenses(id, title, amount, due_date),
        recurring:recurring_expenses(id, title)
      `)
      .eq('profile_id', user.id)
      .order('remind_at', { ascending: false });
    setReminders(data || []);
    setLoading(false);
  };

  const loadUpcoming = async () => {
    const hid = profile?.household_id;
    if (!hid) return;
    const { data } = await supabase
      .from('expenses')
      .select('id, title, amount, due_date')
      .eq('household_id', hid)
      .eq('is_deleted', false)
      .neq('status', 'paid')
      .order('due_date', { ascending: true });
    // Filter to next 14 days
    const today = new Date(); today.setHours(0,0,0,0);
    const upcoming = (data || []).filter(e => {
      if (!e.due_date) return false;
      const d = new Date(e.due_date);
      const diff = (d - today) / (1000*60*60*24);
      return diff >= 0 && diff <= 14;
    });
    setUpcomingExpenses(upcoming);
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

  const handleAddReminder = async (e) => {
    e.preventDefault();
    if (!formData.remindAt) {
      showToast('Please set a reminder date/time.', 'warning');
      return;
    }
    const payload = {
      profile_id: user.id,
      remind_at: new Date(formData.remindAt).toISOString(),
      type: formData.type,
      message: formData.message || null,
      expense_id: formData.expenseId || null,
      is_sent: false,
      is_read: false,
    };
    const { error } = await supabase.from('reminders').insert(payload);
    if (error) {
      showToast('Failed to add reminder.', 'error');
    } else {
      showToast('Reminder added!', 'success');
      setModalOpen(false);
      loadReminders();
    }
  };

  const quickSetReminder = (expenseId) => {
    setFormData({
      ...formData,
      expenseId: expenseId,
      remindAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16), // tomorrow
    });
    // Scroll to quick reminder form
    document.getElementById('quick-reminder-section')?.scrollIntoView({ behavior: 'smooth' });
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
        {['all', 'unread', 'email', 'in_app'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-olive-600 text-white shadow-lg'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            {tab === 'all' ? 'All' : tab === 'unread' ? 'Unread' : tab === 'email' ? 'Email' : 'In-App'}
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

            // For auto, compute due date = remind_at + 1 day
            let dueDisplay = '';
            if (isAuto) {
              const due = new Date(r.remind_at);
              due.setDate(due.getDate() + 1);
              const diff = Math.round((due - new Date()) / (1000*60*60*24));
              dueDisplay = daysLabel(diff);
            }

            return (
              <Card
                key={r.id}
                className={`p-4 flex items-center justify-between transition-all ${
                  !r.is_read ? 'border-olive-500/30 bg-olive-500/5' : ''
                }`}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <span className="text-2xl flex-shrink-0">
                    {r.type === 'email' ? '📧' : '🔔'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-2 flex-wrap">
                      {isAuto ? (
                        <span>
                          {dueDisplay ? `Due ${dueDisplay.toLowerCase()}: ` : ''}
                          <span className="text-olive-400">{linkedTitle || 'Expense'}</span>
                        </span>
                      ) : (
                        r.message || 'Reminder'
                      )}
                      {isAuto && <span className="text-xs bg-olive-500/20 text-olive-400 px-2 py-0.5 rounded-full">Auto</span>}
                    </div>
                    <div className="text-xs text-neutral-400 flex gap-3 flex-wrap">
                      <span>{r.type === 'in_app' ? '🔔 In-App' : r.type === 'email' ? '📧 Email' : '📬 Both'}</span>
                      <span>⏰ {formatDate(r.remind_at)}</span>
                      {linkedTitle && <span>📎 {linkedTitle}</span>}
                      {r.is_sent ? (
                        <span className="text-olive-400">✓ Sent</span>
                      ) : isPast ? (
                        <span className="text-amber-400">⏳ Pending</span>
                      ) : (
                        <span className="text-neutral-400">⏳ Scheduled</span>
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

      {/* ── Upcoming Due ── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">📅 Upcoming Due</h3>
          <span className="text-sm text-neutral-400">{upcomingExpenses.length} items</span>
        </div>
        <Card className="p-3">
          {upcomingExpenses.length === 0 ? (
            <div className="text-sm text-neutral-400">Nothing due in the next 14 days.</div>
          ) : (
            <div className="space-y-2">
              {upcomingExpenses.map(e => {
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

      {/* ── Quick Reminder Form ── */}
      <div id="quick-reminder-section">
        <h3 className="text-lg font-semibold mb-3">⚡ Quick Reminder</h3>
        <Card className="p-4">
          <form onSubmit={handleAddReminder} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Expense (optional)</label>
              <select
                value={formData.expenseId}
                onChange={(e) => setFormData({ ...formData, expenseId: e.target.value })}
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
                value={formData.remindAt}
                onChange={(e) => setFormData({ ...formData, remindAt: e.target.value })}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
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
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="e.g. Don't forget to pay rent!"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
              />
            </div>
            <Button type="submit" className="w-full">Set Reminder</Button>
          </form>
        </Card>
      </div>

      {/* ── Add Reminder Modal (full) ── */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add Reminder">
        <form onSubmit={handleAddReminder} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Expense (optional)</label>
            <select
              value={formData.expenseId}
              onChange={(e) => setFormData({ ...formData, expenseId: e.target.value })}
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
              value={formData.remindAt}
              onChange={(e) => setFormData({ ...formData, remindAt: e.target.value })}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
            >
              <option value="in_app">In-App only</option>
              <option value="email">Email only</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Message</label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
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