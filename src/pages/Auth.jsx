import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/UI/Toast';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [selectedHouseholdId, setSelectedHouseholdId] = useState('');
  const [households, setHouseholds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: '', color: '' });
  const { toasts, showToast } = useToast();

  // ── Load existing households ──
  useEffect(() => {
    const loadHouseholds = async () => {
      const { data } = await supabase
        .from('households')
        .select('id, name')
        .order('name');
      setHouseholds(data || []);
    };
    loadHouseholds();
  }, []);

  // ── Password strength checker ──
  const checkPasswordStrength = (pw) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    const levels = [
      { label: 'Very weak', color: '#EF4444' },
      { label: 'Weak', color: '#F97316' },
      { label: 'Fair', color: '#F59E0B' },
      { label: 'Strong', color: '#10B981' },
      { label: 'Very strong', color: '#059669' },
    ];
    const level = levels[Math.min(score, 4)];
    setPasswordStrength({ score, label: level.label, color: level.color });
    return score >= 3; // at least "Strong"
  };

  const handlePasswordChange = (e) => {
    const pw = e.target.value;
    setPassword(pw);
    checkPasswordStrength(pw);
  };

  // ── Submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      // ── LOGIN ──
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        showToast(error.message, 'error');
        setLoading(false);
        return;
      }
      // Redirect to dashboard
      window.location.hash = '#/';
      window.location.reload();
      return;
    }

    // ── REGISTER ──
    // Validate password strength
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

    // Determine household
    let householdId = selectedHouseholdId;
    if (selectedHouseholdId === 'new') {
      // Create new household
      if (!householdName.trim()) {
        showToast('Please enter a household name.', 'warning');
        setLoading(false);
        return;
      }
      const { data: newHousehold, error: hhError } = await supabase
        .from('households')
        .insert({ name: householdName.trim(), created_by: null }) // will be updated later
        .select()
        .single();
      if (hhError) {
        showToast('Failed to create household: ' + hhError.message, 'error');
        setLoading(false);
        return;
      }
      householdId = newHousehold.id;
    } else if (!householdId) {
      showToast('Please select or create a household.', 'warning');
      setLoading(false);
      return;
    }

    // ── Sign up ──
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        // No redirect – we handle it ourselves
      },
    });

    if (signUpError) {
      showToast(signUpError.message, 'error');
      setLoading(false);
      return;
    }

    // If user is not immediately confirmed (email confirmation required)
    if (!signUpData.user?.confirmed_at) {
      showToast('Account created! Please verify your email then log in.', 'success');
      setLoading(false);
      setIsLogin(true);
      return;
    }

    // User is already confirmed (if email confirmation is disabled in Supabase)
    // Update profile with household_id and role
    const userId = signUpData.user.id;
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        household_id: householdId,
        role: selectedHouseholdId === 'new' ? 'owner' : 'member',
        full_name: fullName,
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Profile update error:', profileError);
      showToast('Account created but profile setup failed. Please contact support.', 'warning');
    }

    // If this is a new household, update the created_by field
    if (selectedHouseholdId === 'new') {
      await supabase
        .from('households')
        .update({ created_by: userId })
        .eq('id', householdId);

      // Seed default tag
      await supabase.from('tags').insert({
        name: 'Shared',
        color: '#4F46E5',
        household_id: householdId,
        created_by: userId,
      });
    }

    showToast('Account created! Logging you in…', 'success');
    // Sign in automatically
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      showToast('Please log in manually with your credentials.', 'info');
      setIsLogin(true);
      setLoading(false);
      return;
    }
    window.location.hash = '#/';
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-olive-600 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-olive-600/20">W</div>
            <span className="text-2xl font-bold text-white">WeXpense</span>
          </div>
          <p className="text-neutral-400 mt-2">Track every peso, together.</p>
        </div>

        <div className="glass rounded-2xl border border-white/5 p-6 shadow-xl">
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

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ── Full name (register only) ── */}
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                  required
                />
              </div>
            )}

            {/* ── Email ── */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                required
              />
            </div>

            {/* ── Password ── */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={handlePasswordChange}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                required
              />
              {!isLogin && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-neutral-400">Strength:</span>
                    <span style={{ color: passwordStrength.color }}>{passwordStrength.label}</span>
                  </div>
                  <div className="w-full h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${(passwordStrength.score / 4) * 100}%`,
                        backgroundColor: passwordStrength.color,
                      }}
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

            {/* ── Household (register only) ── */}
            {!isLogin && (
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-olive-600 hover:bg-olive-700 text-white font-medium rounded-lg transition-all shadow-lg shadow-olive-600/20 hover:shadow-olive-600/40 disabled:opacity-50"
            >
              {loading ? <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (isLogin ? 'Sign In' : 'Create Account')}
            </button>
          </form>
        </div>
        <ToastContainer toasts={toasts} />
      </div>
    </div>
  );
}