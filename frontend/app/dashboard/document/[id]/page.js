'use client';
import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
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
  const [adjustMode,  setAdjustMode]  = useState(false);   // drag/resize after signing
  const [adjustPos,   setAdjustPos]   = useState(null);    // {page_num, x_pct, y_pct, width_pct}
  const [sigImage,    setSigImage]    = useState(null);    // data URL of drawn signature (null for click type)
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
      setError(err.response?.data?.error || 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  // Fetch current user's signature metadata + image data
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

  // Called right after signing — receive signature data directly from modal
  const handleSigned = async ({ signature_type, signature_data } = {}) => {
    // Set image immediately — no extra fetch needed
    setSigImage(signature_type === 'draw' ? signature_data : null);
    await fetchDoc();
    setShowSign(false);
    setAdjustPos({ page_num: 1, x_pct: 0.05, y_pct: 0.10, width_pct: 0.22 });
    setAdjustMode(true);
    setPdfKey(k => k + 1);
  };

  // Save adjusted position to backend
  const savePosition = async () => {
    if (!adjustPos) return;
    setSaving(true);
    try {
      await api.patch(`/signatures/me/${id}`, adjustPos);
      setAdjustMode(false);
      setAdjustPos(null);
      setSigImage(null);
      setPdfKey(k => k + 1);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save position');
    } finally {
      setSaving(false);
    }
  };

  // Discard position changes
  const keepDefault = () => {
    setAdjustMode(false);
    setAdjustPos(null);
    setSigImage(null);
  };

  // Re-enter adjust mode for a signed document
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

  // Download the PDF (with embedded signatures) to disk
  const handleDownload = async () => {
    try {
      const res = await api.get(`/documents/${id}/file?download=1&_t=${Date.now()}`, {
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(res.data);
      const a       = document.createElement('a');
      a.href        = blobUrl;
      a.download    = doc?.original_name || `document-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to download PDF');
    }
  };

  // Remove signature so user can re-sign
  const handleResign = async () => {
    if (!confirm('Remove your current signature so you can sign again?')) return;
    try {
      await api.delete(`/signatures/me/${id}`);
      await fetchDoc();
      setPdfKey(k => k + 1);
      setAdjustMode(false);
      setAdjustPos(null);
      setSigImage(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove signature');
    }
  };

  const isSigned = doc?.my_status === 'signed' ||
    doc?.signatures?.some(s => s.signer_name === user?.name);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  );
  if (error) return (
    <div className="min-h-screen flex items-center justify-center flex-col gap-3 text-red-600">
      <p>{error}</p>
      <Link href="/dashboard" className="text-blue-600 text-sm hover:underline">← Back</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar user={user} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-blue-700 text-sm hover:underline">
          ← Back to Dashboard
        </Link>

        <div className="mt-4 flex flex-col lg:flex-row gap-6">
          {/* Left: PDF Viewer */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-gray-900 truncate">{doc.title}</h1>
                {doc.description && <p className="text-gray-500 text-sm mt-1">{doc.description}</p>}
                <div className="flex gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                  <span>📁 {doc.department_name}</span>
                  <span>📅 {new Date(doc.created_at).toLocaleDateString('th-TH')}</span>
                  <span>📤 {doc.uploaded_by_name}</span>
                </div>
              </div>
              <button
                onClick={handleDownload}
                className="flex-shrink-0 px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
                title="Download signed PDF"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                </svg>
                Download
              </button>
            </div>

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
          <div className="lg:w-80 flex-shrink-0">

            {/* ── ADJUST MODE (after signing) ── */}
            {isSigned && adjustMode ? (
              <div className="rounded-xl p-5 mb-4 bg-blue-50 border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">📐</span>
                  <span className="font-bold text-blue-800">Adjust Signature</span>
                </div>
                <p className="text-xs text-blue-700 mb-4">
                  Drag the box to move · drag the corner handle to resize
                </p>
                <button
                  onClick={savePosition}
                  disabled={saving}
                  className="w-full py-2.5 bg-blue-800 hover:bg-blue-900 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50 mb-2"
                >
                  {saving ? 'Saving…' : '💾 Save Position'}
                </button>
                <button
                  onClick={keepDefault}
                  className="w-full py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition"
                >
                  Keep as is
                </button>
              </div>

            ) : isSigned ? (
              /* ── SIGNED (normal) ── */
              <div className="rounded-xl p-5 mb-4 bg-green-50 border border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">✅</span>
                  <span className="font-bold text-green-800">You have signed</span>
                </div>
                {doc.signatures?.find(s => s.signer_name === user?.name) && (
                  <p className="text-xs text-green-700 mt-1">
                    Signed on {new Date(
                      doc.signatures.find(s => s.signer_name === user?.name).signed_at
                    ).toLocaleString('th-TH')}
                  </p>
                )}
                <div className="mt-3 space-y-2">
                  <button
                    onClick={handleEditPosition}
                    className="w-full py-2 border border-green-400 text-green-800 rounded-lg text-sm hover:bg-green-100 transition"
                  >
                    📐 Adjust position / size
                  </button>
                  <button
                    onClick={handleResign}
                    className="w-full py-2 border border-gray-300 text-gray-500 rounded-lg text-sm hover:bg-gray-50 transition"
                  >
                    ↻ Re-sign
                  </button>
                </div>
              </div>

            ) : (
              /* ── NOT SIGNED ── */
              <div className="rounded-xl p-5 mb-4 bg-yellow-50 border border-yellow-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">⏳</span>
                  <span className="font-bold text-yellow-800">Signature Required</span>
                </div>
                <p className="text-xs text-yellow-700 mb-3">
                  Review the document and click below to sign.
                </p>
                <button
                  onClick={() => setShowSign(true)}
                  className="w-full py-2.5 bg-blue-800 hover:bg-blue-900 text-white font-semibold rounded-lg text-sm transition"
                >
                  ✍️ Sign This Document
                </button>
              </div>
            )}

            {/* Signers list */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h3 className="font-bold text-gray-800 mb-3 text-sm">
                Signers ({doc.signatures?.length || 0})
              </h3>
              {doc.signatures?.length === 0 ? (
                <p className="text-gray-400 text-xs text-center py-4">No signatures yet</p>
              ) : (
                <div className="space-y-3">
                  {doc.signatures?.map(sig => (
                    <div key={sig.id} className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 text-sm">✓</div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{sig.signer_name}</p>
                        <p className="text-xs text-gray-400">{sig.employee_id}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(sig.signed_at).toLocaleString('th-TH')} · {sig.signature_type}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Document info */}
            <div className="bg-white rounded-xl shadow-sm p-5 mt-4">
              <h3 className="font-bold text-gray-800 mb-3 text-sm">Document Info</h3>
              <div className="space-y-2 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span className="text-gray-400">File</span>
                  <span className="font-medium truncate max-w-[160px]">{doc.original_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Size</span>
                  <span>{doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Department</span>
                  <span>{doc.department_name}</span>
                </div>
              </div>
            </div>
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
