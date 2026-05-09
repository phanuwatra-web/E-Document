'use client';
import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ArrowLeft, Download, Building2, Calendar, User as UserIcon,
  CheckCircle2, Clock, PenTool, Move, Save, RotateCcw, Loader2,
  FileText, AlertCircle,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import SignatureModal from '@/components/SignatureModal';
import api from '@/lib/api';

const PDFViewer = dynamic(() => import('@/components/PDFViewer'), { ssr: false });

export default function DocumentPage({ params }) {
  const { id }  = use(params);
  const router  = useRouter();

  const [user,        setUser]        = useState(null);
  const [doc,         setDoc]         = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [showSign,    setShowSign]    = useState(false);
  const [adjustMode,  setAdjustMode]  = useState(false);
  const [adjustPos,   setAdjustPos]   = useState(null);
  const [sigImage,    setSigImage]    = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [pdfKey,      setPdfKey]      = useState(0);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.replace('/login'); return; }
    setUser(JSON.parse(u));
    fetchDoc();
  }, [id]);

  const fetchDoc = async () => {
    try {
      const res = await api.get(`/documents/${id}`);
      setDoc(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'โหลดเอกสารไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const fetchMySig = async () => {
    try {
      const res = await api.get(`/signatures/me/${id}`);
      const sig = res.data;
      setSigImage(sig.signature_type === 'draw' ? sig.signature_data : null);
      return sig;
    } catch {
      setSigImage(null);
      return null;
    }
  };

  const handleSigned = async ({ signature_type, signature_data } = {}) => {
    setSigImage(signature_type === 'draw' ? signature_data : null);
    await fetchDoc();
    setShowSign(false);
    setAdjustPos({ page_num: 1, x_pct: 0.05, y_pct: 0.10, width_pct: 0.22 });
    setAdjustMode(true);
    setPdfKey(k => k + 1);
  };

  const savePosition = async () => {
    if (!adjustPos) return;
    setSaving(true);
    try {
      await api.patch(`/signatures/me/${id}`, adjustPos);
      setAdjustMode(false);
      setAdjustPos(null);
      setSigImage(null);
      setPdfKey(k => k + 1);
      toast.success('บันทึกตำแหน่งลายเซ็นแล้ว');
    } catch (err) {
      toast.error(err.response?.data?.error || 'บันทึกตำแหน่งไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const keepDefault = () => {
    setAdjustMode(false);
    setAdjustPos(null);
    setSigImage(null);
  };

  const handleEditPosition = async () => {
    const sig = await fetchMySig();
    setAdjustPos({
      page_num:  sig?.page_num  ?? 1,
      x_pct:     sig?.x_pct    ?? 0.05,
      y_pct:     sig?.y_pct    ?? 0.10,
      width_pct: sig?.width_pct ?? 0.22,
    });
    setAdjustMode(true);
  };

  const handleDownload = async () => {
    const t = toast.loading('กำลังเตรียมไฟล์…');
    try {
      const res = await api.get(`/documents/${id}/file?download=1&_t=${Date.now()}`, {
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = doc?.original_name || `document-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      toast.success('ดาวน์โหลดสำเร็จ', { id: t });
    } catch (err) {
      toast.error(err.response?.data?.error || 'ดาวน์โหลดไม่สำเร็จ', { id: t });
    }
  };

  const handleResign = async () => {
    if (!confirm('ลบลายเซ็นปัจจุบันเพื่อเซ็นใหม่?')) return;
    try {
      await api.delete(`/signatures/me/${id}`);
      await fetchDoc();
      setPdfKey(k => k + 1);
      setAdjustMode(false);
      setAdjustPos(null);
      setSigImage(null);
      toast.success('ลบลายเซ็นแล้ว — สามารถเซ็นใหม่ได้');
    } catch (err) {
      toast.error(err.response?.data?.error || 'ลบลายเซ็นไม่สำเร็จ');
    }
  };

  const isSigned = doc?.my_status === 'signed' ||
    doc?.signatures?.some(s => s.signer_name === user?.name);
  const mySig = doc?.signatures?.find(s => s.signer_name === user?.name);

  if (loading) return (
    <div className="min-h-screen">
      <Navbar user={user} />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="skeleton h-6 w-32 mb-6 rounded" />
        <div className="flex gap-6 flex-col lg:flex-row">
          <div className="flex-1">
            <div className="skeleton h-24 mb-4 rounded-xl" />
            <div className="skeleton h-[600px] rounded-xl" />
          </div>
          <div className="lg:w-80">
            <div className="skeleton h-40 mb-4 rounded-xl" />
            <div className="skeleton h-48 rounded-xl" />
          </div>
        </div>
      </main>
    </div>
  );

  if (error) return (
    <div className="min-h-screen">
      <Navbar user={user} />
      <main className="max-w-md mx-auto px-4 py-16 text-center">
        <AlertCircle size={48} className="mx-auto text-red-400 mb-3" />
        <p className="text-red-600 font-medium">{error}</p>
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 mt-4 text-brand-700 hover:underline text-sm">
          <ArrowLeft size={14} /> กลับ
        </Link>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen">
      <Navbar user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Link href="/dashboard"
          className="inline-flex items-center gap-1.5 text-brand-700 text-sm hover:underline mb-4">
          <ArrowLeft size={14} /> กลับสู่หน้าหลัก
        </Link>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: PDF Viewer */}
          <div className="flex-1 min-w-0">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="card p-5 mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-slate-900 truncate">{doc.title}</h1>
                {doc.description && <p className="text-slate-500 text-sm mt-1">{doc.description}</p>}
                <div className="flex gap-3 mt-2.5 text-xs text-slate-500 flex-wrap">
                  <span className="inline-flex items-center gap-1"><Building2 size={12} /> {doc.department_name}</span>
                  <span className="inline-flex items-center gap-1"><Calendar size={12} /> {format(new Date(doc.created_at), 'dd/MM/yyyy')}</span>
                  <span className="inline-flex items-center gap-1"><UserIcon size={12} /> {doc.uploaded_by_name}</span>
                </div>
              </div>
              <button onClick={handleDownload}
                className="btn-primary flex-shrink-0 !py-2"
                title="ดาวน์โหลด PDF พร้อมลายเซ็น">
                <Download size={14} /> Download
              </button>
            </motion.div>

            <PDFViewer
              documentId={id}
              positionMode={adjustMode}
              onPositionSelect={(pos) => setAdjustPos(pos)}
              marker={adjustPos}
              refreshKey={pdfKey}
              signatureImage={sigImage}
            />
          </div>

          {/* Right: Signing Panel */}
          <div className="lg:w-80 flex-shrink-0 space-y-4">

            <AnimatePresence mode="wait">
              {isSigned && adjustMode ? (
                <motion.div key="adjust"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="rounded-xl p-5 bg-gradient-to-br from-brand-50 to-blue-100 border border-brand-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-brand-200 rounded-md">
                      <Move size={16} className="text-brand-800" />
                    </div>
                    <span className="font-bold text-brand-900">จัดตำแหน่งลายเซ็น</span>
                  </div>
                  <p className="text-xs text-brand-800 mb-4 leading-relaxed">
                    ลากกล่องเพื่อย้าย · ลากมุมเพื่อปรับขนาด
                  </p>
                  <button onClick={savePosition} disabled={saving}
                    className="btn-primary w-full mb-2">
                    {saving ? <><Loader2 size={14} className="animate-spin" /> กำลังบันทึก…</>
                            : <><Save size={14} /> บันทึกตำแหน่ง</>}
                  </button>
                  <button onClick={keepDefault} className="btn-secondary w-full">
                    คงไว้แบบเดิม
                  </button>
                </motion.div>

              ) : isSigned ? (
                <motion.div key="signed"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="rounded-xl p-5 bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="p-1.5 bg-emerald-200 rounded-md">
                      <CheckCircle2 size={18} className="text-emerald-700" />
                    </div>
                    <span className="font-bold text-emerald-900">ลงนามเรียบร้อย</span>
                  </div>
                  {mySig && (
                    <p className="text-xs text-emerald-800 mt-1.5 ml-9">
                      เมื่อ {format(new Date(mySig.signed_at), 'dd MMM yyyy · HH:mm')}
                    </p>
                  )}
                  <div className="mt-4 space-y-2">
                    <button onClick={handleEditPosition}
                      className="w-full inline-flex items-center justify-center gap-2 py-2 border border-emerald-400 text-emerald-800 rounded-lg text-sm font-medium hover:bg-emerald-100 transition">
                      <Move size={14} /> ปรับตำแหน่ง / ขนาด
                    </button>
                    <button onClick={handleResign}
                      className="w-full inline-flex items-center justify-center gap-2 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition">
                      <RotateCcw size={14} /> เซ็นใหม่
                    </button>
                  </div>
                </motion.div>

              ) : (
                <motion.div key="pending"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="rounded-xl p-5 bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-amber-200 rounded-md">
                      <Clock size={18} className="text-amber-700" />
                    </div>
                    <span className="font-bold text-amber-900">รอการลงนาม</span>
                  </div>
                  <p className="text-xs text-amber-800 mb-4 leading-relaxed">
                    กรุณาอ่านเอกสารแล้วกดลงนามด้านล่าง
                  </p>
                  <button onClick={() => setShowSign(true)}
                    className="btn-primary w-full">
                    <PenTool size={14} /> ลงนามเอกสาร
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Signers list */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="card p-5">
              <h3 className="font-bold text-slate-800 mb-3 text-sm flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-600" />
                ผู้ลงนาม ({doc.signatures?.length || 0})
              </h3>
              {doc.signatures?.length === 0 ? (
                <p className="text-slate-400 text-xs text-center py-4">ยังไม่มีผู้ลงนาม</p>
              ) : (
                <div className="space-y-3">
                  {doc.signatures?.map(sig => (
                    <div key={sig.id} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 grid place-items-center text-white text-xs font-bold flex-shrink-0">
                        {(sig.signer_name || '?').split(' ').map(w => w[0]).slice(0,2).join('')}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{sig.signer_name}</p>
                        <p className="text-xs text-slate-400">{sig.employee_id}</p>
                        <p className="text-xs text-slate-400">
                          {format(new Date(sig.signed_at), 'dd/MM HH:mm')} · {sig.signature_type === 'draw' ? 'วาดมือ' : 'คลิกลงนาม'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Document info */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="card p-5">
              <h3 className="font-bold text-slate-800 mb-3 text-sm flex items-center gap-2">
                <FileText size={14} className="text-brand-700" />
                ข้อมูลเอกสาร
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">ไฟล์</span>
                  <span className="font-medium truncate text-slate-700 max-w-[160px]">{doc.original_name}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">ขนาด</span>
                  <span className="text-slate-700">{doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : '—'}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">แผนก</span>
                  <span className="text-slate-700">{doc.department_name}</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      {showSign && (
        <SignatureModal
          documentId={id}
          onClose={() => setShowSign(false)}
          onSigned={handleSigned}
        />
      )}
    </div>
  );
}
