'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import {
  FileText, Clock, CheckCircle2, Building2, Plus, Eye, Download,
  Trash2, BarChart3, X, Search, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, subDays, startOfDay, isAfter } from 'date-fns';
import Navbar from '@/components/Navbar';
import PrivacyConsentModal from '@/components/PrivacyConsentModal';
import api from '@/lib/api';

const KpiCard = ({ icon: Icon, label, value, hint, accent }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="card p-5 card-hover"
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <p className={`text-3xl font-bold mt-1.5 ${accent}`}>{value}</p>
        {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
      </div>
      <div className={`p-2.5 rounded-lg ${accent.replace('text-', 'bg-').replace('-700', '-50')}`}>
        <Icon className={accent} size={22} strokeWidth={2.2} />
      </div>
    </div>
  </motion.div>
);

const StatusBar = ({ signed, total }) => {
  const pct = total > 0 ? Math.round((signed / total) * 100) : 0;
  const all = signed >= total && total > 0;
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div className="flex-1 bg-slate-200 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${all ? 'bg-emerald-500' : 'bg-brand-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${all ? 'text-emerald-700' : 'text-brand-700'}`}>
        {signed}/{total}
      </span>
    </div>
  );
};

const TableSkeleton = () => (
  <div className="card overflow-hidden">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex gap-4 p-4 border-b border-slate-100 last:border-0">
        <div className="skeleton h-4 w-1/4" />
        <div className="skeleton h-4 w-1/6" />
        <div className="skeleton h-4 w-1/6" />
        <div className="skeleton h-4 w-1/6" />
        <div className="skeleton h-4 w-1/4" />
      </div>
    ))}
  </div>
);

