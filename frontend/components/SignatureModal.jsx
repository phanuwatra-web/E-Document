'use client';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, PenTool, X, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

export default function SignatureModal({ documentId, onClose, onSigned }) {
  const [tab,     setTab]     = useState('click');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [agreed,  setAgreed]  = useState(false);

  const canvasRef = useRef(null);
  const sigPadRef = useRef(null);

  useEffect(() => {
    if (tab === 'draw' && canvasRef.current) {
      import('signature_pad').then(({ default: SignaturePad }) => {
        sigPadRef.current = new SignaturePad(canvasRef.current, {
          backgroundColor: 'rgba(0, 0, 0, 0)',
          penColor:        'rgb(30, 58, 138)',
          minWidth: 1.5,
          maxWidth: 3,
        });
        resizeCanvas();
      });
    }
  }, [tab]);

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio  = window.devicePixelRatio || 1;
    canvas.width  = canvas.offsetWidth  * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
    sigPadRef.current?.clear();
  };

  const clearPad = () => sigPadRef.current?.clear();

  const handleSign = async () => {
    setError('');
    if (!agreed) {
      setError('กรุณายืนยันว่ารับทราบเงื่อนไขการลงนามก่อน');
      return;
    }
    let signature_type = tab;
    let signature_data = null;
    if (tab === 'draw') {
      if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
        setError('กรุณาวาดลายเซ็นก่อน');
        return;
      }
      signature_data = sigPadRef.current.toDataURL('image/png');
    }

    setLoading(true);
    try {
      await api.post('/signatures', {
        document_id:   documentId,
        signature_type,
        signature_data,
        page_num:  1,
        x_pct:     0.05,
        y_pct:     0.10,
        width_pct: 0.22,
      });
      toast.success('ลงนามเอกสารสำเร็จ');
      onSigned({ signature_type, signature_data });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'ลงนามไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const TabBtn = ({ id, icon: Icon, children }) => (
    <button onClick={() => setTab(id)}
      className={`flex-1 py-3 text-sm font-medium transition border-b-2 inline-flex items-center justify-center gap-2
        ${tab === id ? 'border-brand-700 text-brand-700 bg-brand-50/30' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
      <Icon size={16} /> {children}
    </button>
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-brand-100 rounded-md">
                <PenTool size={18} className="text-brand-700" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">ลงนามเอกสาร</h2>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-md transition">
              <X size={18} className="text-slate-500" />
            </button>
          </div>

          <div className="flex border-b border-slate-200">
            <TabBtn id="click" icon={CheckCircle2}>คลิกเพื่อลงนาม</TabBtn>
            <TabBtn id="draw"  icon={PenTool}>วาดลายเซ็น</TabBtn>
          </div>

          <div className="p-6">
            {tab === 'click' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-6">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={40} className="text-emerald-600" strokeWidth={2.2} />
                </div>
                <p className="text-slate-700 text-sm font-semibold mb-1">คลิกเพื่อลงนาม</p>
                <p className="text-slate-500 text-xs leading-relaxed max-w-xs mx-auto">
                  ชื่อ, รหัสพนักงาน และเวลาที่ลงนาม จะถูกบันทึกเป็นลายเซ็นอิเล็กทรอนิกส์ของคุณ
                </p>
              </motion.div>
            )}

            {tab === 'draw' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <p className="text-xs text-slate-500 mb-2">วาดลายเซ็นด้านล่าง:</p>
                <div className="border-2 border-dashed border-slate-300 rounded-lg bg-slate-50/50 relative" style={{ height: 180 }}>
                  <canvas ref={canvasRef} className="w-full h-full rounded-lg cursor-crosshair" />
                </div>
                <button onClick={clearPad} className="mt-2 text-xs text-slate-500 hover:text-red-600 transition">
                  ล้างลายเซ็น
                </button>
              </motion.div>
            )}

            {error && (
              <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </motion.p>
            )}

            <label className="mt-4 flex items-start gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-brand-700" />
              <span className="text-xs text-slate-700 leading-relaxed">
                ข้าพเจ้ารับทราบว่าการลงนามนี้เป็นการแสดงเจตนายอมรับเอกสาร
                และมีผลผูกพันเช่นเดียวกับลายมือชื่อทั่วไป
              </span>
            </label>
          </div>

          <div className="flex gap-3 px-6 pb-6">
            <button onClick={onClose} className="flex-1 btn-secondary">ยกเลิก</button>
            <button onClick={handleSign} disabled={loading || !agreed} className="flex-1 btn-primary">
              {loading ? <><Loader2 size={14} className="animate-spin" /> กำลังลงนาม…</> : 'ยืนยันลงนาม'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
