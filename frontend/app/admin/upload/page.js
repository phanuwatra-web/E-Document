'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';

export default function UploadPage() {
  const router = useRouter();
  const [user,        setUser]        = useState(null);
  const [departments, setDepartments] = useState([]);
  const [form,        setForm]        = useState({ title: '', description: '', department_id: '' });
  const [file,        setFile]        = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.replace('/login'); return; }
    const parsed = JSON.parse(u);
    if (parsed.role !== 'admin') { router.replace('/dashboard'); return; }
    setUser(parsed);
    api.get('/users/departments').then(res => setDepartments(res.data)).catch(() => {});
  }, []);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (f && f.type !== 'application/pdf') {
      setError('Only PDF files are allowed');
      setFile(null);
      e.target.value = '';
      return;
    }
    setFile(f || null);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!file) { setError('Please select a PDF file'); return; }
    if (!form.department_id) { setError('Please select a department'); return; }

    setLoading(true);
    try {
      const data = new FormData();
      data.append('file',          file);
      data.append('title',         form.title);
      data.append('description',   form.description);
      data.append('department_id', form.department_id);

      const res = await api.post('/documents', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSuccess(`Document uploaded! ${res.data.notified_users} users notified by email.`);
      setForm({ title: '', description: '', department_id: '' });
      setFile(null);
      document.getElementById('fileInput').value = '';
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar user={user} />

      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-6">
          <Link href="/admin" className="text-blue-700 hover:underline text-sm">← Back to Dashboard</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">Upload Document</h1>
          <p className="text-gray-500 text-sm mt-1">
            Upload a PDF and assign it to a department. All users in that department will be notified by email.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          {success && (
            <div className="mb-5 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              ✓ {success}
            </div>
          )}
          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PDF File <span className="text-red-500">*</span>
              </label>
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition cursor-pointer"
                onClick={() => document.getElementById('fileInput').click()}
              >
                {file ? (
                  <div>
                    <p className="text-blue-700 font-medium text-sm">📄 {file.name}</p>
                    <p className="text-xs text-gray-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-400 text-sm">Click to select PDF or drag & drop</p>
                    <p className="text-gray-300 text-xs mt-1">Max 10 MB</p>
                  </div>
                )}
              </div>
              <input
                id="fileInput"
                type="file"
                accept="application/pdf"
                onChange={handleFile}
                className="hidden"
              />
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Document Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Q2 2025 Policy Update"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description of this document (optional)"
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
            </div>

            {/* Department */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assign to Department <span className="text-red-500">*</span>
              </label>
              <select
                value={form.department_id}
                onChange={e => setForm({ ...form, department_id: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                required
              >
                <option value="">Select department…</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.user_count} users)
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-800 hover:bg-blue-900 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50"
            >
              {loading ? 'Uploading…' : 'Upload & Notify Department'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
