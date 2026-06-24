import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/UI/Toast';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [loading, setLoading] = useState(false);
  const { toasts, showToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        showToast(error.message, 'error');
        setLoading(false);
      } else {
        window.location.href = '/';
      }
    } else {
      // Registration flow
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (signUpError) {
        showToast(signUpError.message, 'error');
        setLoading(false);
        return;
      }

      // Wait for session (email confirmation may be required)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('Please verify your email and then log in.', 'warning');
        setLoading(false);
        return;
      }

      // Create household and update profile
      const userId = session.user.id;
      const { data: household, error: hhError } = await supabase
        .from('households')
        .insert({ name: householdName, created_by: userId })
        .select()
        .single();
      if (hhError) {
        showToast('Failed to create household: ' + hhError.message, 'error');
        setLoading(false);
        return;
      }
      await supabase.from('profiles').update({ household_id: household.id, role: 'owner' }).eq('id', userId);
      // Seed default tag
      await supabase.from('tags').insert({ name: 'Shared', color: '#4F46E5', household_id: household.id, created_by: userId });

      showToast('Account created! Please verify your email.', 'success');
      setTimeout(() => window.location.href = '/', 2000);
    }
    setLoading(false);
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
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1">Household Name</label>
                  <input
                    type="text"
                    value={householdName}
                    onChange={(e) => setHouseholdName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                    required
                  />
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
              <label className="block text-sm font-medium text-neutral-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                required
              />
            </div>
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