export default function AdminDashboard() {
  const router = useRouter();
  const [user,        setUser]        = useState(null);
  const [documents,   setDocuments]   = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [statusMap,   setStatusMap]   = useState({});
  const [activeDoc,   setActiveDoc]   = useState(null);
  const [deleting,    setDeleting]    = useState(null);
  const [search,      setSearch]      = useState('');

  useEffect(() => {
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
    const t = toast.loading(`กำลังดาวน์โหลด ${doc.title}…`);
    try {
      const res = await api.get(`/documents/${doc.id}/file?download=1&_t=${Date.now()}`, {
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = doc.original_name || `document-${doc.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      toast.success('ดาวน์โหลดสำเร็จ', { id: t });
    } catch (err) {
      toast.error(err.response?.data?.error || 'ดาวน์โหลดไม่สำเร็จ', { id: t });
    }
  };

  const handleDelete = async (doc) => {
    if (!confirm(`ลบเอกสาร "${doc.title}"?\n\nการลบไม่สามารถย้อนกลับได้`)) return;
    setDeleting(doc.id);
    try {
      await api.delete(`/documents/${doc.id}`);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast.success('ลบเอกสารแล้ว');
    } catch (err) {
      toast.error(err.response?.data?.error || 'ลบไม่สำเร็จ');
    }
    setDeleting(null);
  };

  const stats = useMemo(() => {
    const totalDocs    = documents.length;
    const totalSigned  = documents.reduce((a, d) => a + Number(d.signed_count || 0), 0);
    const totalPending = documents.reduce((a, d) => a + (Number(d.total_assignees || 0) - Number(d.signed_count || 0)), 0);
    const totalAssigned = totalSigned + totalPending;
    const completionPct = totalAssigned > 0 ? Math.round((totalSigned / totalAssigned) * 100) : 0;
    return { totalDocs, totalSigned, totalPending, completionPct };
  }, [documents]);

  const byDept = useMemo(() => {
    const map = {};
    documents.forEach(d => {
      const dept = d.department_name || 'อื่นๆ';
      if (!map[dept]) map[dept] = { dept, signed: 0, pending: 0 };
      map[dept].signed  += Number(d.signed_count || 0);
      map[dept].pending += Number(d.total_assignees || 0) - Number(d.signed_count || 0);
    });
    return Object.values(map);
  }, [documents]);

  const byDay = useMemo(() => {
    const days = [...Array(14)].map((_, i) => {
      const d = startOfDay(subDays(new Date(), 13 - i));
      return { date: d, label: format(d, 'd/M'), count: 0 };
    });
    documents.forEach(d => {
      const created = new Date(d.created_at);
      for (let i = days.length - 1; i >= 0; i--) {
        if (isAfter(created, days[i].date) || created.getTime() === days[i].date.getTime()) {
          days[i].count++;
          break;
        }
      }
    });
    return days;
  }, [documents]);

  const donutData = useMemo(() => ([
    { name: 'เซ็นแล้ว', value: stats.totalSigned },
    { name: 'รอเซ็น',   value: stats.totalPending },
  ]), [stats]);

  const filtered = useMemo(() => {
    if (!search) return documents;
    const q = search.toLowerCase();
    return documents.filter(d =>
      (d.title || '').toLowerCase().includes(q) ||
      (d.department_name || '').toLowerCase().includes(q) ||
      (d.uploaded_by_name || '').toLowerCase().includes(q)
    );
  }, [documents, search]);

  const needsConsent = user && !user.privacy_accepted_at;

  return (
    <div className="min-h-screen">
      <Navbar user={user} />

      {needsConsent && (
        <PrivacyConsentModal
          user={user}
          onAccepted={(acceptedAt) =>
            setUser(prev => ({ ...prev, privacy_accepted_at: acceptedAt }))
          }
        />
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="text-brand-700" size={26} />
              ภาพรวมระบบ
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">สรุปสถานะการลงนามเอกสารทั้งหมด</p>
          </div>
          <Link href="/admin/upload" className="btn-primary">
            <Plus size={16} /> Upload Document
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard icon={FileText}     label="เอกสารทั้งหมด" value={stats.totalDocs}             accent="text-brand-700" />
          <KpiCard icon={Clock}        label="รอเซ็น"        value={stats.totalPending}          accent="text-amber-700" />
          <KpiCard icon={CheckCircle2} label="เซ็นแล้ว"      value={stats.totalSigned}           accent="text-emerald-700" />
          <KpiCard icon={TrendingUp}   label="อัตราการเซ็น"  value={`${stats.completionPct}%`} hint="ของงานที่มอบหมายทั้งหมด" accent="text-purple-700" />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="skeleton h-64 lg:col-span-2 rounded-xl" />
            <div className="skeleton h-64 rounded-xl" />
          </div>
        ) : documents.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="card p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">การเซ็นแยกตามแผนก</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byDept} barCategoryGap={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="dept" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                    cursor={{ fill: 'rgba(30,64,175,0.06)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="signed"  name="เซ็นแล้ว" fill="#16a34a" radius={[6,6,0,0]} />
                  <Bar dataKey="pending" name="รอเซ็น"   fill="#f59e0b" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="card p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">สถานะรวม</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                    {donutData.map((_, i) => <Cell key={i} fill={i === 0 ? '#16a34a' : '#f59e0b'} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>
          </div>
        )}

        {documents.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="card p-5 mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">เอกสารที่อัพโหลดต่อวัน (14 วันล่าสุด)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                <Line type="monotone" dataKey="count" stroke="#1d4ed8" strokeWidth={2.5}
                  dot={{ r: 3, fill: '#1d4ed8' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-slate-800">เอกสารทั้งหมด</h2>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา..."
              className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-56 focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
        </div>

        {loading ? <TableSkeleton /> : (
          <div className="card overflow-hidden">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <FileText size={48} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm">{search ? 'ไม่พบเอกสารที่ค้นหา' : 'ยังไม่มีเอกสาร — กด Upload เพื่อเริ่ม'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-xs tracking-wide">
                    <tr>
                      <th className="px-5 py-3 text-left">Title</th>
                      <th className="px-5 py-3 text-left">Department</th>
                      <th className="px-5 py-3 text-left">Uploaded By</th>
                      <th className="px-5 py-3 text-left">Date</th>
                      <th className="px-5 py-3 text-left">Signatures</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(doc => (
                      <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4 font-medium text-slate-900 max-w-[220px] truncate">{doc.title}</td>
                        <td className="px-5 py-4">
                          <span className="badge bg-brand-50 text-brand-700">
                            <Building2 size={11} /> {doc.department_name || '—'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-600">{doc.uploaded_by_name || '—'}</td>
                        <td className="px-5 py-4 text-slate-500 text-xs whitespace-nowrap">
                          {format(new Date(doc.created_at), 'dd/MM/yy HH:mm')}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBar signed={Number(doc.signed_count)} total={Number(doc.total_assignees)} />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex gap-1 justify-end">
                            <Link href={`/dashboard/document/${doc.id}`}
                              className="p-2 text-slate-600 hover:text-brand-700 hover:bg-brand-50 rounded-md transition" title="View">
                              <Eye size={16} />
                            </Link>
                            <button onClick={() => viewStatus(doc)}
                              className="p-2 text-slate-600 hover:text-brand-700 hover:bg-brand-50 rounded-md transition" title="Status">
                              <BarChart3 size={16} />
                            </button>
                            <button onClick={() => handleDownload(doc)}
                              className="p-2 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition" title="Download PDF">
                              <Download size={16} />
                            </button>
                            <button onClick={() => handleDelete(doc)} disabled={deleting === doc.id}
                              className="p-2 text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md transition disabled:opacity-30" title="Delete">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      <AnimatePresence>
        {activeDoc && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setActiveDoc(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <div>
                  <h3 className="font-bold text-slate-900">{activeDoc.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">สถานะการลงนาม</p>
                </div>
                <button onClick={() => setActiveDoc(null)}
                  className="p-1.5 hover:bg-slate-100 rounded-md transition">
                  <X size={18} className="text-slate-500" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-4">
                {!statusMap[activeDoc.id] ? (
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
                  </div>
                ) : statusMap[activeDoc.id].length === 0 ? (
                  <p className="text-center text-slate-400 py-8 text-sm">ไม่มีผู้รับมอบหมาย</p>
                ) : (
                  <div className="space-y-2">
                    {statusMap[activeDoc.id].map((row, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 grid place-items-center text-white text-xs font-semibold">
                          {(row.name || '?').split(' ').map(w => w[0]).slice(0,2).join('')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 truncate">{row.name}</p>
                          <p className="text-xs text-slate-500">{row.employee_id}</p>
                        </div>
                        {row.status === 'signed' ? (
                          <div className="text-right">
                            <span className="badge bg-emerald-100 text-emerald-700">
                              <CheckCircle2 size={11} /> เซ็นแล้ว
                            </span>
                            <p className="text-[11px] text-slate-400 mt-1">
                              {row.signed_at ? format(new Date(row.signed_at), 'dd/MM HH:mm') : ''}
                            </p>
                          </div>
                        ) : (
                          <span className="badge bg-amber-100 text-amber-700">
                            <Clock size={11} /> รอเซ็น
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
