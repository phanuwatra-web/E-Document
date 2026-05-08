'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';

export default function UserDashboard() {
  const router = useRouter();
  const [user,      setUser]      = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('all'); // 'all' | 'pending' | 'signed'

  useEffect(() => {
    // We can't read the auth_token (httpOnly). Treat the cached user blob as
    // a hint for instant render; the API call below is the real auth check —
    // a 401 will redirect to /login via the axios interceptor.
    const u = localStorage.getItem('user');
    if (!u) { router.replace('/login'); return; }
    const parsed = JSON.parse(u);
    if (parsed.role === 'admin') { router.replace('/admin'); return; }
    setUser(parsed);
    api.get('/documents')
      .then(res => setDocuments(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all'
    ? documents
    : documents.filter(d => d.my_status === filter);

  const pending = documents.filter(d => d.my_status === 'pending').length;
  const signed  = documents.filter(d => d.my_status === 'signed').length;

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar user={user} />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome, {user?.name} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {user?.department_name} · {user?.employee_id}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Documents',    value: documents.length, color: 'text-blue-700',   bg: 'bg-blue-50',   key: 'all' },
            { label: 'Pending Signatures', value: pending,          color: 'text-yellow-700', bg: 'bg-yellow-50', key: 'pending' },
            { label: 'Signed',             value: signed,           color: 'text-green-700',  bg: 'bg-green-50',  key: 'signed' },
          ].map(s => (
            <button
              key={s.key}
              onClick={() => setFilter(s.key)}
              className={`${s.bg} rounded-xl p-4 text-left transition ring-2 ${filter === s.key ? 'ring-blue-500' : 'ring-transparent'} hover:ring-blue-300`}
            >
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-gray-600 text-xs mt-1">{s.label}</p>
            </button>
          ))}
        </div>

        {/* Documents */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center text-gray-400">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-sm">No documents here.</p>
            </div>
          ) : (
            filtered.map(doc => (
              <Link key={doc.id} href={`/dashboard/document/${doc.id}`}>
                <div className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition flex items-center justify-between cursor-pointer group">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      doc.my_status === 'signed' ? 'bg-green-100' : 'bg-yellow-100'
                    }`}>
                      <span className="text-lg">{doc.my_status === 'signed' ? '✅' : '📄'}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 group-hover:text-blue-700 transition">
                        {doc.title}
                      </p>
                      {doc.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{doc.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {doc.department_name} · Uploaded {new Date(doc.created_at).toLocaleDateString('th-TH')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      doc.my_status === 'signed'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {doc.my_status === 'signed' ? '✓ Signed' : '⏳ Pending'}
                    </span>
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
