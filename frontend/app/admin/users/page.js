'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Pencil, KeyRound, Power, Trash2, X, Loader2,
  Users as UsersIcon, Search, Shield, Mail, Hash, Lock, Building2,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import Pagination from '@/components/Pagination';
import api from '@/lib/api';

const RoleBadge = ({ role }) => (
  <span className={`badge ${role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
    {role === 'admin' && <Shield size={11} />} {role}
  </span>
);

const StatusBadge = ({ active }) => (
  <span className={`badge ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-red-500'}`} />
    {active ? 'Active' : 'Inactive'}
  </span>
);

const Avatar = ({ name }) => {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 grid place-items-center text-white text-xs font-semibold flex-shrink-0">
      {initials}
    </div>
  );
};

const TableSkeleton = () => (
  <div className="card overflow-hidden">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex gap-4 p-4 border-b border-slate-100 last:border-0 items-center">
        <div className="skeleton h-9 w-9 rounded-full" />
        <div className="skeleton h-4 w-1/4" />
        <div className="skeleton h-4 w-1/6" />
        <div className="skeleton h-4 w-1/6" />
        <div className="skeleton h-4 w-1/6" />
      </div>
    ))}
  </div>
);

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
  const [editing,     setEditing]     = useState(null);
  const [editForm,    setEditForm]    = useState({ name:'', email:'', department_id:'', role:'user' });
  const [editError,   setEditError]   = useState('');
  const [editSaving,  setEditSaving]  = useState(false);
  const [search,      setSearch]      = useState('');
  const [page,        setPage]        = useState(1);
  const LIMIT = 20;

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

  const handleToggle = async (target) => {
    try {
      const res = await api.patch(`/users/${target.id}/toggle`);
      setUsers(prev => prev.map(u => u.id === target.id ? { ...u, is_active: res.data.is_active } : u));
      toast.success(`${res.data.is_active ? 'เปิด' : 'ปิด'}การใช้งาน ${target.name} แล้ว`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const handleDelete = async (target) => {
    if (target.id === user?.id) {
      toast.error('Cannot delete your own account');
      return;
    }
    const ok = confirm(
      `ลบผู้ใช้ ${target.name} (${target.employee_id})?\n\n` +
      `จะลบลายเซ็นของผู้ใช้คนนี้ทั้งหมดด้วย\n` +
      `ถ้าผู้ใช้คนนี้เป็นคนอัพโหลดเอกสาร — ระบบจะปฏิเสธการลบ\n\n` +
      `การลบไม่สามารถย้อนกลับได้`
    );
    if (!ok) return;

    setDeleting(target.id);
    try {
      await api.delete(`/users/${target.id}`);
      setUsers(prev => prev.filter(u => u.id !== target.id));
      toast.success(`ลบผู้ใช้ ${target.name} แล้ว`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete user');
    } finally {
      setDeleting(null);
    }
  };

  const openEdit = (u) => {
    setEditing(u);
    setEditForm({
      name:          u.name || '',
      email:         u.email || '',
      department_id: u.department_id ? String(u.department_id) : '',
      role:          u.role || 'user',
    });
    setEditError('');
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditSaving(true);
    try {
      const payload = {
        name:          editForm.name,
        email:         editForm.email,
        department_id: editForm.department_id ? parseInt(editForm.department_id) : null,
        role:          editForm.role,
      };
      const res = await api.patch(`/users/${editing.id}`, payload);
      setUsers(prev => prev.map(u => u.id === editing.id
        ? { ...u, ...res.data, department_name: departments.find(d => d.id === res.data.department_id)?.name || null }
        : u
      ));
      toast.success(`บันทึกข้อมูลของ ${res.data.name} แล้ว`);
      setEditing(null);
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to update user');
    } finally {
      setEditSaving(false);
    }
  };

  const handleResetPassword = async (target) => {
    const pw = prompt(
      `ตั้งรหัสผ่านใหม่สำหรับ ${target.name} (${target.employee_id})\n\n` +
      `แจ้งให้ผู้ใช้ login แล้วเปลี่ยนรหัสที่ /account/change-password ทันที\n` +
      `อย่างน้อย 8 ตัวอักษร, ห้ามเหมือน employee ID`
    );
    if (!pw) return;
    try {
      await api.post(`/users/${target.id}/reset-password`, { new_password: pw });
      toast.success(`รีเซ็ตรหัสผ่านของ ${target.name} แล้ว`, { description: 'ส่งรหัสใหม่ให้ผู้ใช้อย่างปลอดภัย' });
    } catch (err) {
      const msg = err.response?.data?.errors?.join('\n') || err.response?.data?.error || 'Failed to reset password';
      toast.error(msg);
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
      toast.success(`สร้างผู้ใช้ ${res.data.name} แล้ว`);
    } catch (err) {
      setFormError(err.response?.data?.errors?.join(', ') || err.response?.data?.error || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.employee_id || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.department_name || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  useEffect(() => { setPage(1); }, [search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / LIMIT));
  const pageItems  = filtered.slice((page - 1) * LIMIT, page * LIMIT);

  const stats = useMemo(() => ({
    total:    users.length,
    admins:   users.filter(u => u.role === 'admin').length,
    active:   users.filter(u => u.is_active).length,
  }), [users]);

  return (
    <div className="min-h-screen">
      <Navbar user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Link href="/admin"
          className="inline-flex items-center gap-1.5 text-brand-700 text-sm hover:underline mb-4">
          <ArrowLeft size={14} /> Dashboard
        </Link>

        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <UsersIcon className="text-brand-700" size={26} />
              จัดการผู้ใช้
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {stats.total} คน · {stats.admins} admin · {stats.active} active
            </p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus size={16} /> เพิ่มผู้ใช้ใหม่
          </button>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-slate-800 flex items-center gap-2">
                    <Plus size={18} className="text-brand-700" /> ผู้ใช้ใหม่
                  </h2>
                  <button onClick={() => setShowForm(false)} className="p-1 hover:bg-slate-100 rounded">
                    <X size={16} className="text-slate-400" />
                  </button>
                </div>
                {formError && (
                  <p className="text-red-600 text-sm mb-4 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>
                )}
                <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field icon={Hash} label="Employee ID" value={form.employee_id}
                    onChange={v => setForm({ ...form, employee_id: v.toUpperCase() })}
                    placeholder="EMP-009" required />
                  <Field icon={UsersIcon} label="ชื่อ-นามสกุล" value={form.name}
                    onChange={v => setForm({ ...form, name: v })}
                    placeholder="สมชาย ใจดี" required />
                  <Field icon={Mail} label="อีเมล" type="email" value={form.email}
                    onChange={v => setForm({ ...form, email: v })}
                    placeholder="somchai@company.com" required />
                  <Field icon={Lock} label="รหัสผ่าน" type="password" value={form.password}
                    onChange={v => setForm({ ...form, password: v })}
                    placeholder="อย่างน้อย 8 ตัว" required />
                  <SelectField icon={Shield} label="บทบาท" value={form.role}
                    onChange={v => setForm({ ...form, role: v })}
                    options={[{ value:'user', label:'User' }, { value:'admin', label:'Admin' }]} />
                  <SelectField icon={Building2} label="แผนก" value={form.department_id}
                    onChange={v => setForm({ ...form, department_id: v })}
                    options={[{ value:'', label:'— ไม่ระบุ —' }, ...departments.map(d => ({ value: d.id, label: d.name }))]} />

                  <div className="sm:col-span-2 flex gap-3 mt-2">
                    <button type="submit" disabled={submitting} className="btn-primary">
                      {submitting ? <><Loader2 size={14} className="animate-spin" /> กำลังสร้าง…</>
                                  : <><Plus size={14} /> สร้างผู้ใช้</>}
                    </button>
                    <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                      ยกเลิก
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search */}
        <div className="relative mb-3 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาผู้ใช้..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
        </div>

        {loading ? <TableSkeleton /> : (
          <div className="card overflow-hidden">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <UsersIcon size={48} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm">{search ? 'ไม่พบผู้ใช้ที่ค้นหา' : 'ยังไม่มีผู้ใช้'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-5 py-3 text-left">Employee</th>
                      <th className="px-5 py-3 text-left">Email</th>
                      <th className="px-5 py-3 text-left">Department</th>
                      <th className="px-5 py-3 text-left">Role</th>
                      <th className="px-5 py-3 text-left">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageItems.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.name} />
                            <div>
                              <p className="font-medium text-slate-900">{u.name}</p>
                              <p className="text-xs text-slate-400">{u.employee_id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-600">{u.email}</td>
                        <td className="px-5 py-3 text-slate-600">
                          {u.department_name
                            ? <span className="badge bg-brand-50 text-brand-700"><Building2 size={11}/> {u.department_name}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-5 py-3"><RoleBadge role={u.role} /></td>
                        <td className="px-5 py-3"><StatusBadge active={u.is_active} /></td>
                        <td className="px-5 py-3">
                          <div className="flex gap-1 justify-end">
                            <IconBtn onClick={() => openEdit(u)} icon={Pencil} title="Edit" hoverColor="hover:text-brand-700 hover:bg-brand-50" />
                            <IconBtn onClick={() => handleResetPassword(u)} icon={KeyRound} title="Reset Password" hoverColor="hover:text-amber-700 hover:bg-amber-50" />
                            <IconBtn onClick={() => handleToggle(u)} icon={Power} title={u.is_active ? 'Deactivate' : 'Activate'} hoverColor="hover:text-blue-700 hover:bg-blue-50" />
                            <IconBtn onClick={() => handleDelete(u)} icon={Trash2}
                              disabled={deleting === u.id || u.id === user?.id} title="Delete"
                              hoverColor="hover:text-red-700 hover:bg-red-50" loading={deleting === u.id} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {filtered.length > LIMIT && (
              <div className="px-5 py-3 border-t border-slate-100">
                <Pagination page={page} totalPages={totalPages} total={filtered.length} limit={LIMIT}
                  onPageChange={setPage} />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Edit modal */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setEditing(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <Avatar name={editing.name} />
                  <div>
                    <h3 className="font-bold text-slate-900">แก้ไขข้อมูลผู้ใช้</h3>
                    <p className="text-xs text-slate-500 mt-0.5">รหัสพนักงาน {editing.employee_id} (เปลี่ยนไม่ได้)</p>
                  </div>
                </div>
                <button onClick={() => setEditing(null)} className="p-1.5 hover:bg-slate-100 rounded-md transition">
                  <X size={18} className="text-slate-500" />
                </button>
              </div>
              <form onSubmit={handleEditSave} className="p-6 space-y-4">
                {editError && (
                  <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{editError}</p>
                )}
                <Field icon={UsersIcon} label="ชื่อ-นามสกุล" value={editForm.name} required
                  onChange={v => setEditForm({ ...editForm, name: v })} />
                <Field icon={Mail} label="อีเมล" type="email" value={editForm.email} required
                  onChange={v => setEditForm({ ...editForm, email: v })} />
                <SelectField icon={Building2} label="แผนก" value={editForm.department_id}
                  onChange={v => setEditForm({ ...editForm, department_id: v })}
                  options={[{ value:'', label:'— ไม่ระบุ —' }, ...departments.map(d => ({ value: d.id, label: d.name }))]} />
                <SelectField icon={Shield} label="บทบาท" value={editForm.role}
                  onChange={v => setEditForm({ ...editForm, role: v })}
                  disabled={editing.id === user?.id}
                  options={[{ value:'user', label:'User' }, { value:'admin', label:'Admin' }]}
                  hint={editing.id === user?.id ? 'คุณไม่สามารถเปลี่ยน role ของตัวเองได้' : null} />

                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={editSaving} className="btn-primary flex-1">
                    {editSaving ? <><Loader2 size={14} className="animate-spin" /> กำลังบันทึก…</>
                                : 'บันทึกการเปลี่ยนแปลง'}
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="btn-secondary">
                    ยกเลิก
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const Field = ({ icon: Icon, label, value, onChange, placeholder, type = 'text', required }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}{required && <span className="text-red-500"> *</span>}</label>
    <div className="relative">
      {Icon && <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />}
      <input
        type={type} value={value} required={required}
        onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full ${Icon ? 'pl-9' : 'pl-3'} pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none`}
      />
    </div>
  </div>
);

const SelectField = ({ icon: Icon, label, value, onChange, options, disabled, hint }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
    <div className="relative">
      {Icon && <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />}
      <select
        value={value} disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className={`w-full ${Icon ? 'pl-9' : 'pl-3'} pr-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-500`}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
    {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
  </div>
);

const IconBtn = ({ icon: Icon, onClick, title, hoverColor = 'hover:text-brand-700 hover:bg-brand-50', disabled, loading }) => (
  <button onClick={onClick} disabled={disabled} title={title}
    className={`p-2 text-slate-500 rounded-md transition disabled:opacity-30 disabled:cursor-not-allowed ${hoverColor}`}>
    {loading ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
  </button>
);
