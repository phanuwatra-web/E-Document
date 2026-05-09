'use client';
import { useState, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, ExternalLink, Loader2, AlertCircle, Check } from 'lucide-react';
import api from '@/lib/api';

export default function PrivacyConsentModal({ user, onAccepted }) {
  const [agreed, setAgreed]         = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const scrollRef = useRef(null);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
      setScrolledEnd(true);
    }
  };

  const accept = async () => {
    if (!agreed || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post('/auth/accept-privacy');
      try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        u.privacy_accepted_at = res.data.privacy_accepted_at;
        localStorage.setItem('user', JSON.stringify(u));
      } catch {}
      onAccepted?.(res.data.privacy_accepted_at);
    } catch (err) {
      setError(err.response?.data?.error || 'ไม่สามารถบันทึกการยอมรับได้ กรุณาลองอีกครั้ง');
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

          <div className="px-6 py-5 border-b border-slate-200 flex items-start gap-3">
            <div className="p-2 bg-brand-100 rounded-lg flex-shrink-0">
              <ShieldCheck className="text-brand-700" size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">นโยบายความเป็นส่วนตัว</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                กรุณาอ่านและยอมรับก่อนใช้งานระบบ
              </p>
            </div>
          </div>

          <div ref={scrollRef} onScroll={onScroll}
            className="flex-1 overflow-y-auto px-6 py-4 text-sm text-slate-700 space-y-3 leading-relaxed">
            <p>สวัสดีคุณ <b className="text-slate-900">{user?.name}</b> 👋</p>

            <p>
              ระบบ DocSign จะจัดเก็บข้อมูลส่วนบุคคลของท่าน
              (รหัสพนักงาน, ชื่อ, อีเมล, ลายเซ็น, IP, เวลาการลงนาม)
              เพื่อใช้ในการจัดการเอกสารและตรวจสอบการลงนามภายในองค์กร
            </p>

            <p>
              ก่อนใช้งานครั้งแรก ท่านต้องอ่านและยอมรับ
              <Link href="/privacy-policy" target="_blank"
                className="inline-flex items-center gap-0.5 text-brand-700 hover:underline font-medium mx-1">
                ประกาศนโยบายความเป็นส่วนตัว <ExternalLink size={11} />
              </Link>
              ซึ่งระบุรายละเอียดทั้งหมดเกี่ยวกับการจัดเก็บและสิทธิของท่าน
            </p>

            <p>
              ท่านสามารถใช้สิทธิเข้าถึง / แก้ไข / ลบข้อมูล หรือคัดค้านการประมวลผลได้
              โดยติดต่อเจ้าหน้าที่ DPO ตามที่ระบุในนโยบาย
            </p>

            {error && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {!scrolledEnd && (
              <p className="text-xs text-slate-400 italic text-center pt-2">
                ↓ เลื่อนลงเพื่ออ่านให้ครบ
              </p>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl">
            <label className={`flex items-start gap-2.5 select-none transition
              ${scrolledEnd ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
              <input
                type="checkbox" checked={agreed}
                disabled={!scrolledEnd}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-brand-700"
              />
              <span className="text-sm text-slate-800 leading-relaxed">
                ข้าพเจ้าได้อ่านและยอมรับ
                <Link href="/privacy-policy" target="_blank"
                  className="text-brand-700 hover:underline mx-1">
                  นโยบายความเป็นส่วนตัว
                </Link>
                และอนุญาตให้ระบบจัดเก็บข้อมูลตามที่ระบุ
              </span>
            </label>

            <button onClick={accept} disabled={!agreed || submitting}
              className="btn-primary w-full mt-4 !py-2.5">
              {submitting
                ? <><Loader2 size={14} className="animate-spin" /> กำลังบันทึก…</>
                : <><Check size={14} /> ยอมรับและใช้งานต่อ</>}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
