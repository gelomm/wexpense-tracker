import { useEffect, useState } from 'react';
import { supabase, formatDate } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/UI/Button';
import { Card } from '../components/UI/Card';
import { Modal } from '../components/UI/Modal';
import { Spinner } from '../components/UI/Spinner';
import { motion } from 'framer-motion';

export default function Reminders({ showToast }) {
  const { user } = useAuth();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    message: '',
    remindAt: '',
    type: 'in_app',
    expenseId: '',
  });
  const [expenses, setExpenses] = useState([]);

  useEffect(() => {
    if (user?.id) {
      loadReminders();
      loadExpenses();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadReminders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reminders')
        .select('*, expense:expenses(title, amount, due_date)')
        .eq('profile_id', user.id)
        .order('remind_at', { ascending: false });

      if (error) throw error;
      setReminders(data || []);
    } catch (err) {
      console.error('Error loading reminders:', err);
      showToast('Failed to load reminders.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadExpenses = async () => {
    const { data } = await supabase
      .from('expenses')
      .select('id, title')
      .eq('household_id', user.id) // Note: we need household_id from profile, but we don't have profile here. Use profile from useAuth.
      .limit(50);
    // Actually we need household_id from profile, so we'll adjust.
    // Instead, we'll fetch profile inside or use context.
    // Quick fix: we'll get household_id from the user's profile via a separate call.
    const { data: profile } = await supabase
      .from('profiles')
      .select('household_id')
      .eq('id', user.id)
      .single();
    if (profile?.household_id) {
      const { data: expData } = await supabase
        .from('expenses')
        .select('id, title')
        .eq('household_id', profile.household_id)
        .eq('is_deleted', false)
        .limit(50);
      setExpenses(expData || []);
    }
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

  const markRead = async (id) => {
    await supabase.from('reminders').update({ is_read: true }).eq('id', id);
    loadReminders();
  };

  const deleteReminder = async (id) => {
    if (confirm('Delete this reminder?')) {
      await supabase.from('reminders').delete().eq('id', id);
      loadReminders();
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Reminders</h2>
        <Button onClick={() => setModalOpen(true)}>＋ Add Reminder</Button>
      </div>

      <div className="space-y-3">
        {reminders.length === 0 ? (
          <Card>
            <div className="text-neutral-400 text-center py-8">No reminders yet.</div>
          </Card>
        ) : (
          reminders.map((r) => (
            <Card
              key={r.id}
              className={`p-4 flex items-center justify-between transition-all ${
                !r.is_read ? 'border-olive-500/30 bg-olive-500/5' : ''
              }`}
            >
              <div className="flex items-center gap-4 flex-1">
                <span className="text-2xl">{r.type === 'email' ? '📧' : '🔔'}</span>
                <div className="flex-1">
                  <div className="font-medium">
                    {r.message === '__auto__' ? (
                      <span>
                        Auto-reminder for <span className="text-olive-400">{r.expense?.title || 'expense'}</span>
                      </span>
                    ) : (
                      r.message || 'Reminder'
                    )}
                  </div>
                  <div className="text-xs text-neutral-400 flex gap-3">
                    <span>{formatDate(r.remind_at)}</span>
                    <span className="capitalize">{r.type}</span>
                    {r.expense?.title && <span>· {r.expense.title}</span>}
                    {r.is_sent && <span className="text-olive-400">✓ Sent</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!r.is_read && (
                  <Button size="sm" variant="ghost" onClick={() => markRead(r.id)}>
                    ✓
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => deleteReminder(r.id)}>
                  🗑️
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Add Reminder Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add Reminder">
        <form onSubmit={handleAddReminder} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Message (optional)</label>
            <input
              type="text"
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="e.g. Don't forget to pay rent"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
            />
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
              <option value="in_app">In-App</option>
              <option value="email">Email</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Link to Expense (optional)</label>
            <select
              value={formData.expenseId}
              onChange={(e) => setFormData({ ...formData, expenseId: e.target.value })}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
            >
              <option value="">None</option>
              {expenses.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add Reminder</Button>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
}