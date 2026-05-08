'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';

export default function UsersPage() {
  const router = useRouter();
  const [user,        setUser]        = useState(null);
  const [users,       setUsers]       = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState({ employee_id:'', name:'', email:'', password:'', role:'user', department_id:'' });
  const [formError,   setFormError]   = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [deleting,    setDeleting]    = useState(null);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.replace('/login'); return; }
    const parsed = JSON.parse(u);
    if (parsed.role !== 'admin') { router.replace('/dashboard'); return; }
    setUser(parsed);
    Promise.all([
      api.get('/users').then(r => setUsers(r.data)),
      api.get('/users/departments').then(r => setDepartments(r.data)),
    ]).finally(() => setLoading(false));
  }, []);

  const handleToggle = async (id) => {
    try {
      const res = await api.patch(`/users/${id}/toggle`);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: res.data.is_active } : u));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  const handleDelete = async (target) => {
    if (target.id === user?.id) {
      alert('Cannot delete your own account');
      return;
    }
    const ok = confirm(
      `Delete ${target.name} (${target.employee_id})?\n\n` +
      `This will permanently remove the user and all their signatures.\n` +
      `If they uploaded any documents, the deletion will be refused.\n\n` +
      `This cannot be undone.`
    );
    if (!ok) return;

    setDeleting(target.id);
    try {
      await api.delete(`/users/${target.id}`);
      setUsers(prev => prev.filter(u => u.id !== target.id));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user');
    } finally {
      setDeleting(null);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const res = await api.post('/users', form);
      setUsers(prev => [res.data, ...prev]);
      setShowForm(false);
      setForm({ employee_id:'', name:'', email:'', password:'', role:'user', department_id:'' });
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar user={user} />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin" className="text-blue-700 text-sm hover:underline">← Dashboard</Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">User Management</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-800 text-white text-sm rounded-lg hover:bg-blue-900 transition"
          >
            + Add User
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="font-bold text-gray-800 mb-4">New User</h2>
            {formError && <p className="text-red-600 text-sm mb-3 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>}
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              {[
                { key:'employee_id', label:'Employee ID', placeholder:'EMP-009', transform: v => v.toUpperCase() },
                { key:'name',        label:'Full Name',   placeholder:'John Doe' },
                { key:'email',       label:'Email',       placeholder:'john@company.com', type:'email' },
                { key:'password',    label:'Password',    placeholder:'Min 8 chars',       type:'password' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                  <input
                    type={f.type || 'text'}
                    value={form[f.key]}
                    onChange={e => setForm({ ...form, [f.key]: f.transform ? f.transform(e.target.value) : e.target.value })}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
                <select value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— No Department —</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="col-span-2 flex gap-3 mt-2">
                <button type="submit" disabled={submitting} className="px-5 py-2 bg-blue-800 text-white text-sm rounded-lg disabled:opacity-50">
                  {submitting ? 'Creating…' : 'Create User'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 border text-gray-600 text-sm rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Employee</th>
                <th className="px-5 py-3 text-left">Email</th>
                <th className="px-5 py-3 text-left">Department</th>
                <th className="px-5 py-3 text-left">Role</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{u.name}</p>
                    <p className="text-xs text-gray-400">{u.employee_id}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{u.email}</td>
                  <td className="px-5 py-3 text-gray-600">{u.department_name || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-3 items-center">
                      <button
                        onClick={() => handleToggle(u.id)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        disabled={deleting === u.id || u.id === user?.id}
                        className="text-xs text-red-600 hover:underline disabled:opacity-30 disabled:no-underline disabled:cursor-not-allowed"
                        title={u.id === user?.id ? 'Cannot delete your own account' : 'Permanently delete this user'}
                      >
                        {deleting === u.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
