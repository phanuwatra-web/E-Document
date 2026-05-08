'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';

/* Mirrors backend/src/utils/password.js — keep both in sync. The check runs
   on every keystroke so the user sees a live checklist instead of submitting
   blind. The server STILL validates on its own (never trust the client). */
const checkRules = (pw) => ({
  length: pw.length >= 8,
  upper:  /[A-Z]/.test(pw),
  lower:  /[a-z]/.test(pw),
  digit:  /[0-9]/.test(pw),
  symbol: /[^A-Za-z0-9]/.test(pw),
});

const RULE_LABELS = [
  { key: 'length', text: 'อย่างน้อย 8 ตัวอักษร' },
  { key: 'upper',  text: 'ตัวอักษรพิมพ์ใหญ่ (A-Z)' },
  { key: 'lower',  text: 'ตัวอักษรพิมพ์เล็ก (a-z)' },
  { key: 'digit',  text: 'ตัวเลข (0-9)' },
  { key: 'symbol', text: 'อักขระพิเศษ (เช่น ! @ # $)' },
];

export default function ChangePasswordPage() {
  const router = useRouter();
  const [user, setUser]             = useState(null);
  const [form, setForm]             = useState({ current: '', next: '', confirm: '' });
  const [showRules, setShowRules]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.replace('/login'); return; }
    setUser(JSON.parse(u));
  }, []);

  const rules        = checkRules(form.next);
  const allRulesPass = Object.values(rules).every(Boolean);
  const matches      = form.next.length > 0 && form.next === form.confirm;
  const canSubmit    = form.current && allRulesPass && matches && !submitting;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      await api.post('/auth/change-password', {
        current_password: form.current,
        new_password:     form.next,
      });
      setSuccess(true);
      // Server cleared cookies → next API call will 401. Wipe cached
      // display data and bounce to login after a short pause so the user
      // sees the success message.
      try { localStorage.removeItem('user'); } catch {}
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      // Backend may return either a single error string or a list.
      const data   = err.response?.data;
      const errors = data?.errors;
      setError(
        Array.isArray(errors) && errors.length > 1
          ? errors.join(' · ')
          : (data?.error || 'Failed to change password')
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  if (success) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar user={user} />
        <main className="max-w-md mx-auto px-4 py-16">
          <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
            <div className="text-5xl mb-3">✅</div>
            <h2 className="text-lg font-bold text-green-800">Password changed</h2>
            <p className="text-sm text-green-700 mt-2">
              เปลี่ยนรหัสผ่านสำเร็จ กำลังพาคุณไปยังหน้า login…
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar user={user} />
      <main className="max-w-md mx-auto px-4 py-10">
        <Link href={user.role === 'admin' ? '/admin' : '/dashboard'}
              className="text-blue-700 text-sm hover:underline">
          ← Back
        </Link>

        <div className="bg-white rounded-xl shadow-sm p-6 mt-4">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Change Password</h1>
          <p className="text-sm text-gray-500 mb-6">
            หลังเปลี่ยนรหัสผ่านสำเร็จ ระบบจะให้คุณ login ใหม่
          </p>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current password
              </label>
              <input
                type="password"
                value={form.current}
                onChange={(e) => setForm({ ...form, current: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm
                           focus:ring-2 focus:ring-blue-500 outline-none"
                autoComplete="current-password"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New password
              </label>
              <input
                type="password"
                value={form.next}
                onChange={(e) => setForm({ ...form, next: e.target.value })}
                onFocus={() => setShowRules(true)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm
                           focus:ring-2 focus:ring-blue-500 outline-none"
                autoComplete="new-password"
                required
              />

              {(showRules || form.next.length > 0) && (
                <ul className="mt-2 text-xs space-y-0.5">
                  {RULE_LABELS.map(r => (
                    <li key={r.key}
                        className={rules[r.key] ? 'text-green-700' : 'text-gray-500'}>
                      {rules[r.key] ? '✓' : '○'} {r.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm new password
              </label>
              <input
                type="password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none
                            focus:ring-2 focus:ring-blue-500 ${
                              form.confirm && !matches
                                ? 'border-red-300'
                                : 'border-gray-300'
                            }`}
                autoComplete="new-password"
                required
              />
              {form.confirm.length > 0 && !matches && (
                <p className="mt-1 text-xs text-red-600">รหัสผ่านไม่ตรงกัน</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-2.5 bg-blue-800 hover:bg-blue-900 text-white
                         font-semibold rounded-lg text-sm transition disabled:opacity-50
                         disabled:cursor-not-allowed"
            >
              {submitting ? 'กำลังเปลี่ยน…' : 'Change Password'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
