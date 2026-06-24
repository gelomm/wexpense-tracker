import { useEffect, useState } from 'react';
import { supabase, formatPHP, formatDate, monthBounds } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useMonthFilter } from '../hooks/useMonthFilter';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Spinner } from '../components/UI/Spinner';
import { motion } from 'framer-motion';
import { frequencyLabel, escHtml } from '../lib/utils';

// ── Frequency → monthly multiplier ──────────────────────────
const freqToMonthly = {
  daily: 30,
  weekly: 4.33,
  biweekly: 2.17,
  monthly: 1,
  bimonthly: 0.5,
  annually: 1 / 12,
};

export default function Splits({ showToast }) {
  const { user, profile } = useAuth();
  const { month, handleChange } = useMonthFilter();
  const [loading, setLoading] = useState(true);
  const [allMembers, setAllMembers] = useState([]);
  const [allSplits, setAllSplits] = useState([]);
  const [settledHistory, setSettledHistory] = useState([]);
  const [allRecurring, setAllRecurring] = useState([]);
  const [allOneTime, setAllOneTime] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState(null);

  useEffect(() => {
    if (profile?.household_id) {
      loadAll();
    }
  }, [month, profile]);

  const loadAll = async () => {
    setLoading(true);
    const hid = profile.household_id;
    const { start, end } = monthBounds(month);

    try {
      // Load members
      const { data: members } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('household_id', hid);
      setAllMembers(members || []);

      // Load unsettled splits with expense details
      const { data: splits } = await supabase
        .from('expense_splits')
        .select(`
          *,
          expense:expenses(id, title, amount, expense_date, paid_by, household_id),
          profile:profiles(id, full_name)
        `)
        .eq('is_settled', false);

      const filteredSplits = (splits || []).filter(
        s => s.expense?.household_id === hid &&
             s.expense?.expense_date >= start &&
             s.expense?.expense_date <= end
      );
      setAllSplits(filteredSplits);

      // Load settlement history
      const { data: history } = await supabase
        .from('expense_splits')
        .select(`
          *,
          expense:expenses(title, paid_by, household_id),
          profile:profiles(id, full_name)
        `)
        .eq('is_settled', true)
        .order('settled_at', { ascending: false })
        .limit(20);

      const filteredHistory = (history || []).filter(
        s => s.expense?.household_id === hid
      );
      setSettledHistory(filteredHistory);

      // Load forecast data
      await loadForecastData(hid, start, end);

      // Auto-select first member (or self if owner)
      if (members && members.length > 0) {
        const self = members.find(m => m.id === user.id);
        if (self && profile?.role === 'owner') {
          setSelectedMemberId(user.id);
        } else {
          const other = members.find(m => m.id !== user.id);
          setSelectedMemberId(other?.id || user.id);
        }
      }
    } catch (err) {
      console.error('Error loading splits data:', err);
      showToast('Failed to load splits data.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadForecastData = async (hid, start, end) => {
    // Recurring expenses (active) — split_config is a JSONB array of other members' shares
    const { data: recData } = await supabase
      .from('recurring_expenses')
      .select('id, title, amount, frequency, paid_by, split_config, category:categories(icon)')
      .eq('household_id', hid)
      .eq('is_active', true);
    setAllRecurring(recData || []);

    // One-time unpaid expenses this month with their split rows
    const { data: expData } = await supabase
      .from('expenses')
      .select(`
        id, title, amount, due_date, paid_by, expense_date,
        splits:expense_splits(profile_id, amount)
      `)
      .eq('household_id', hid)
      .eq('is_deleted', false)
      .neq('status', 'paid')
      .gte('expense_date', start)
      .lte('expense_date', end);
    setAllOneTime(expData || []);
  };

  // ── Helper to settle a single split ──
  const settleSingle = async (splitId) => {
    const { error } = await supabase
      .from('expense_splits')
      .update({ is_settled: true, settled_at: new Date().toISOString() })
      .eq('id', splitId);
    if (error) {
      showToast('Failed to settle.', 'error');
    } else {
      showToast('Marked as settled!', 'success');
      loadAll();
    }
  };

  // ── Helper to settle all splits with a member ──
  const settleAll = async (memberId) => {
    if (!confirm('Mark all expenses with this member as settled?')) return;
    const splitIds = allSplits
      .filter(
        s =>
          s.profile_id === memberId ||
          (s.profile_id === user.id && s.expense?.paid_by === memberId)
      )
      .map(s => s.id);
    if (splitIds.length === 0) return;
    const { error } = await supabase
      .from('expense_splits')
      .update({ is_settled: true, settled_at: new Date().toISOString() })
      .in('id', splitIds);
    if (error) {
      showToast('Failed to settle.', 'error');
    } else {
      showToast('All settled up! 🎉', 'success');
      loadAll();
    }
  };

  // ── Render functions ──

  // Net Summary
  const renderNetSummary = () => {
    const balances = {};
    for (const m of allMembers) {
      if (m.id !== user.id) {
        balances[m.id] = { name: m.full_name, owed: 0 };
      }
    }
    for (const s of allSplits) {
      const mid = s.profile_id;
      if (!balances[mid]) continue;
      if (s.expense?.paid_by === user.id) {
        balances[mid].owed += Number(s.amount ?? 0);
      }
    }
    const totalOwed = Object.values(balances).reduce((s, b) => s + b.owed, 0);
    const totalOwe = allSplits
      .filter(s => s.profile_id === user.id)
      .reduce((s, x) => s + Number(x.amount ?? 0), 0);

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white/5 rounded-xl p-4 mb-6">
        <div>
          <div className="text-xs text-neutral-400 uppercase tracking-wider">Others Owe You</div>
          <div className="text-2xl font-mono font-bold text-olive-400">{formatPHP(totalOwed)}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-400 uppercase tracking-wider">You Owe Others</div>
          <div className="text-2xl font-mono font-bold text-rust-400">{formatPHP(totalOwe)}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-400 uppercase tracking-wider">Net Balance</div>
          <div className={`text-2xl font-mono font-bold ${totalOwed - totalOwe >= 0 ? 'text-olive-400' : 'text-rust-400'}`}>
            {formatPHP(Math.abs(totalOwed - totalOwe))}
            <span className="text-sm font-sans font-normal text-neutral-400 ml-2">
              {totalOwed - totalOwe >= 0 ? 'in your favor' : 'you owe'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Member List
  const renderMemberList = () => {
    const selfMember = allMembers.find(m => m.id === user.id);
    const otherMembers = allMembers.filter(m => m.id !== user.id);

    if (allMembers.length === 0) {
      return (
        <div className="text-neutral-400 text-sm py-4">No members yet.</div>
      );
    }

    const getMemberBalance = (memberId) => {
      const theyOweMe = allSplits
        .filter(s => s.profile_id === memberId && s.expense?.paid_by === user.id)
        .reduce((s, x) => s + Number(x.amount ?? 0), 0);
      const iOweThem = allSplits
        .filter(s => s.profile_id === user.id && s.expense?.paid_by === memberId)
        .reduce((s, x) => s + Number(x.amount ?? 0), 0);
      return theyOweMe - iOweThem;
    };

    const getSharedCount = (memberId) => {
      return allSplits.filter(
        s => s.profile_id === memberId || s.expense?.paid_by === memberId
      ).length;
    };

    const memberItems = [];

    // Self (if owner)
    if (profile?.role === 'owner' && selfMember) {
      const net = getMemberBalance(user.id);
      const pillClass = net > 0.01 ? 'bg-olive-500/20 text-olive-400' : net < -0.01 ? 'bg-rust-500/20 text-rust-400' : 'bg-neutral-500/20 text-neutral-400';
      const pillText = net > 0.01 ? `+${formatPHP(net)}` : net < -0.01 ? formatPHP(net) : 'Settled';
      memberItems.push(
        <div
          key={user.id}
          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
            selectedMemberId === user.id
              ? 'border-olive-500/50 bg-olive-500/10'
              : 'border-white/5 hover:border-white/20'
          }`}
          onClick={() => setSelectedMemberId(user.id)}
        >
          <div className="w-10 h-10 rounded-full bg-olive-700 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {selfMember.full_name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium flex items-center gap-2">
              <span className="truncate">{selfMember.full_name}</span>
              <span className="text-xs bg-olive-600/30 text-olive-300 px-2 py-0.5 rounded-full">You</span>
            </div>
            <div className="text-xs text-neutral-400">Your own balance</div>
          </div>
          <span className={`text-xs font-mono font-bold px-3 py-1 rounded-full ${pillClass}`}>{pillText}</span>
        </div>
      );
    }

    // Other members
    for (const m of otherMembers) {
      const net = getMemberBalance(m.id);
      const pillClass = net > 0.01 ? 'bg-olive-500/20 text-olive-400' : net < -0.01 ? 'bg-rust-500/20 text-rust-400' : 'bg-neutral-500/20 text-neutral-400';
      const pillText = net > 0.01 ? `+${formatPHP(net)}` : net < -0.01 ? formatPHP(net) : 'Settled';
      const shared = getSharedCount(m.id);
      memberItems.push(
        <div
          key={m.id}
          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
            selectedMemberId === m.id
              ? 'border-olive-500/50 bg-olive-500/10'
              : 'border-white/5 hover:border-white/20'
          }`}
          onClick={() => setSelectedMemberId(m.id)}
        >
          <div className="w-10 h-10 rounded-full bg-olive-700 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {m.full_name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{m.full_name}</div>
            <div className="text-xs text-neutral-400">{shared} shared</div>
          </div>
          <span className={`text-xs font-mono font-bold px-3 py-1 rounded-full ${pillClass}`}>{pillText}</span>
        </div>
      );
    }

    return <div className="space-y-2">{memberItems}</div>;
  };

  // Detail Panel
  const renderDetailPanel = () => {
    if (!selectedMemberId) {
      return (
        <div className="text-center py-12 text-neutral-400">
          <div className="text-4xl mb-3">👥</div>
          <div className="text-lg font-medium">Select a member</div>
          <div className="text-sm">Click a household member on the left to see your shared expenses.</div>
        </div>
      );
    }

    const member = allMembers.find(m => m.id === selectedMemberId);
    if (!member) return null;

    const theyOweMe = allSplits.filter(
      s => s.profile_id === member.id && s.expense?.paid_by === user.id
    );
    const iOweThem = allSplits.filter(
      s => s.profile_id === user.id && s.expense?.paid_by === member.id
    );

    const totalTheyOwe = theyOweMe.reduce((s, x) => s + Number(x.amount ?? 0), 0);
    const totalIOwe = iOweThem.reduce((s, x) => s + Number(x.amount ?? 0), 0);
    const net = totalTheyOwe - totalIOwe;

    const isSelf = member.id === user.id;

    if (isSelf) {
      // Self detail (owner only)
      const iAmPayer = allSplits.filter(
        s => s.expense?.paid_by === user.id && s.profile_id !== user.id
      );
      const totalOwedToMe = iAmPayer.reduce((s, x) => s + Number(x.amount ?? 0), 0);
      const iOwe = allSplits.filter(s => s.profile_id === user.id);
      const totalIOweSelf = iOwe.reduce((s, x) => s + Number(x.amount ?? 0), 0);
      const netSelf = totalOwedToMe - totalIOweSelf;

      const byMember = {};
      for (const s of iAmPayer) {
        const mid = s.profile_id;
        if (!byMember[mid]) {
          const m = allMembers.find(x => x.id === mid);
          byMember[mid] = { name: m?.full_name ?? 'Member', total: 0 };
        }
        byMember[mid].total += Number(s.amount ?? 0);
      }

      const byPayer = {};
      for (const s of iOwe) {
        const pid = s.expense?.paid_by;
        if (!pid) continue;
        if (!byPayer[pid]) {
          const m = allMembers.find(x => x.id === pid);
          byPayer[pid] = { name: m?.full_name ?? 'Member', total: 0 };
        }
        byPayer[pid].total += Number(s.amount ?? 0);
      }

      return (
        <div className="space-y-4">
          <div className="flex items-center gap-4 border-b border-white/5 pb-4">
            <div className="w-14 h-14 rounded-full bg-olive-700 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
              {member.full_name[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="text-xl font-bold flex items-center gap-2">
                {member.full_name}
                <span className="text-xs bg-olive-600/30 text-olive-300 px-2 py-0.5 rounded-full">You</span>
              </div>
              <div className="text-sm text-neutral-400">Your balance overview this month</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-neutral-400">{netSelf >= 0 ? 'Net in your favor' : 'Net you owe'}</div>
              <div className={`text-2xl font-mono font-bold ${netSelf >= 0 ? 'text-olive-400' : 'text-rust-400'}`}>
                {formatPHP(Math.abs(netSelf))}
              </div>
            </div>
          </div>

          {Object.keys(byMember).length > 0 && (
            <>
              <div className="text-sm font-semibold text-olive-400">💚 Others owe you</div>
              {Object.entries(byMember).map(([mid, b]) => (
                <div key={mid} className="flex justify-between items-center py-1 border-b border-white/5 text-sm">
                  <span>{b.name}</span>
                  <span className="font-mono text-olive-400">{formatPHP(b.total)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center bg-olive-500/10 p-2 rounded-lg text-sm">
                <span className="font-semibold text-olive-400">Total owed to you</span>
                <span className="font-mono font-bold text-olive-400">{formatPHP(totalOwedToMe)}</span>
              </div>
            </>
          )}

          {Object.keys(byPayer).length > 0 && (
            <>
              <div className="text-sm font-semibold text-rust-400 mt-4">❤️ You owe others</div>
              {Object.entries(byPayer).map(([pid, b]) => (
                <div key={pid} className="flex justify-between items-center py-1 border-b border-white/5 text-sm">
                  <span>{b.name}</span>
                  <span className="font-mono text-rust-400">{formatPHP(b.total)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center bg-rust-500/10 p-2 rounded-lg text-sm">
                <span className="font-semibold text-rust-400">Total you owe</span>
                <span className="font-mono font-bold text-rust-400">{formatPHP(totalIOweSelf)}</span>
              </div>
            </>
          )}

          {Object.keys(byMember).length === 0 && Object.keys(byPayer).length === 0 && (
            <div className="text-center py-8 text-neutral-400">
              <div className="text-4xl mb-2">🤝</div>
              <div className="text-lg font-medium">All settled up!</div>
              <div className="text-sm">No outstanding balances for you this month.</div>
            </div>
          )}
        </div>
      );
    }

    // Other member detail
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4 border-b border-white/5 pb-4">
          <div className="w-14 h-14 rounded-full bg-olive-700 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
            {member.full_name[0].toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="text-xl font-bold">{member.full_name}</div>
            <div className="text-sm text-neutral-400">{theyOweMe.length + iOweThem.length} unsettled expenses</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-neutral-400">{net >= 0 ? 'They owe you' : 'You owe them'}</div>
            <div className={`text-2xl font-mono font-bold ${net >= 0 ? 'text-olive-400' : 'text-rust-400'}`}>
              {formatPHP(Math.abs(net))}
            </div>
          </div>
        </div>

        {theyOweMe.length > 0 && (
          <>
            <div className="text-sm font-semibold text-olive-400">💚 {member.full_name} owes you</div>
            {theyOweMe.map(s => (
              <div key={s.id} className="flex justify-between items-center py-2 border-b border-white/5 text-sm">
                <div>
                  <div className="font-medium">{s.expense?.title}</div>
                  <div className="text-xs text-neutral-400">{formatDate(s.expense?.expense_date)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-olive-400">{formatPHP(s.amount)}</span>
                  <Button size="sm" variant="ghost" onClick={() => settleSingle(s.id)}>Settle</Button>
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center bg-olive-500/10 p-2 rounded-lg text-sm">
              <span className="font-semibold text-olive-400">Subtotal they owe</span>
              <span className="font-mono font-bold text-olive-400">{formatPHP(totalTheyOwe)}</span>
            </div>
          </>
        )}

        {iOweThem.length > 0 && (
          <>
            <div className="text-sm font-semibold text-rust-400 mt-4">❤️ You owe {member.full_name}</div>
            {iOweThem.map(s => (
              <div key={s.id} className="flex justify-between items-center py-2 border-b border-white/5 text-sm">
                <div>
                  <div className="font-medium">{s.expense?.title}</div>
                  <div className="text-xs text-neutral-400">{formatDate(s.expense?.expense_date)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-rust-400">{formatPHP(s.amount)}</span>
                  <Button size="sm" variant="ghost" onClick={() => settleSingle(s.id)}>Settle</Button>
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center bg-rust-500/10 p-2 rounded-lg text-sm">
              <span className="font-semibold text-rust-400">Subtotal you owe</span>
              <span className="font-mono font-bold text-rust-400">{formatPHP(totalIOwe)}</span>
            </div>
          </>
        )}

        {theyOweMe.length === 0 && iOweThem.length === 0 && (
          <div className="text-center py-8 text-neutral-400">
            <div className="text-4xl mb-2">🤝</div>
            <div className="text-lg font-medium">All settled up!</div>
            <div className="text-sm">No outstanding balances with {member.full_name}.</div>
          </div>
        )}

        {(theyOweMe.length > 0 || iOweThem.length > 0) && (
          <div className="flex justify-between items-center border-t border-white/5 pt-4 mt-4">
            <div>
              <div className="text-sm font-semibold">Settle all with {member.full_name}</div>
              <div className="text-xs text-neutral-400">Mark all unsettled expenses as paid</div>
            </div>
            <Button onClick={() => settleAll(member.id)}>
              ✅ Settle Up ({formatPHP(Math.abs(net))})
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Settlement History
  const renderHistory = () => {
    if (settledHistory.length === 0) {
      return <div className="text-sm text-neutral-400 py-2">No settled expenses yet.</div>;
    }
    return (
      <div className="space-y-2">
        {settledHistory.slice(0, 10).map(s => (
          <div key={s.id} className="flex items-center gap-3 text-sm border-b border-white/5 py-2">
            <span className="text-lg">✅</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{s.expense?.title || 'Expense'}</div>
              <div className="text-xs text-neutral-400">{s.profile?.full_name} · {formatDate(s.settled_at)}</div>
            </div>
            <span className="font-mono text-olive-400">{formatPHP(s.amount)}</span>
          </div>
        ))}
      </div>
    );
  };

  // ── Monthly Forecast ─────────────────────────────────────────
  const renderForecast = () => {
    const items = [];

    // 1. Recurring expenses
    for (const r of allRecurring) {
      const multiplier = freqToMonthly[r.frequency] ?? 1;
      const monthlyTotal = Number(r.amount) * multiplier;

      const splitConfig = Array.isArray(r.split_config) ? r.split_config : [];
      const sumOfSplits = splitConfig.reduce((s, sc) => s + Number(sc.amount ?? 0), 0);
      const payerMonthlyShare = monthlyTotal - (sumOfSplits * multiplier);

      let yourShare = 0;
      const mySplitRow = splitConfig.find(sc => sc.profile_id === user.id);

      if (mySplitRow) {
        yourShare = Number(mySplitRow.amount ?? 0) * multiplier;
      } else if (r.paid_by === user.id) {
        yourShare = splitConfig.length > 0 ? payerMonthlyShare : monthlyTotal;
      }

      items.push({
        title: r.title,
        icon: r.category?.icon ?? '🔁',
        totalAmount: monthlyTotal,
        yourShare,
        type: 'recurring',
        freqLabel: frequencyLabel(r.frequency),
        involved: yourShare > 0 || r.paid_by === user.id || !!mySplitRow,
      });
    }

    // 2. One-time unpaid expenses this month
    for (const e of allOneTime) {
      const splits = Array.isArray(e.splits) ? e.splits : [];
      const mySplit = splits.find(s => s.profile_id === user.id);
      let yourShare = 0;

      if (mySplit) {
        yourShare = Number(mySplit.amount ?? 0);
      } else if (e.paid_by === user.id && splits.length === 0) {
        yourShare = Number(e.amount);
      } else if (e.paid_by === user.id && splits.length > 0) {
        const sumSplits = splits.reduce((s, sp) => s + Number(sp.amount ?? 0), 0);
        yourShare = Number(e.amount) - sumSplits;
      }

      const amInvolved = mySplit != null || e.paid_by === user.id;
      if (!amInvolved) continue;

      items.push({
        title: e.title,
        icon: '💸',
        totalAmount: Number(e.amount),
        yourShare,
        type: 'onetime',
        involved: true,
      });
    }

    // Totals
    const grandTotal = items.reduce((s, i) => s + i.totalAmount, 0);
    const totalMyShare = items.reduce((s, i) => s + i.yourShare, 0);

    const [yr, mo] = month.split('-').map(Number);
    const monthLabel = new Date(yr, mo - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Sort: recurring first, then by total amount desc
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'recurring' ? -1 : 1;
      return b.totalAmount - a.totalAmount;
    });

    return (
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-white/5 bg-white/5">
          <div className="font-semibold">📅 Monthly Forecast</div>
          <div className="text-sm text-neutral-400">{monthLabel}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4 border-b border-white/5 bg-white/5">
          <div>
            <div className="text-xs text-neutral-400 uppercase tracking-wider">Household Total</div>
            <div className="text-lg font-mono font-bold">{formatPHP(grandTotal)}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-400 uppercase tracking-wider">Your Share</div>
            <div className="text-lg font-mono font-bold text-olive-400">{formatPHP(totalMyShare)}</div>
          </div>
        </div>
        <div className="divide-y divide-white/5">
          {items.length === 0 ? (
            <div className="p-4 text-center text-neutral-400 text-sm">No forecast data for this month.</div>
          ) : (
            items.map((item, idx) => (
              <div key={idx} className="p-3 hover:bg-white/5 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg flex-shrink-0">{item.icon}</span>
                    <span className="text-sm font-medium truncate">{item.title}</span>
                  </div>
                  <span className="text-sm font-mono font-semibold">{formatPHP(item.totalAmount)}</span>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs text-neutral-400">
                  <span>
                    {item.type === 'recurring' ? (
                      <span className="bg-olive-500/20 text-olive-400 px-2 py-0.5 rounded-full">🔁 {item.freqLabel}</span>
                    ) : (
                      <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">💸 One-time</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    <span>Your share:</span>
                    {item.yourShare > 0 ? (
                      <span className="font-mono font-semibold text-olive-400">{formatPHP(item.yourShare)}</span>
                    ) : (
                      <span className="text-neutral-500">—</span>
                    )}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    );
  };

  // ── Main render ──
  if (loading) return <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Splits & Settlements</h2>
        <div className="flex items-center gap-4">
          <select value={month} onChange={handleChange} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
            {(() => {
              const now = new Date();
              const opts = [];
              for (let i = -12; i <= 2; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
                const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                opts.push({ val, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) });
              }
              return opts.map(m => <option key={m.val} value={m.val}>{m.label}</option>);
            })()}
          </select>
        </div>
      </div>

      {renderNetSummary()}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Member list + history */}
        <div className="lg:col-span-3 space-y-4">
          <div>
            <div className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3">Household Members</div>
            {renderMemberList()}
          </div>
          <div>
            <div className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3">Settlement History</div>
            <Card className="p-3">{renderHistory()}</Card>
          </div>
        </div>

        {/* Center: Detail panel */}
        <div className="lg:col-span-6">
          <Card className="p-5">{renderDetailPanel()}</Card>
        </div>

        {/* Right: Forecast */}
        <div className="lg:col-span-3">{renderForecast()}</div>
      </div>
    </motion.div>
  );
}