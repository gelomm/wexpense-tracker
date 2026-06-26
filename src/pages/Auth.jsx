import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/UI/Toast';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [householdOption, setHouseholdOption] = useState('create'); // 'create' or 'existing'
  const [selectedHousehold, setSelectedHousehold] = useState('');
  const [newHouseholdName, setNewHouseholdName] = useState('');
  const [households, setHouseholds] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toasts, showToast } = useToast();
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: '', color: '' });

  // Fetch existing households for dropdown
  useEffect(() => {
    const fetchHouseholds = async () => {
      const { data } = await supabase.from('households').select('id, name').order('name');
      setHouseholds(data || []);
    };
    fetchHouseholds();
  }, []);

  // Password strength checker
  const checkPasswordStrength = (pw) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const levels = [
      { score: 0, label: 'Very weak', color: '#EF4444' },
      { score: 1, label: 'Weak', color: '#F97316' },
      { score: 2, label: 'Fair', color: '#F59E0B' },
      { score: 3, label: 'Strong', color: '#10B981' },
      { score: 4, label: 'Very strong', color: '#059669' },
    ];
    const level = levels[Math.min(score, 4)];
    setPasswordStrength({ score, label: level.label, color: level.color });
    return score;
  };

  const handlePasswordChange = (e) => {
    const val = e.target.value;
    setPassword(val);
    if (val) checkPasswordStrength(val);
    else setPasswordStrength({ score: 0, label: '', color: '' });
  };

  // ── Submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        showToast(error.message, 'error');
      } else {
        window.location.href = '/wexpense-tracker/#/';
      }
    } else {
      // Registration
      // Validate password
      if (password.length < 8) {
        showToast('Password must be at least 8 characters.', 'warning');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        showToast('Passwords do not match.', 'error');
        setLoading(false);
        return;
      }

      // Determine household_id
      let householdId = null;
      if (householdOption === 'existing') {
        householdId = selectedHousehold;
      } else {
        // Create new household
        if (!newHouseholdName.trim()) {
          showToast('Please enter a household name.', 'warning');
          setLoading(false);
          return;
        }
        const { data: newHousehold, error: hhError } = await supabase
          .from('households')
          .insert({ name: newHouseholdName.trim() })
          .select()
          .single();
        if (hhError) {
          showToast('Failed to create household.', 'error');
          setLoading(false);
          return;
        }
        householdId = newHousehold.id;
      }

      // Sign up
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: 'https://gelomm.github.io/wexpense-tracker/#/',
        },
      });

      if (signUpError) {
        showToast(signUpError.message, 'error');
        setLoading(false);
        return;
      }

      // Wait for session (might need email confirmation)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('Please verify your email and then log in.', 'success');
        setLoading(false);
        return;
      }

      // Update profile with household_id
      const userId = session.user.id;
      await supabase
        .from('profiles')
        .update({ household_id: householdId, role: 'member' })
        .eq('id', userId);

      // Seed default tags
      await supabase.from('tags').insert({
        name: 'Shared',
        color: '#4F46E5',
        household_id: householdId,
        created_by: userId,
      });

      showToast('Account created! You are now signed in.', 'success');
      setTimeout(() => {
        window.location.href = '/wexpense-tracker/#/';
      }, 1000);
    }
    setLoading(false);
  };

  // ── Render ──
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
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${isLogin ? 'bg-olive-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${!isLogin ? 'bg-olive-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white'}`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
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

                {/* Household selection */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1">Household</label>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setHouseholdOption('create')}
                      className={`flex-1 py-1.5 rounded-lg text-sm transition-all ${householdOption === 'create' ? 'bg-olive-600 text-white' : 'bg-white/5 text-neutral-400 hover:text-white'}`}
                    >
                      Create New
                    </button>
                    <button
                      type="button"
                      onClick={() => setHouseholdOption('existing')}
                      className={`flex-1 py-1.5 rounded-lg text-sm transition-all ${householdOption === 'existing' ? 'bg-olive-600 text-white' : 'bg-white/5 text-neutral-400 hover:text-white'}`}
                    >
                      Join Existing
                    </button>
                  </div>
                  {householdOption === 'create' ? (
                    <input
                      type="text"
                      value={newHouseholdName}
                      onChange={(e) => setNewHouseholdName(e.target.value)}
                      placeholder="e.g. Dela Cruz Family"
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                      required
                    />
                  ) : (
                    <select
                      value={selectedHousehold}
                      onChange={(e) => setSelectedHousehold(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                      required
                    >
                      <option value="">Select a household</option>
                      {households.map((h) => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </>
            )}

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

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Password {!isLogin && <span className="text-xs text-neutral-400">(min. 8 chars)</span>}</label>
              <input
                type="password"
                value={password}
                onChange={handlePasswordChange}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                required
              />
              {!isLogin && passwordStrength.label && (
                <div className="mt-1">
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(passwordStrength.score / 4) * 100}%`, backgroundColor: passwordStrength.color }} />
                  </div>
                  <span className="text-xs" style={{ color: passwordStrength.color }}>{passwordStrength.label}</span>
                </div>
              )}
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                  required
                />
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