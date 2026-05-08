'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm]       = useState({ employee_id: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  // Bootstrap a CSRF cookie BEFORE the user submits. Without this, the very
  // first POST /auth/login would have no csrf_token cookie to echo and would
  // fail the CSRF check (login is exempt server-side, but we still keep this
  // pattern so subsequent POSTs after login also succeed without a refresh).
  useEffect(() => {
    api.get('/auth/csrf-token').catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', form);
      // No more localStorage.setItem('token', ...) — the JWT is in an
      // httpOnly cookie now and JS can't (and shouldn't) touch it.
      // We DO cache non-secret display info for instant UI render.
      localStorage.setItem('user', JSON.stringify(res.data.user));
      router.push(res.data.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl mb-3">
            <svg className="w-9 h-9 text-blue-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">DocSign</h1>
          <p className="text-gray-500 text-sm mt-1">ระบบจัดการเอกสารและลายเซ็นดิจิทัล</p>
        </div>

        {error && (
          <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
            <input
              type="text"
              value={form.employee_id}
              onChange={(e) => setForm({ ...form, employee_id: e.target.value.toUpperCase() })}
              placeholder="EMP-001"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-800 hover:bg-blue-900 text-white font-semibold rounded-lg transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Internal use only · Contact IT for support
        </p>
      </div>
    </div>
  );
}
