import { useEffect, useState } from 'react';
import { supabase, signOut } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/UI/Button';
import { Card } from '../components/UI/Card';
import { Spinner } from '../components/UI/Spinner';
import { motion } from 'framer-motion';
import { COLORS } from '../lib/constants';
import { hexToAlpha } from '../lib/utils';

export default function Settings({ showToast }) {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [household, setHousehold] = useState(null);
  const [members, setMembers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [formData, setFormData] = useState({ name: '', currency: 'PHP', theme: 'dark' });

  useEffect(() => {
    if (profile?.household_id) {
      loadHousehold();
      loadMembers();
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

  const renderTab = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Profile</h3>
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
                  <option value="PHP">PHP</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Theme</label>
                <select
                  value={formData.theme}
                  onChange={(e) => setFormData({ ...formData, theme: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-olive-500/50 text-white"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
            </div>
            <Button onClick={updateProfile}>Save Profile</Button>
          </div>
        );
      case 'household':
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Household</h3>
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
      case 'members':
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Members</h3>
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.id} className="flex justify-between items-center border-b border-white/5 py-2">
                  <span>{m.full_name} {m.id === user.id && '(You)'}</span>
                  <span className="text-sm text-neutral-400 capitalize">{m.role}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 'categories':
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Categories</h3>
            <div className="flex flex-wrap gap-2">
              {categories.map(c => (
                <span key={c.id} className="px-3 py-1 rounded-full text-sm" style={{ backgroundColor: hexToAlpha(c.color || '#7a9444', 0.2), color: c.color || '#7a9444' }}>
                  {c.icon} {c.name}
                </span>
              ))}
            </div>
          </div>
        );
      case 'tags':
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {tags.map(t => (
                <span key={t.id} className="px-3 py-1 rounded-full text-sm" style={{ backgroundColor: hexToAlpha(t.color || '#7a9444', 0.2), color: t.color || '#7a9444' }}>
                  {t.name}
                </span>
              ))}
            </div>
          </div>
        );
      case 'budgets':
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Budgets</h3>
            <div className="space-y-3">
              {categories.filter(c => c.household_id === profile.household_id).map(c => {
                const budget = budgets.find(b => b.category_id === c.id);
                return (
                  <div key={c.id} className="flex items-center gap-4">
                    <span className="w-24">{c.icon} {c.name}</span>
                    <input
                      type="number"
                      placeholder="0"
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
            </div>
          </div>
        );
      case 'danger':
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-rust-400">Danger Zone</h3>
            <Button variant="danger" onClick={() => { if (confirm('Leave household?')) { supabase.from('profiles').update({ household_id: null }).eq('id', user.id); showToast('Left household', 'info'); } }}>Leave Household</Button>
            <Button variant="danger" onClick={signOut}>Sign Out</Button>
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
        <div className="space-y-1">
          {['profile', 'household', 'members', 'categories', 'tags', 'budgets', 'danger'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab ? 'bg-olive-600/20 text-olive-400' : 'text-neutral-400 hover:text-white'}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="lg:col-span-3">
          <Card>{renderTab()}</Card>
        </div>
      </div>
    </motion.div>
  );
}