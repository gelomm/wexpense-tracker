import { useEffect, useState } from 'react';
import { supabase, signOut } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/UI/Button';
import { Card } from '../components/UI/Card';
import { Spinner } from '../components/UI/Spinner';
import { motion, AnimatePresence } from 'framer-motion';
import { COLORS } from '../lib/constants';
import { hexToAlpha } from '../lib/utils';

const SUPABASE_URL = 'https://tdpabktyawspqzvbyier.supabase.co';

export default function Settings({ showToast }) {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [household, setHousehold] = useState(null);
  const [members, setMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [formData, setFormData] = useState({ name: '', currency: 'PHP', theme: 'dark' });

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [resendingId, setResendingId] = useState(null);

  useEffect(() => {
    if (profile?.household_id) {
      loadHousehold();
      loadMembers();
      loadPendingInvites();
      loadCategories();
      loadTags();
      loadBudgets();
    }
  }, [profile]);

  const loadHousehold = async () => {
    const { data } = await supabase.from('households').select('*').eq('id', profile.household_id).single();
    setHousehold(data);
    setFormData(prev => ({ ...prev, name: data?.name || '' }));
  };

  const loadMembers = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name, role').eq('household_id', profile.household_id);
    setMembers(data || []);
  };

  const loadPendingInvites = async () => {
    const { data } = await supabase
      .from('invitations')
      .select('*')
      .eq('household_id', profile.household_id)
      .eq('status', 'pending');
    setPendingInvites(data || []);
  };

  const loadCategories = async () => {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .or(`household_id.is.null,household_id.eq.${profile.household_id}`)
      .order('name');
    setCategories(data || []);
  };

  const loadTags = async () => {
    const { data } = await supabase
      .from('tags')
      .select('*')
      .or(`household_id.is.null,household_id.eq.${profile.household_id}`)
      .order('name');
    setTags(data || []);
  };

  const loadBudgets = async () => {
    const { data } = await supabase
      .from('budgets')
      .select('*')
      .eq('household_id', profile.household_id)
      .eq('month', new Date().toISOString().slice(0, 7));
    setBudgets(data || []);
  };

  const updateProfile = async () => {
    await supabase.from('profiles').update({
      full_name: formData.name,
      currency: formData.currency,
      theme_preference: formData.theme,
    }).eq('id', user.id);
    showToast('Profile updated!', 'success');
  };

  const updateHousehold = async () => {
    await supabase.from('households').update({ name: formData.name }).eq('id', household.id);
    showToast('Household updated!', 'success');
  };

  // ── Send invite ──────────────────────────────────────────────────────
  const sendInvite = async () => {
    if (!inviteEmail.trim()) {
      showToast('Please enter an email address.', 'warning');
      return;
    }
    setInviteLoading(true);

    // 1. Create invitation row in DB
    const token = crypto.randomUUID().replace(/-/g, '');
    const { error: inviteError } = await supabase.from('invitations').insert({
      household_id:  profile.household_id,
      invited_email: inviteEmail.trim().toLowerCase(),
      invited_by:    user.id,
      token,
    });

    if (inviteError) {
      showToast('Failed to create invite: ' + inviteError.message, 'error');
      setInviteLoading(false);
      return;
    }

    // 2. Call the Edge Function to email the invite
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          inviteEmail:   inviteEmail.trim().toLowerCase(),
          inviterName:   profile.full_name,
          householdName: household?.name ?? 'our household',
          token,
        }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);

      showToast(`Invite sent to ${inviteEmail}! 🎉`, 'success');
      setInviteEmail('');
      await loadPendingInvites();
    } catch (err) {
      showToast('Failed to send invite email: ' + err.message, 'error');
    }
    setInviteLoading(false);
  };

  // ── Resend invite ────────────────────────────────────────────────────
  const resendInvite = async (invite) => {
    setResendingId(invite.id);
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          inviteEmail:   invite.invited_email,
          inviterName:   profile.full_name,
          householdName: household?.name ?? 'our household',
          token:         invite.token,
        }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);

      // Reset expiry to 7 days from now
      await supabase.from('invitations')
        .update({ expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
        .eq('id', invite.id);

      showToast(`Invite resent to ${invite.invited_email}! ✅`, 'success');
      await loadPendingInvites();
    } catch (err) {
      showToast('Failed to resend: ' + err.message, 'error');
    }
    setResendingId(null);
  };

  // ── Remove member ────────────────────────────────────────────────────
  const removeMember = async (memberId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from the household?`)) return;
    const { error } = await supabase.from('profiles')
      .update({ household_id: null, role: 'member' })
      .eq('id', memberId);
    if (error) { showToast('Failed to remove member.', 'error'); return; }
    showToast(`${memberName} removed.`, 'info');
    await loadMembers();
  };

  // ── Revoke pending invite ────────────────────────────────────────────
  const revokeInvite = async (inviteId, email) => {
    if (!window.confirm(`Revoke invite for ${email}?`)) return;
    await supabase.from('invitations').update({ status: 'expired' }).eq('id', inviteId);
    showToast('Invite revoked.', 'info');
    await loadPendingInvites();
  };

  const navTabs = [
    { id: 'profile',   label: 'Profile',    icon: '👤' },
    { id: 'household', label: 'Household',  icon: '🏠' },
    { id: 'members',   label: 'Members',    icon: '👥' },
    { id: 'categories',label: 'Categories', icon: '📂' },
    { id: 'tags',      label: 'Tags',       icon: '🏷️' },
    { id: 'budgets',   label: 'Budgets',    icon: '🎯' },
    { id: 'danger',    label: 'Danger Zone',icon: '⚠️', danger: true },
  ];

  const renderTab = () => {
    switch (activeTab) {

      // ── PROFILE ────────────────────────────────────────────────────
      case 'profile':
        return (
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-semibold mb-1">Profile</h3>
              <p className="text-sm text-neutral-400">Manage your personal information and preferences.</p>
            </div>

            {/* Avatar preview */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="w-14 h-14 rounded-full bg-olive-600 flex items-center justify-center text-white font-bold text-2xl flex-shrink-0">
                {(profile?.full_name?.[0] ?? 'U').toUpperCase()}
              </div>
              <div>
                <div className="font-semibold">{profile?.full_name}</div>
                <div className="text-sm text-neutral-400">{user?.email}</div>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-olive-600/20 text-olive-400 capitalize">{profile?.role}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Full Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Currency</label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                >
                  <option value="PHP">🇵🇭 PHP</option>
                  <option value="USD">🇺🇸 USD</option>
                  <option value="EUR">🇪🇺 EUR</option>
                  <option value="SGD">🇸🇬 SGD</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Theme</label>
                <select
                  value={formData.theme}
                  onChange={(e) => setFormData({ ...formData, theme: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                >
                  <option value="dark">🌙 Dark</option>
                  <option value="light">☀️ Light</option>
                </select>
              </div>
            </div>
            <Button onClick={updateProfile}>Save Profile</Button>
          </div>
        );

      // ── HOUSEHOLD ───────────────────────────────────────────────────
      case 'household':
        return (
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-semibold mb-1">Household</h3>
              <p className="text-sm text-neutral-400">Manage your shared household settings.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Household Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
              />
            </div>
            <Button onClick={updateHousehold}>Update Household</Button>
          </div>
        );

      // ── MEMBERS ─────────────────────────────────────────────────────
      case 'members':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold mb-1">Members</h3>
              <p className="text-sm text-neutral-400">Invite family members to share expenses.</p>
            </div>

            {/* ── Invite form ── */}
            <div className="p-4 rounded-xl border border-dashed border-white/20 bg-white/3 space-y-3">
              <div className="text-sm font-semibold text-neutral-200">✉️ Invite via Email</div>
              <div className="flex gap-3 flex-col sm:flex-row">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
                  placeholder="member@example.com"
                  className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white placeholder:text-neutral-500"
                />
                <Button onClick={sendInvite} disabled={inviteLoading} className="whitespace-nowrap">
                  {inviteLoading ? <Spinner size="sm" /> : '📨 Send Invite'}
                </Button>
              </div>
              <p className="text-xs text-neutral-500">
                They'll receive an email link to join <strong className="text-neutral-300">{household?.name}</strong>. Link expires in 7 days.
              </p>
            </div>

            {/* ── Pending invites ── */}
            {pendingInvites.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">
                  Pending Invites ({pendingInvites.length})
                </div>
                <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
                  {pendingInvites.map(inv => {
                    const expiresAt = new Date(inv.expires_at);
                    const isExpired = expiresAt < new Date();
                    return (
                      <div key={inv.id} className="flex items-center gap-3 px-4 py-3 bg-white/3">
                        <div className="w-9 h-9 rounded-full bg-neutral-700 flex items-center justify-center text-neutral-400 text-sm flex-shrink-0">
                          ?
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{inv.invited_email}</div>
                          <div className={`text-xs ${isExpired ? 'text-rust-400' : 'text-neutral-500'}`}>
                            {isExpired ? '⚠️ Expired' : `Expires ${expiresAt.toLocaleDateString('en-PH')}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">
                            Pending
                          </span>
                          <button
                            onClick={() => resendInvite(inv)}
                            disabled={resendingId === inv.id}
                            className="text-xs px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-neutral-300 transition-all disabled:opacity-50"
                          >
                            {resendingId === inv.id ? <Spinner size="sm" /> : 'Resend'}
                          </button>
                          <button
                            onClick={() => revokeInvite(inv.id, inv.invited_email)}
                            className="text-xs px-2.5 py-1 rounded-md bg-rust-600/10 hover:bg-rust-600/20 text-rust-400 transition-all"
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Current members ── */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">
                Current Members ({members.length})
              </div>
              <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
                {members.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3 bg-white/3">
                    <div className="w-9 h-9 rounded-full bg-olive-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {m.full_name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {m.full_name}
                        {m.id === user.id && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-olive-600/20 text-olive-400">You</span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-500 capitalize">{m.role}</div>
                    </div>
                    {profile?.role === 'owner' && m.id !== user.id && (
                      <button
                        onClick={() => removeMember(m.id, m.full_name)}
                        className="text-xs px-2.5 py-1 rounded-md bg-rust-600/10 hover:bg-rust-600/20 text-rust-400 transition-all flex-shrink-0"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      // ── CATEGORIES ──────────────────────────────────────────────────
      case 'categories':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold mb-1">Categories</h3>
              <p className="text-sm text-neutral-400">Expense categories available to your household.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(c => (
                <span
                  key={c.id}
                  className="px-3 py-1.5 rounded-full text-sm font-medium border"
                  style={{
                    backgroundColor: hexToAlpha(c.color || '#7a9444', 0.15),
                    color: c.color || '#7a9444',
                    borderColor: hexToAlpha(c.color || '#7a9444', 0.3),
                  }}
                >
                  {c.icon} {c.name}
                </span>
              ))}
            </div>
          </div>
        );

      // ── TAGS ────────────────────────────────────────────────────────
      case 'tags':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold mb-1">Tags</h3>
              <p className="text-sm text-neutral-400">Tags help group and filter expenses across categories.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map(t => (
                <span
                  key={t.id}
                  className="px-3 py-1.5 rounded-full text-sm font-medium border"
                  style={{
                    backgroundColor: hexToAlpha(t.color || '#7a9444', 0.15),
                    color: t.color || '#7a9444',
                    borderColor: hexToAlpha(t.color || '#7a9444', 0.3),
                  }}
                >
                  {t.name}
                </span>
              ))}
            </div>
          </div>
        );

      // ── BUDGETS ─────────────────────────────────────────────────────
      case 'budgets':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold mb-1">Monthly Budgets</h3>
              <p className="text-sm text-neutral-400">Set spending limits per category for this month.</p>
            </div>
            <div className="space-y-3">
              {categories.filter(c => c.household_id === profile.household_id).map(c => {
                const budget = budgets.find(b => b.category_id === c.id);
                return (
                  <div key={c.id} className="flex items-center gap-4">
                    <span className="w-28 text-sm">{c.icon} {c.name}</span>
                    <input
                      type="number"
                      placeholder="0.00"
                      defaultValue={budget?.amount || ''}
                      className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                      onBlur={async (e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val > 0) {
                          await supabase.from('budgets').upsert({
                            household_id: profile.household_id,
                            category_id: c.id,
                            month: new Date().toISOString().slice(0, 7),
                            amount: val,
                            created_by: user.id,
                          });
                          showToast('Budget saved!', 'success');
                        }
                      }}
                    />
                  </div>
                );
              })}
              {categories.filter(c => c.household_id === profile.household_id).length === 0 && (
                <p className="text-sm text-neutral-500">Add custom categories first to set budgets for them.</p>
              )}
            </div>
          </div>
        );

      // ── DANGER ZONE ─────────────────────────────────────────────────
      case 'danger':
        return (
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-semibold text-rust-400 mb-1">⚠️ Danger Zone</h3>
              <p className="text-sm text-neutral-400">These actions are irreversible. Please proceed with caution.</p>
            </div>

            {/* Leave Household */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-rust-600/30 bg-rust-600/5">
              <div>
                <div className="font-semibold text-rust-300">Leave Household</div>
                <div className="text-sm text-neutral-400 mt-0.5">
                  You will lose access to all shared expenses. Ownership must be transferred first.
                </div>
              </div>
              <Button
                variant="danger"
                className="flex-shrink-0 whitespace-nowrap"
                onClick={() => {
                  if (window.confirm('Are you sure you want to leave this household? You will lose access to all shared data.')) {
                    supabase.from('profiles').update({ household_id: null, role: 'member' }).eq('id', user.id);
                    showToast('You have left the household.', 'info');
                    setTimeout(signOut, 1500);
                  }
                }}
              >
                Leave Household
              </Button>
            </div>

            {/* Sign Out */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-white/10 bg-white/3">
              <div>
                <div className="font-semibold text-neutral-200">Sign Out</div>
                <div className="text-sm text-neutral-400 mt-0.5">
                  Sign out of your current session on this device.
                </div>
              </div>
              <Button
                variant="secondary"
                className="flex-shrink-0 whitespace-nowrap"
                onClick={signOut}
              >
                Sign Out
              </Button>
            </div>

            {/* Delete Account */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-rust-600/30 bg-rust-600/5">
              <div>
                <div className="font-semibold text-rust-300">Delete Account</div>
                <div className="text-sm text-neutral-400 mt-0.5">
                  Permanently delete your account and all associated data. This cannot be undone.
                </div>
              </div>
              <Button
                variant="danger"
                className="flex-shrink-0 whitespace-nowrap"
                onClick={() => showToast('Please contact support to delete your account.', 'info')}
              >
                Delete Account
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <h2 className="text-2xl font-bold mb-6">Settings</h2>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* ── Sidebar nav ── */}
        <div className="space-y-1">
          {navTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2.5 ${
                activeTab === tab.id
                  ? tab.danger
                    ? 'bg-rust-600/20 text-rust-400'
                    : 'bg-olive-600/20 text-olive-400'
                  : tab.danger
                    ? 'text-rust-500 hover:text-rust-300 hover:bg-rust-600/10'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
              {/* Pending invite badge on Members tab */}
              {tab.id === 'members' && pendingInvites.length > 0 && (
                <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold">
                  {pendingInvites.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Content panel ── */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              <Card>{renderTab()}</Card>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}