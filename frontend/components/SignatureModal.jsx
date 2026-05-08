'use client';
import { useState, useRef, useEffect } from 'react';
import api from '@/lib/api';

export default function SignatureModal({ documentId, onClose, onSigned }) {
  const [tab,     setTab]     = useState('click');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const canvasRef = useRef(null);
  const sigPadRef = useRef(null);

  useEffect(() => {
    if (tab === 'draw' && canvasRef.current) {
      import('signature_pad').then(({ default: SignaturePad }) => {
        sigPadRef.current = new SignaturePad(canvasRef.current, {
          backgroundColor: 'rgba(0, 0, 0, 0)',   // transparent — PNG will have no white fill
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
    let signature_type = tab;
    let signature_data = null;

    if (tab === 'draw') {
      if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
        setError('Please draw your signature first');
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
      onSigned({ signature_type, signature_data });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to sign document');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">Sign Document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setTab('click')}
            className={`flex-1 py-3 text-sm font-medium transition border-b-2 ${
              tab === 'click'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            ✅ Click to Sign
          </button>
          <button
            onClick={() => setTab('draw')}
            className={`flex-1 py-3 text-sm font-medium transition border-b-2 ${
              tab === 'draw'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            ✍️ Draw Signature
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {tab === 'click' && (
            <div className="text-center py-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-700 text-sm font-medium mb-1">Click to Sign</p>
              <p className="text-gray-500 text-xs">
                Your name, employee ID and timestamp will be recorded as your electronic signature.
              </p>
            </div>
          )}

          {tab === 'draw' && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Draw your signature below:</p>
              <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white relative" style={{ height: 180 }}>
                <canvas
                  ref={canvasRef}
                  className="w-full h-full rounded-lg cursor-crosshair"
                />
              </div>
              <button
                onClick={clearPad}
                className="mt-2 text-xs text-gray-500 hover:text-red-500 transition"
              >
                Clear
              </button>
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSign}
            disabled={loading}
            className="flex-1 py-2.5 bg-blue-800 hover:bg-blue-900 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
          >
            {loading ? 'Signing…' : 'Confirm Signature'}
          </button>
        </div>
      </div>
    </div>
  );
}
