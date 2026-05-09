'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, UploadCloud, FileText, X, Loader2, AlertCircle,
  Send, Check,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';

const MAX_SIZE_MB = 10;

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [user,        setUser]        = useState(null);
  const [departments, setDepartments] = useState([]);
  const [form,        setForm]        = useState({ title: '', description: '', department_id: '' });
  const [file,        setFile]        = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [error,       setError]       = useState('');
  const [dragOver,    setDragOver]    = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.replace('/login'); return; }
    const parsed = JSON.parse(u);
    if (parsed.role !== 'admin') { router.replace('/dashboard'); return; }
    setUser(parsed);
    api.get('/users/departments').then(res => setDepartments(res.data)).catch(() => {});
  }, []);

  const validateAndSet = (f) => {
    if (!f) return;
    if (f.type !== 'application/pdf') {
      setError('รับเฉพาะไฟล์ PDF เท่านั้น');
      return;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`ไฟล์ใหญ่เกิน ${MAX_SIZE_MB} MB`);
      return;
    }
    setError('');
    setFile(f);
    if (!form.title) {
      setForm(prev => ({ ...prev, title: f.name.replace(/\.pdf$/i, '') }));
    }
  };

  const handleFile = (e) => validateAndSet(e.target.files?.[0]);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    validateAndSet(e.dataTransfer.files?.[0]);
  };
  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!file) { setError('กรุณาเลือกไฟล์ PDF'); return; }
    if (!form.department_id) { setError('กรุณาเลือกแผนก'); return; }

    setLoading(true);
    setProgress(0);
    const t = toast.loading('กำลังอัพโหลด…');
    try {
      const data = new FormData();
      data.append('file',          file);
      data.append('title',         form.title);
      data.append('description',   form.description);
      data.append('department_id', form.department_id);

      const res = await api.post('/documents', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (ev) => {
          if (ev.total) setProgress(Math.round((ev.loaded / ev.total) * 100));
        },
      });

      toast.success(`อัพโหลดสำเร็จ — แจ้งเตือนแล้ว ${res.data.notified_users} คน`, {
        id: t,
        action: { label: 'ดูเอกสาร', onClick: () => router.push('/admin') },
      });
      setForm({ title: '', description: '', department_id: '' });
      removeFile();
      setProgress(0);
    } catch (err) {
      toast.error(err.response?.data?.error || 'อัพโหลดไม่สำเร็จ', { id: t });
      setError(err.response?.data?.error || 'อัพโหลดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const selectedDept = departments.find(d => String(d.id) === String(form.department_id));

  return (
    <div className="min-h-screen">
      <Navbar user={user} />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <Link href="/admin"
          className="inline-flex items-center gap-1.5 text-brand-700 text-sm hover:underline mb-4">
          <ArrowLeft size={14} /> กลับสู่ Dashboard
        </Link>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UploadCloud className="text-brand-700" size={26} />
            อัพโหลดเอกสาร
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            อัพโหลดไฟล์ PDF และมอบหมายให้แผนก — ผู้ใช้ในแผนกจะได้รับแจ้งเตือนทางอีเมล
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="card p-6">
          {error && (
            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
              className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Drag-and-drop zone */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                ไฟล์ PDF <span className="text-red-500">*</span>
              </label>
              <AnimatePresence mode="wait">
                {file ? (
                  <motion.div key="file"
                    initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                    className="border border-emerald-200 bg-emerald-50/50 rounded-lg p-4 flex items-center gap-3">
                    <div className="w-12 h-12 bg-white border border-emerald-200 rounded-lg grid place-items-center flex-shrink-0">
                      <FileText className="text-emerald-700" size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{file.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {(file.size / 1024 / 1024).toFixed(2)} MB · พร้อมอัพโหลด
                      </p>
                    </div>
                    <button type="button" onClick={removeFile}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition flex-shrink-0">
                      <X size={18} />
                    </button>
                  </motion.div>
                ) : (
                  <motion.div key="drop"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all
                      ${dragOver
                        ? 'border-brand-500 bg-brand-50 scale-[1.01]'
                        : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'}`}
                  >
                    <UploadCloud size={36} className={`mx-auto mb-2 ${dragOver ? 'text-brand-700' : 'text-slate-400'}`} />
                    <p className={`text-sm font-medium ${dragOver ? 'text-brand-700' : 'text-slate-600'}`}>
                      {dragOver ? 'ปล่อยไฟล์ที่นี่' : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือก'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">ขนาดไม่เกิน {MAX_SIZE_MB} MB · เฉพาะ PDF</p>
                  </motion.div>
                )}
              </AnimatePresence>
              <input ref={fileInputRef} type="file" accept="application/pdf"
                onChange={handleFile} className="hidden" />
            </div>

            {/* Progress bar */}
            {loading && progress > 0 && (
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>กำลังอัพโหลด…</span>
                  <span className="tabular-nums">{progress}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <motion.div className="h-full bg-gradient-to-r from-brand-500 to-brand-700"
                    initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.2 }} />
                </div>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                ชื่อเอกสาร <span className="text-red-500">*</span>
              </label>
              <input
                type="text" value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="เช่น นโยบาย Q2 2026"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">รายละเอียด</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                rows={3}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none resize-none"
              />
            </div>

            {/* Department */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                มอบหมายให้แผนก <span className="text-red-500">*</span>
              </label>
              <select
                value={form.department_id}
                onChange={e => setForm({ ...form, department_id: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                required
              >
                <option value="">— เลือกแผนก —</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.user_count} คน)
                  </option>
                ))}
              </select>
              {selectedDept && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                  <Check size={12} className="text-emerald-600" />
                  จะส่งแจ้งเตือนถึง <b className="text-slate-700 mx-1">{selectedDept.user_count}</b> คนในแผนก {selectedDept.name}
                </motion.p>
              )}
            </div>

            <button type="submit" disabled={loading || !file}
              className="btn-primary w-full !py-3">
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> กำลังอัพโหลด…</>
                : <><Send size={16} /> อัพโหลด & แจ้งเตือนแผนก</>}
            </button>
          </form>
        </motion.div>
      </main>
    </div>
  );
}
