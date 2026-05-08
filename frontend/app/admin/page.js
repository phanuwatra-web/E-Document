'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';

const StatusBadge = ({ signed, total }) => {
  const pct = total > 0 ? Math.round((signed / total) * 100) : 0;
  const all = signed >= total && total > 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-2 w-24">
        <div
          className={`h-2 rounded-full transition-all ${all ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-semibold ${all ? 'text-green-700' : 'text-blue-700'}`}>
        {signed}/{total}
      </span>
    </div>
  );
};

export default function AdminDashboard() {
  const router = useRouter();
  const [user,        setUser]        = useState(null);
  const [documents,   setDocuments]   = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [statusMap,   setStatusMap]   = useState({});
  const [activeDoc,   setActiveDoc]   = useState(null);
  const [deleting,    setDeleting]    = useState(null);

  useEffect(() => {
    // Auth is now driven by the httpOnly cookie; the cached user is just a
    // display hint. A 401 from any subsequent API call kicks us to /login.
    const u = localStorage.getItem('user');
    if (!u) { router.replace('/login'); return; }
    const parsed = JSON.parse(u);
    if (parsed.role !== 'admin') { router.replace('/dashboard'); return; }
    setUser(parsed);
    Promise.all([
      api.get('/documents').then(r => setDocuments(r.data)).catch(() => {}),
      api.get('/users/departments').then(r => setDepartments(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const viewStatus = async (doc) => {
    setActiveDoc(doc);
    if (!statusMap[doc.id]) {
      try {
        const res = await api.get(`/documents/${doc.id}/status`);
        setStatusMap(prev => ({ ...prev, [doc.id]: res.data }));
      } catch {}
    }
  };

  const handleDownload = async (doc) => {
    try {
      const res = await api.get(`/documents/${doc.id}/file?download=1&_t=${Date.now()}`, {
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(res.data);
      const a       = document.createElement('a');
      a.href        = blobUrl;
      a.download    = doc.original_name || `document-${doc.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to download');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await api.delete(`/documents/${id}`);
      setDocuments(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
    setDeleting(null);
  };

  // Stats
  const totalDocs    = documents.length;
  const totalSigned  = documents.reduce((a, d) => a + Number(d.signed_count || 0), 0);
  const totalPending = documents.reduce((a, d) => a + (Number(d.total_assignees || 0) - Number(d.signed_count || 0)), 0);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-500">Loading…</div></div>;

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Documents', value: totalDocs,    color: 'text-blue-700',   bg: 'bg-blue-50' },
            { label: 'Pending Signatures', value: totalPending, color: 'text-yellow-700', bg: 'bg-yellow-50' },
            { label: 'Completed Signatures', value: totalSigned, color: 'text-green-700',  bg: 'bg-green-50' },
            { label: 'Departments', value: departments.length, color: 'text-purple-700', bg: 'bg-purple-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-5 shadow-sm`}>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-gray-600 text-sm mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">Documents</h2>
          <Link
            href="/admin/upload"
            className="px-4 py-2 bg-blue-800 text-white text-sm rounded-lg hover:bg-blue-900 transition"
          >
            + Upload Document
          </Link>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {documents.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-5xl mb-3">📂</p>
              <p className="text-sm">No documents uploaded yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-gray-600 uppercase text-xs tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left">Title</th>
                  <th className="px-5 py-3 text-left">Department</th>
                  <th className="px-5 py-3 text-left">Uploaded By</th>
                  <th className="px-5 py-3 text-left">Date</th>
                  <th className="px-5 py-3 text-left">Signatures</th>
                  <th className="px-5 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {documents.map(doc => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4 font-medium text-gray-900 max-w-[220px] truncate">
                      {doc.title}
                    </td>
                    <td className="px-5 py-4 text-gray-600">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">
                        {doc.department_name || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-600">{doc.uploaded_by_name || '—'}</td>
                    <td className="px-5 py-4 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(doc.created_at).toLocaleDateString('th-TH')}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge signed={Number(doc.signed_count)} total={Number(doc.total_assignees)} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2 flex-wrap">
                        <Link
                          href={`/dashboard/document/${doc.id}`}
                          className="px-3 py-1 bg-gray-100 text-gray-800 rounded-lg text-xs hover:bg-gray-200 transition"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => viewStatus(doc)}
                          className="px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs hover:bg-blue-200 transition"
                        >
                          Status
                        </button>
                        <button
                          onClick={() => handleDownload(doc)}
                          className="px-3 py-1 bg-green-100 text-green-800 rounded-lg text-xs hover:bg-green-200 transition"
                          title="Download PDF with signatures"
                        >
                          ⬇ Download
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          disabled={deleting === doc.id}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-xs hover:bg-red-200 transition disabled:opacity-50"
                        >
                          {deleting === doc.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Status Modal */}
      {activeDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="font-bold text-gray-900">{activeDoc.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">Signing status</p>
              </div>
              <button onClick={() => setActiveDoc(null)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {!statusMap[activeDoc.id] ? (
                <p className="text-center text-gray-400 py-8 text-sm">Loading…</p>
              ) : statusMap[activeDoc.id].length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">No assignees</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase border-b">
                    <tr>
                      <th className="pb-2 text-left">Employee</th>
                      <th className="pb-2 text-left">Status</th>
                      <th className="pb-2 text-left">Signed At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {statusMap[activeDoc.id].map((row, i) => (
                      <tr key={i}>
                        <td className="py-2.5">
                          <p className="font-medium text-gray-900">{row.name}</p>
                          <p className="text-xs text-gray-400">{row.employee_id}</p>
                        </td>
                        <td className="py-2.5">
                          {row.status === 'signed' ? (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                              ✓ Signed
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                              ⏳ Pending
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-xs text-gray-500">
                          {row.signed_at
                            ? new Date(row.signed_at).toLocaleString('th-TH')
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
