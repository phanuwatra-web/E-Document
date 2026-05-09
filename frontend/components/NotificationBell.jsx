'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Inbox, FileText, Clock, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';
import api from '@/lib/api';

const POLL_MS = 60_000; // every 60s

export default function NotificationBell() {
  const [open,  setOpen]  = useState(false);
  const [data,  setData]  = useState({ count: 0, items: [], role: 'user' });
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  const fetchNow = async () => {
    try {
      const res = await api.get('/notifications/me');
      setData(res.data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    fetchNow();
    const t = setInterval(fetchNow, POLL_MS);
    return () => clearInterval(t);
  }, []);

  // Click outside to close
  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const isAdmin = data.role === 'admin';
  const subtitle = isAdmin
    ? 'เอกสารที่คุณอัพโหลด — มีคนยังไม่เซ็น'
    : 'เอกสารที่รอการลงนามจากคุณ';

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-md text-blue-200 hover:text-white hover:bg-white/5 transition-colors"
        title="การแจ้งเตือน"
        aria-label="Notifications"
      >
        <Bell size={18} strokeWidth={2.2} />
        {data.count > 0 && (
          <motion.span
            key={data.count}
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full grid place-items-center ring-2 ring-brand-900"
          >
            {data.count > 9 ? '9+' : data.count}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{    opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-[360px] max-w-[90vw] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50 text-slate-800"
          >
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Bell size={14} className="text-brand-700" /> การแจ้งเตือน
                </h3>
                {data.count > 0 && (
                  <span className="badge bg-red-100 text-red-700">{data.count} รายการ</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {loading ? (
                <div className="p-3 space-y-2">
                  {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
                </div>
              ) : data.items.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Inbox size={36} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-xs">ไม่มีการแจ้งเตือน</p>
                  <p className="text-[11px] mt-1">เคลียร์งานหมดแล้ว 🎉</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.items.map(item => (
                    <li key={item.id}>
                      <Link href={`/dashboard/document/${item.id}`}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition group"
                      >
                        <div className={`w-9 h-9 rounded-lg grid place-items-center flex-shrink-0
                          ${isAdmin ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-700'}`}>
                          {isAdmin ? <FileText size={16}/> : <Clock size={16}/>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 truncate group-hover:text-brand-700 transition">
                            {item.title}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {isAdmin
                              ? `${item.pending_count}/${item.total_count} ยังไม่เซ็น · ${item.department_name || '—'}`
                              : `${item.department_name} · ${item.uploaded_by_name || '—'}`}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: th })}
                          </p>
                        </div>
                        <ChevronRight size={14} className="text-slate-300 group-hover:text-brand-600 mt-3 flex-shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="px-4 py-2 border-t border-slate-200 bg-slate-50/50 text-center">
              <Link href={isAdmin ? '/admin' : '/dashboard'}
                onClick={() => setOpen(false)}
                className="text-xs text-brand-700 hover:underline font-medium"
              >
                ดูทั้งหมด →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
