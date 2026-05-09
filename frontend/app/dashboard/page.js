'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FileText, Clock, CheckCircle2, Inbox, ChevronRight, Search } from 'lucide-react';
import { format } from 'date-fns';
import Navbar from '@/components/Navbar';
import PrivacyConsentModal from '@/components/PrivacyConsentModal';
import api from '@/lib/api';

const StatCard = ({ icon: Icon, label, value, accent, active, onClick }) => (
  <button onClick={onClick}
    className={`card p-5 text-left transition-all w-full ${active ? 'ring-2 ring-brand-500 shadow-md' : 'hover:shadow-md hover:-translate-y-0.5'}`}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <p className={`text-3xl font-bold mt-1.5 ${accent}`}>{value}</p>
      </div>
      <div className={`p-2.5 rounded-lg ${accent.replace('text-', 'bg-').replace('-700', '-50')}`}>
        <Icon className={accent} size={22} strokeWidth={2.2} />
      </div>
    </div>
  </button>
);

export default function UserDashboard() {
  const router = useRouter();
  const [user,      setUser]      = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('all');
  const [search,    setSearch]    = useState('');

  useEffect(() => {
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

  const pending = documents.filter(d => d.my_status === 'pending').length;
  const signed  = documents.filter(d => d.my_status === 'signed').length;

  const filtered = useMemo(() => {
    let list = filter === 'all' ? documents : documents.filter(d => d.my_status === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        (d.title || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [documents, filter, search]);

  const needsConsent = user && !user.privacy_accepted_at;
  const initials = (user?.name || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();

  return (
    <div className="min-h-screen">
      <Navbar user={user} />

      {needsConsent && (
        <PrivacyConsentModal user={user}
          onAccepted={(t) => setUser(prev => ({ ...prev, privacy_accepted_at: t }))} />
      )}

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="card p-6 mb-6 bg-gradient-to-r from-brand-900 via-brand-800 to-brand-700 text-white border-0">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/15 grid place-items-center text-xl font-bold ring-2 ring-white/20">
              {initials}
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">สวัสดี, {user?.name}</h1>
              <p className="text-sm text-blue-200 mt-1">
                {user?.department_name} · รหัสพนักงาน {user?.employee_id}
              </p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard icon={FileText}     label="ทั้งหมด"  value={documents.length} accent="text-brand-700"
            active={filter === 'all'}     onClick={() => setFilter('all')} />
          <StatCard icon={Clock}        label="รอเซ็น"   value={pending}          accent="text-amber-700"
            active={filter === 'pending'} onClick={() => setFilter('pending')} />
          <StatCard icon={CheckCircle2} label="เซ็นแล้ว" value={signed}           accent="text-emerald-700"
            active={filter === 'signed'}  onClick={() => setFilter('signed')} />
        </div>

        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเอกสาร..."
            className="w-full pl-9 pr-3 py-2.5 border border-slate-300 bg-white rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          />
        </div>

        <div className="space-y-3">
          {loading ? (
            [...Array(3)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)
          ) : filtered.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="card p-12 text-center text-slate-400">
              <Inbox size={48} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm">{search ? 'ไม่พบเอกสารที่ค้นหา' : 'ไม่มีเอกสารในหมวดนี้'}</p>
            </motion.div>
          ) : (
            filtered.map((doc, i) => (
              <motion.div key={doc.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              >
                <Link href={`/dashboard/document/${doc.id}`}>
                  <div className="card card-hover p-4 sm:p-5 flex items-center justify-between cursor-pointer group">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className={`w-11 h-11 rounded-lg grid place-items-center flex-shrink-0
                        ${doc.my_status === 'signed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {doc.my_status === 'signed' ? <CheckCircle2 size={22} /> : <FileText size={22} />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 group-hover:text-brand-700 transition truncate">
                          {doc.title}
                        </p>
                        {doc.description && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{doc.description}</p>
                        )}
                        <p className="text-xs text-slate-400 mt-1">
                          {doc.department_name} · {format(new Date(doc.created_at), 'dd/MM/yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                      <span className={`badge ${
                        doc.my_status === 'signed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {doc.my_status === 'signed'
                          ? <><CheckCircle2 size={11}/> เซ็นแล้ว</>
                          : <><Clock size={11}/> รอเซ็น</>}
                      </span>
                      <ChevronRight size={18} className="text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
