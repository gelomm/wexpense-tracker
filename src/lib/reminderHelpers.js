import { supabase } from './supabase';

/**
 * Syncs an auto-reminder for an expense.
 * - If dueDate is set → upsert a reminder 1 day before at 09:00
 * - If dueDate is null → delete existing auto-reminder
 * Auto-reminders are identified by message === '__auto__'
 */
export async function syncAutoReminder(expenseId, dueDate, userId) {
  if (!expenseId || !userId) return;

  if (dueDate) {
    // Compute remind_at: due date - 1 day at 09:00 local time
    const due = new Date(dueDate + 'T00:00:00');
    due.setDate(due.getDate() - 1);
    due.setHours(9, 0, 0, 0);
    const remindAt = due.toISOString();

    // Check if an auto-reminder already exists for this expense
    const { data: existing } = await supabase
      .from('reminders')
      .select('id')
      .eq('expense_id', expenseId)
      .eq('message', '__auto__')
      .maybeSingle();

    if (existing) {
      // Update the remind_at and reset sent status
      await supabase
        .from('reminders')
        .update({ remind_at: remindAt, is_sent: false })
        .eq('id', existing.id);
    } else {
      // Create a new auto-reminder
      await supabase.from('reminders').insert({
        expense_id: expenseId,
        profile_id: userId,
        remind_at: remindAt,
        type: 'email',
        message: '__auto__',
        is_sent: false,
        is_read: false,
      });
    }
  } else {
    // Due date was removed — delete any auto-reminder
    await supabase
      .from('reminders')
      .delete()
      .eq('expense_id', expenseId)
      .eq('message', '__auto__');
  }
}

/**
 * Syncs an auto-reminder for a recurring expense template.
 * Uses recurring_expense_id instead of expense_id.
 */
export async function syncRecurringAutoReminder(recurringId, startDate, userId, isEdit = false) {
  if (!recurringId || !userId) return;

  if (!startDate) {
    if (isEdit) {
      await supabase.from('reminders')
        .delete()
        .eq('recurring_expense_id', recurringId)
        .eq('message', '__auto__');
    }
    return;
  }

  const due = new Date(startDate + 'T00:00:00');
  due.setDate(due.getDate() - 1);
  due.setHours(9, 0, 0, 0);
  const remindAt = due.toISOString();

  if (isEdit) {
    // Check if exists
    const { data: existing } = await supabase
      .from('reminders')
      .select('id')
      .eq('recurring_expense_id', recurringId)
      .eq('message', '__auto__')
      .maybeSingle();

    if (existing) {
      await supabase
        .from('reminders')
        .update({ remind_at: remindAt, is_sent: false })
        .eq('id', existing.id);
      return;
    }
  }

  // Insert new auto-reminder for recurring template (reminds about the next occurrence)
  await supabase.from('reminders').insert({
    recurring_expense_id: recurringId,
    profile_id: userId,
    remind_at: remindAt,
    type: 'email',
    message: '__auto__',
    is_sent: false,
    is_read: false,
  });
}