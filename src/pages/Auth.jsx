import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/UI/Toast';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [selectedHouseholdId, setSelectedHouseholdId] = useState('');
  const [households, setHouseholds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: '', color: '' });
  const { toasts, showToast } = useToast();

  // ── Invite state ────────────────────────────────────────────────────
  const [inviteToken, setInviteToken]         = useState(null);
  const [inviteHouseholdId, setInviteHouseholdId] = useState(null);
  const [inviteInfo, setInviteInfo]           = useState(null);  // { householdName, inviterName, email }
  const [inviteError, setInviteError]         = useState(null);
  const [inviteLoading, setInviteLoading]     = useState(false);

  // ── Check for invite token in URL ───────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('invite');
    if (!token) return;

    setInviteToken(token);
    setIsLogin(false);          // jump straight to the register tab
    setInviteLoading(true);

    const validateInvite = async () => {
      const { data: invite, error } = await supabase
        .from('invitations')
        .select('*, household:households(name), inviter:profiles(full_name)')
        .eq('token', token)
        .eq('status', 'pending')
        .single();

      setInviteLoading(false);

      if (error || !invite || new Date(invite.expires_at) < new Date()) {
        setInviteError('This invite link has expired or is invalid. Ask the household owner to send a new one.');
        return;
      }

      setInviteInfo({
        householdName: invite.household?.name ?? 'a household',
        inviterName:   invite.inviter?.full_name ?? 'Someone',
        email:         invite.invited_email,
      });
      setInviteHouseholdId(invite.household_id);
      setEmail(invite.invited_email);
      setFullName(invite.invited_email.split('@')[0]); // pre-fill name from email prefix
    };

    validateInvite();
  }, []);

  // ── Load existing households (normal register flow) ──────────────────
  useEffect(() => {
    if (inviteToken) return; // not needed for invite flow
    const loadHouseholds = async () => {
      const { data, error } = await supabase.rpc('list_households');
      if (!error) setHouseholds(data || []);
    };
    loadHouseholds();
  }, [inviteToken]);

  // ── Password strength ───────────────────────────────────────────────
  const checkPasswordStrength = (pw) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const levels = [
      { label: 'Very weak',    color: '#EF4444' },
      { label: 'Weak',         color: '#F97316' },
      { label: 'Fair',         color: '#F59E0B' },
      { label: 'Strong',       color: '#10B981' },
      { label: 'Very strong',  color: '#059669' },
    ];
    const level = levels[Math.min(score, 4)];
    setPasswordStrength({ score, label: level.label, color: level.color });
    return score >= 3;
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    checkPasswordStrength(e.target.value);
  };

  // ── Submit handler ──────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // ── LOGIN ──────────────────────────────────────────────────────────
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { showToast(error.message, 'error'); setLoading(false); }
      return; // onAuthStateChange handles redirect
    }

    // ── INVITE FLOW ────────────────────────────────────────────────────
    if (inviteToken && inviteHouseholdId) {
      if (password.length < 8) {
        showToast('Password must be at least 8 characters.', 'warning');
        setLoading(false);
        return;
      }

      // The Supabase invite email creates the auth account automatically.
      // The invite link embeds access_token in the URL hash, which the
      // Supabase JS client picks up via detectSessionInUrl: true.
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // No session yet — the invite link may have landed on a different
        // page or been cleared. Try exchanging via URL (hash tokens).
        const { error: exchError } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (exchError) {
          showToast('Your invite session has expired. Ask the owner to resend the invite.', 'error');
          setLoading(false);
          return;
        }
      }

      // Re-fetch session after possible exchange
      const { data: { session: liveSession } } = await supabase.auth.getSession();
      if (!liveSession) {
        showToast('Could not establish session. Please try the invite link again.', 'error');
        setLoading(false);
        return;
      }

      // Set the password on the already-created account
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        showToast(updateError.message, 'error');
        setLoading(false);
        return;
      }

      // Also persist chosen full name
      await supabase.auth.updateUser({ data: { full_name: fullName } });

      // Mark invite as accepted
      await supabase.from('invitations')
        .update({ status: 'accepted' })
        .eq('token', inviteToken);

      // Link profile to household
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ household_id: inviteHouseholdId, role: 'member', full_name: fullName })
        .eq('id', liveSession.user.id);

      if (profileError) console.error('Profile update error:', profileError);

      showToast('Welcome! Your account is ready 🎉', 'success');
      // onAuthStateChange will navigate away automatically
      setLoading(false);
      return;
    }

    // ── NORMAL REGISTER FLOW ───────────────────────────────────────────
    if (password.length < 8) {
      showToast('Password must be at least 8 characters.', 'warning');
      setLoading(false);
      return;
    }
    if (passwordStrength.score < 3) {
      showToast('Please use a stronger password (mix of letters, numbers, symbols).', 'warning');
      setLoading(false);
      return;
    }
    if (selectedHouseholdId === 'new') {
      if (!householdName.trim()) {
        showToast('Please enter a household name.', 'warning');
        setLoading(false);
        return;
      }
    } else if (!selectedHouseholdId) {
      showToast('Please select or create a household.', 'warning');
      setLoading(false);
      return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (signUpError) {
      showToast(signUpError.message, 'error');
      setLoading(false);
      return;
    }

    if (!signUpData.user?.confirmed_at) {
      showToast('Account created! Please verify your email then log in to finish setting up your household.', 'success');
      setLoading(false);
      setIsLogin(true);
      return;
    }

    const userId = signUpData.user.id;
    let householdId = selectedHouseholdId;

    if (selectedHouseholdId === 'new') {
      const { data: newHousehold, error: hhError } = await supabase
        .from('households')
        .insert({ name: householdName.trim(), created_by: userId })
        .select()
        .single();
      if (hhError) {
        showToast('Account created but household setup failed: ' + hhError.message, 'error');
        setLoading(false);
        return;
      }
      householdId = newHousehold.id;
      await supabase.from('tags').insert({ name: 'Shared', color: '#4F46E5', household_id: householdId, created_by: userId });
    }

    await supabase.from('profiles').update({
      household_id: householdId,
      role: selectedHouseholdId === 'new' ? 'owner' : 'member',
      full_name: fullName,
    }).eq('id', userId);

    showToast('Account created! Logging you in…', 'success');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      showToast('Please log in manually with your credentials.', 'info');
      setIsLogin(true);
    }
    setLoading(false);
  };

  // ── UI ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900 p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-olive-600 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-olive-600/20">W</div>
            <span className="text-2xl font-bold text-white">WeXpense</span>
          </div>
          <p className="text-neutral-400 mt-2">Track every peso, together.</p>
        </div>

        <div className="glass rounded-2xl border border-white/5 p-6 shadow-xl">

          {/* ── Invite banner ── */}
          {inviteLoading && (
            <div className="mb-5 flex items-center gap-3 p-4 rounded-xl bg-olive-600/10 border border-olive-600/20">
              <div className="w-5 h-5 border-2 border-olive-400/30 border-t-olive-400 rounded-full animate-spin flex-shrink-0" />
              <span className="text-sm text-neutral-300">Validating invite link…</span>
            </div>
          )}

          {inviteError && (
            <div className="mb-5 p-4 rounded-xl bg-rust-600/10 border border-rust-600/30">
              <div className="text-sm font-semibold text-rust-400 mb-1">❌ Invite Invalid</div>
              <p className="text-sm text-neutral-400">{inviteError}</p>
            </div>
          )}

          {inviteInfo && !inviteError && (
            <div className="mb-5 p-4 rounded-xl bg-olive-600/10 border border-olive-600/20">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🏠</span>
                <div>
                  <p className="text-sm font-semibold text-neutral-200">
                    {inviteInfo.inviterName} invited you to join <strong className="text-olive-400">{inviteInfo.householdName}</strong>
                  </p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Enter your name and a password to complete setup. Your email is already confirmed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab bar (hidden when on invite flow) ── */}
          {!inviteToken && (
            <div className="flex gap-1 bg-white/5 rounded-lg p-1 mb-6">
              <button
                onClick={() => setIsLogin(true)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  isLogin ? 'bg-olive-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  !isLogin ? 'bg-olive-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {/* ── Invite mode header ── */}
          {inviteToken && !inviteError && (
            <div className="mb-5">
              <h2 className="text-lg font-semibold">Join {inviteInfo?.householdName ?? 'Household'}</h2>
              <p className="text-sm text-neutral-400">Create your account to get started.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Full name (register + invite) */}
            {(!isLogin || inviteToken) && (
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Juan dela Cruz"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                  required
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white ${
                  inviteToken ? 'opacity-60 cursor-not-allowed' : ''
                }`}
                readOnly={!!inviteToken}
                required
              />
              {inviteToken && (
                <p className="text-xs text-neutral-500 mt-1">Email is pre-filled from your invite.</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={handlePasswordChange}
                placeholder={isLogin && !inviteToken ? '••••••••' : 'Min. 8 characters'}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                required
              />
              {(!isLogin || inviteToken) && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-neutral-400">Strength:</span>
                    <span style={{ color: passwordStrength.color }}>{passwordStrength.label}</span>
                  </div>
                  <div className="w-full h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full transition-all duration-300"
                      style={{ width: `${(passwordStrength.score / 4) * 100}%`, backgroundColor: passwordStrength.color }}
                    />
                  </div>
                  <ul className="text-xs text-neutral-400 mt-2 space-y-0.5">
                    <li className={password.length >= 8 ? 'text-olive-400' : ''}>
                      {password.length >= 8 ? '✓' : '•'} At least 8 characters
                    </li>
                    <li className={/[A-Z]/.test(password) && /[0-9]/.test(password) ? 'text-olive-400' : ''}>
                      {/[A-Z]/.test(password) && /[0-9]/.test(password) ? '✓' : '•'} Letters & numbers
                    </li>
                    <li className={/[^A-Za-z0-9]/.test(password) ? 'text-olive-400' : ''}>
                      {/[^A-Za-z0-9]/.test(password) ? '✓' : '•'} Special character (optional)
                    </li>
                  </ul>
                </div>
              )}
            </div>

            {/* Household selector (normal register only, not invite) */}
            {!isLogin && !inviteToken && (
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Household</label>
                <select
                  value={selectedHouseholdId}
                  onChange={(e) => setSelectedHouseholdId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                >
                  <option value="">Select an existing household or create new</option>
                  {households.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                  <option value="new">➕ Create new household</option>
                </select>
                {selectedHouseholdId === 'new' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={householdName}
                      onChange={(e) => setHouseholdName(e.target.value)}
                      placeholder="Enter new household name"
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Invite: joining household info pill */}
            {inviteToken && inviteInfo && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-olive-600/10 border border-olive-600/20 text-sm text-olive-300">
                <span>🏠</span>
                <span>Joining <strong>{inviteInfo.householdName}</strong></span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (!!inviteToken && !!inviteError)}
              className="w-full py-2.5 px-4 bg-olive-600 hover:bg-olive-700 text-white font-medium rounded-lg transition-all shadow-lg shadow-olive-600/20 hover:shadow-olive-600/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : inviteToken
                  ? `Join ${inviteInfo?.householdName ?? 'Household'}`
                  : isLogin
                    ? 'Sign In'
                    : 'Create Account'
              }
            </button>
          </form>
        </div>

        <ToastContainer toasts={toasts} />
      </div>
    </div>
  );
}