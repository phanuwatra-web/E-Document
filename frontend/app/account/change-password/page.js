'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, Lock, Eye, EyeOff, Check, X as XIcon,
  KeyRound, Loader2, ShieldCheck, AlertCircle,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';

const checkRules = (pw) => ({
  length: pw.length >= 8,
  notWhitespace: pw.length > 0 && pw.trim().length > 0,
});

const RULE_LABELS = [
  { key: 'length',         text: 'อย่างน้อย 8 ตัวอักษร' },
  { key: 'notWhitespace',  text: 'ไม่ใช่ช่องว่างทั้งหมด' },
];

// Strength meter — heuristic based on length + character variety
const strengthOf = (pw) => {
  if (!pw) return { score: 0, label: '', color: 'bg-slate-200' };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw))   score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  const map = [
    { label: 'อ่อนมาก', color: 'bg-red-500',     width: 'w-1/5' },
    { label: 'อ่อน',    color: 'bg-orange-500',  width: 'w-2/5' },
    { label: 'พอใช้',   color: 'bg-amber-500',   width: 'w-3/5' },
    { label: 'ดี',      color: 'bg-lime-500',    width: 'w-4/5' },
    { label: 'แข็งแรง',  color: 'bg-emerald-500', width: 'w-full' },
  ];
  return { score, ...map[Math.min(score, 5) - 1] || map[0] };
};

const PasswordField = ({ label, value, onChange, onFocus, autoComplete, required, error }) => {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</label>
      <div className="relative">
        <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          className={`w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500
            ${error ? 'border-red-300' : 'border-slate-300'}`}
          autoComplete={autoComplete}
          required={required}
        />
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
};

export default function ChangePasswordPage() {
  const router = useRouter();
  const [user, setUser]             = useState(null);
  const [form, setForm]             = useState({ current: '', next: '', confirm: '' });
  const [showRules, setShowRules]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.replace('/login'); return; }
    setUser(JSON.parse(u));
  }, []);

  const rules        = checkRules(form.next);
  const allRulesPass = Object.values(rules).every(Boolean);
  const matches      = form.next.length > 0 && form.next === form.confirm;
  const canSubmit    = form.current && allRulesPass && matches && !submitting;
  const strength     = strengthOf(form.next);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      await api.post('/auth/change-password', {
        current_password: form.current,
        new_password:     form.next,
      });
      setSuccess(true);
      toast.success('เปลี่ยนรหัสผ่านสำเร็จ');
      const home = user.role === 'admin' ? '/admin' : '/dashboard';
      setTimeout(() => router.push(home), 1500);
    } catch (err) {
      const data   = err.response?.data;
      const errors = data?.errors;
      const msg = Array.isArray(errors) && errors.length > 1
        ? errors.join(' · ')
        : (data?.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  if (success) {
    return (
      <div className="min-h-screen">
        <Navbar user={user} />
        <main className="max-w-md mx-auto px-4 py-16">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="card p-8 text-center bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}
              className="w-16 h-16 bg-emerald-500 rounded-full grid place-items-center mx-auto mb-4 shadow-lg shadow-emerald-300/40">
              <Check className="text-white" size={36} strokeWidth={3} />
            </motion.div>
            <h2 className="text-lg font-bold text-emerald-900">เปลี่ยนรหัสผ่านสำเร็จ</h2>
            <p className="text-sm text-emerald-800 mt-2">
              กำลังพากลับสู่หน้าหลัก…
            </p>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar user={user} />
      <main className="max-w-md mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <Link href={user.role === 'admin' ? '/admin' : '/dashboard'}
          className="inline-flex items-center gap-1.5 text-brand-700 text-sm hover:underline mb-4">
          <ArrowLeft size={14} /> กลับ
        </Link>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-brand-100 rounded-lg">
              <KeyRound className="text-brand-700" size={20} />
            </div>
            <h1 className="text-xl font-bold text-slate-900">เปลี่ยนรหัสผ่าน</h1>
          </div>
          <p className="text-sm text-slate-500 mb-6 ml-12">
            หลังเปลี่ยนรหัสผ่าน session ปัจจุบันยังใช้ได้ต่อ
          </p>

          {error && (
            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
              className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <PasswordField label="รหัสผ่านปัจจุบัน" value={form.current}
              onChange={(v) => setForm({ ...form, current: v })}
              autoComplete="current-password" required />

            <div>
              <PasswordField label="รหัสผ่านใหม่" value={form.next}
                onChange={(v) => setForm({ ...form, next: v })}
                onFocus={() => setShowRules(true)}
                autoComplete="new-password" required />

              {/* Strength meter */}
              {form.next.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <motion.div className={`h-full ${strength.color}`}
                        initial={{ width: 0 }} animate={{ width: `${(strength.score / 5) * 100}%` }}
                        transition={{ duration: 0.3 }} />
                    </div>
                    <span className={`text-xs font-medium tabular-nums w-16 text-right
                      ${strength.score <= 1 ? 'text-red-600'
                        : strength.score === 2 ? 'text-orange-600'
                        : strength.score === 3 ? 'text-amber-600'
                        : strength.score === 4 ? 'text-lime-700'
                        : 'text-emerald-700'}`}>
                      {strength.label}
                    </span>
                  </div>
                </motion.div>
              )}

              {/* Rules checklist */}
              <AnimatePresence>
                {(showRules || form.next.length > 0) && (
                  <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="mt-3 text-xs space-y-1 overflow-hidden">
                    {RULE_LABELS.map(r => {
                      const ok = rules[r.key];
                      return (
                        <li key={r.key} className={`flex items-center gap-1.5 ${ok ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {ok ? <Check size={13} className="text-emerald-600" /> : <XIcon size={13} className="text-slate-300" />}
                          {r.text}
                        </li>
                      );
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>

            <div>
              <PasswordField label="ยืนยันรหัสผ่านใหม่" value={form.confirm}
                onChange={(v) => setForm({ ...form, confirm: v })}
                autoComplete="new-password" required
                error={form.confirm.length > 0 && !matches} />
              {form.confirm.length > 0 && !matches && (
                <motion.p initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <XIcon size={12} /> รหัสผ่านไม่ตรงกัน
                </motion.p>
              )}
              {matches && (
                <motion.p initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-1 text-xs text-emerald-600 flex items-center gap-1">
                  <Check size={12} /> รหัสผ่านตรงกัน
                </motion.p>
              )}
            </div>

            <button type="submit" disabled={!canSubmit} className="btn-primary w-full !py-3 mt-2">
              {submitting
                ? <><Loader2 size={16} className="animate-spin" /> กำลังเปลี่ยน…</>
                : <><ShieldCheck size={16} /> เปลี่ยนรหัสผ่าน</>}
            </button>
          </form>
        </motion.div>
      </main>
    </div>
  );
}
