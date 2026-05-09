'use client';
import { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  ZoomIn, ZoomOut, RefreshCw, ChevronLeft, ChevronRight,
  Loader2, AlertCircle, MousePointerClick, Move,
} from 'lucide-react';
import api from '@/lib/api';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const DEFAULT_W  = 0.22;
const MIN_W      = 0.08;
const MAX_W      = 0.90;
const ASPECT     = 0.30;
const SNAP_DIST  = 0.018;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const BASE_W     = 700;

const HANDLES = [
  { id: 'nw', cx: 0,   cy: 0,   cursor: 'nwse-resize', rx: 'w' },
  { id: 'ne', cx: 1,   cy: 0,   cursor: 'nesw-resize', rx: 'e' },
  { id: 'se', cx: 1,   cy: 1,   cursor: 'nwse-resize', rx: 'e' },
  { id: 'sw', cx: 0,   cy: 1,   cursor: 'nesw-resize', rx: 'w' },
  { id: 'e',  cx: 1,   cy: 0.5, cursor: 'ew-resize',   rx: 'e' },
  { id: 'w',  cx: 0,   cy: 0.5, cursor: 'ew-resize',   rx: 'w' },
];

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, isNaN(v) ? lo : v));
}

function trySnap(v, points) {
  for (const p of points) {
    if (Math.abs(v - p) < SNAP_DIST) return { v: p, hit: true };
  }
  return { v, hit: false };
}

export default function PDFViewer({
  documentId, positionMode, onPositionSelect, marker, refreshKey, signatureImage,
}) {
  const [pdfUrl,   setPdfUrl]   = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum,  setPageNum]  = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [snapLine,   setSnapLine]  = useState({ x: null, y: null });
  const [imgAspect,  setImgAspect] = useState(ASPECT);
  const [zoomIndex,  setZoomIndex] = useState(2);

  const pageRef            = useRef(null);
  const interactRef        = useRef(null);
  const onSelectRef        = useRef(onPositionSelect);
  useEffect(() => { onSelectRef.current = onPositionSelect; });

  /* ── Load PDF ──────────────────────────────────────────────────── */
  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    setLoading(true);
    setPdfUrl(null);
    setNumPages(0);
    const params = new URLSearchParams({ _t: String(refreshKey) });
    if (positionMode) params.set('adjust', '1');
    const url = `/documents/${documentId}/file?${params.toString()}`;
    api.get(url, { responseType: 'blob' })
      .then(res => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setPdfUrl(objectUrl);
        setLoading(false);
      })
      .catch(async err => {
        if (cancelled) return;
        let detail = '';
        try {
          const blob = err?.response?.data;
          if (blob?.text) {
            const txt = await blob.text();
            try { detail = JSON.parse(txt)?.error || txt; } catch { detail = txt; }
          }
        } catch {}
        const st = err?.response?.status;
        setError(`โหลด PDF ไม่สำเร็จ${st ? ` (${st})` : ''}${detail ? `: ${detail}` : ''}`);
        setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    };
  }, [documentId, refreshKey, positionMode]);

  /* ── Click PDF to place marker ─────────────────────────────────── */
  const handlePageClick = e => {
    if (!positionMode || !onSelectRef.current) return;
    if (marker) return;
    if (interactRef.current) return;

    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pageRatio = rect.width / rect.height;
    const hFrac     = DEFAULT_W * (signatureImage ? imgAspect : ASPECT) * pageRatio;
    const x = clamp((e.clientX - rect.left) / rect.width  - DEFAULT_W / 2, 0, 1 - DEFAULT_W);
    const y = clamp((e.clientY - rect.top)  / rect.height - hFrac     / 2, 0, 1 - hFrac);
    onSelectRef.current({ page_num: pageNum, x_pct: x, y_pct: y, width_pct: DEFAULT_W });
  };

  /* ── Start drag / resize ───────────────────────────────────────── */
  const startInteract = mode => e => {
    if (!positionMode || !marker) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) return;

    const session = {
      mode,
      rect,
      sx:        e.clientX,
      sy:        e.clientY,
      orig:      { ...marker },
      pageRatio: rect.width / rect.height,
      hRatio:    imgAspect,
    };

    const move = ev => handleMove(ev, session);
    const up   = ()  => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup',   up);
      setSnapLine({ x: null, y: null });
      setTimeout(() => { interactRef.current = null; }, 30);
    };

    interactRef.current = session;
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup',   up);
  };

  /* ── Core move logic ────── */
  const handleMove = (e, session) => {
    const { mode, rect, sx, sy, orig, hRatio = ASPECT, pageRatio = 1 } = session;
    const dx = (e.clientX - sx) / rect.width;
    const dy = (e.clientY - sy) / rect.height;

    let x = orig.x_pct;
    let y = orig.y_pct;
    let w = orig.width_pct;
    const h = () => w * hRatio * pageRatio;
    let snapX = null, snapY = null;

    if (mode === 'drag') {
      x = clamp(orig.x_pct + dx, 0, 1 - w);
      y = clamp(orig.y_pct + dy, 0, 1 - h());

      const sl = trySnap(x, [0, 0.02, 0.5 - w / 2]);
      if (sl.hit) { x = sl.v; snapX = x; }
      else {
        const sr = trySnap(x + w, [0.98, 1, 0.5 + w / 2]);
        if (sr.hit) { x = sr.v - w; snapX = sr.v; }
      }
      const st = trySnap(y, [0, 0.02]);
      if (st.hit) { y = st.v; snapY = y; }
      else {
        const sb = trySnap(y + h(), [0.98, 1]);
        if (sb.hit) { y = sb.v - h(); snapY = sb.v; }
      }

    } else if (mode === 'resize-e') {
      w = clamp(orig.width_pct + dx, MIN_W, Math.min(MAX_W, 1 - orig.x_pct));
      const sr = trySnap(x + w, [0.98, 1]);
      if (sr.hit) { w = sr.v - x; snapX = sr.v; }

    } else if (mode === 'resize-w') {
      const rawX = clamp(orig.x_pct + dx, 0, orig.x_pct + orig.width_pct - MIN_W);
      w = orig.width_pct + (orig.x_pct - rawX);
      x = rawX;
      const sl = trySnap(x, [0, 0.02]);
      if (sl.hit) { w = orig.x_pct + orig.width_pct - sl.v; x = sl.v; snapX = sl.v; }
    }

    setSnapLine({ x: snapX, y: snapY });
    onSelectRef.current?.({ ...orig, x_pct: x, y_pct: y, width_pct: w });
  };

  useEffect(() => { if (!signatureImage) setImgAspect(ASPECT); }, [signatureImage]);

  useEffect(() => {
    const onWheel = e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoomIndex(i => e.deltaY < 0
        ? Math.min(ZOOM_STEPS.length - 1, i + 1)
        : Math.max(0, i - 1));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => () => { interactRef.current = null; }, []);

  const zoom      = ZOOM_STEPS[zoomIndex];
  const pageWidth = Math.round(Math.min(BASE_W, typeof window !== 'undefined' ? window.innerWidth - 80 : BASE_W) * zoom);
  const mw = marker?.width_pct ?? DEFAULT_W;
  const boxAspect = signatureImage ? (imgAspect || ASPECT) : ASPECT;

  /* ── Render ────────────────────────────────────────────────────── */
  if (loading) return (
    <div className="flex items-center justify-center h-96 card">
      <div className="text-center">
        <Loader2 size={36} className="animate-spin text-brand-600 mx-auto mb-2.5" />
        <p className="text-sm text-slate-500">กำลังโหลดเอกสาร…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center min-h-64 card bg-red-50/50 border-red-200 p-6">
      <div className="text-center">
        <AlertCircle size={32} className="text-red-500 mx-auto mb-2" />
        <p className="text-red-700 text-sm">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-200/60 rounded-xl border border-slate-200 p-4 min-h-[500px] max-w-full overflow-hidden">
     <div className="flex flex-col items-center gap-3">

      {/* Instruction banner */}
      {positionMode && (
        <div className="w-full bg-gradient-to-r from-brand-900 to-brand-800 text-white text-xs font-medium text-center py-2.5 px-4 rounded-lg shadow-md select-none flex items-center justify-center gap-2">
          {marker
            ? (<><Move size={14} /> ลากกรอบเพื่อย้ายตำแหน่ง · ลากจุด <span className="inline-block w-2 h-2 rounded-full bg-white ring-2 ring-brand-400 mx-1" /> เพื่อปรับขนาด</>)
            : (<><MousePointerClick size={14} /> คลิกบนเอกสารเพื่อวางลายเซ็น</>)
          }
        </div>
      )}

      {/* Zoom toolbar */}
      <div className="flex items-center gap-1 bg-white px-1.5 py-1 rounded-full shadow-md border border-slate-200 select-none">
        <button onClick={() => setZoomIndex(i => Math.max(0, i - 1))}
          disabled={zoomIndex === 0}
          className="w-8 h-8 grid place-items-center rounded-full text-slate-600 hover:bg-slate-100 hover:text-brand-700 disabled:opacity-30 disabled:hover:bg-transparent transition"
          title="ย่อ (Ctrl+Scroll)">
          <ZoomOut size={16} />
        </button>
        <span className="w-12 text-center font-mono text-xs text-slate-700 font-semibold tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoomIndex(i => Math.min(ZOOM_STEPS.length - 1, i + 1))}
          disabled={zoomIndex === ZOOM_STEPS.length - 1}
          className="w-8 h-8 grid place-items-center rounded-full text-slate-600 hover:bg-slate-100 hover:text-brand-700 disabled:opacity-30 disabled:hover:bg-transparent transition"
          title="ขยาย (Ctrl+Scroll)">
          <ZoomIn size={16} />
        </button>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <button onClick={() => setZoomIndex(2)}
          className="w-8 h-8 grid place-items-center rounded-full text-slate-600 hover:bg-slate-100 hover:text-brand-700 transition"
          title="รีเซ็ต zoom">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Hidden img for measuring drawn signature aspect */}
      {signatureImage && (
        <img
          src={signatureImage}
          alt="" aria-hidden
          onLoad={e => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
            if (w > 0) setImgAspect(h / w);
          }}
          style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
        />
      )}

      {/* Scrollable PDF area */}
      <div className="w-full overflow-auto">
       <div className="flex justify-center" style={{ minWidth: 'max-content' }}>
        <Document
          key={pdfUrl}
          file={pdfUrl}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          onLoadError={() => setError('Failed to render PDF')}
          className="shadow-2xl rounded"
        >
        <div
          ref={pageRef}
          className="relative select-none"
          onClick={handlePageClick}
          style={{ cursor: positionMode && !marker ? 'crosshair' : 'default' }}
        >
          {numPages > 0 && <Page pageNumber={pageNum} width={pageWidth} />}

          {positionMode && (
            <div className="absolute inset-0 ring-2 ring-brand-500/40 pointer-events-none rounded" />
          )}

          {positionMode && snapLine.x !== null && (
            <div className="absolute top-0 bottom-0 w-px bg-brand-500/80 pointer-events-none z-30"
              style={{ left: `${snapLine.x * 100}%` }} />
          )}
          {positionMode && snapLine.y !== null && (
            <div className="absolute left-0 right-0 h-px bg-brand-500/80 pointer-events-none z-30"
              style={{ top: `${snapLine.y * 100}%` }} />
          )}

          {marker && marker.page_num === pageNum && positionMode && (
            <div
              className="absolute z-20"
              style={{
                left:        `${marker.x_pct * 100}%`,
                top:         `${marker.y_pct * 100}%`,
                width:       `${mw * 100}%`,
                aspectRatio: `${1} / ${boxAspect}`,
              }}
            >
              <div
                onMouseDown={startInteract('drag')}
                className="absolute inset-0 cursor-move overflow-hidden"
                style={{
                  background:   'transparent',
                  border:       '2px dashed #1d4ed8',
                  borderRadius: 6,
                  boxShadow:    '0 0 0 1px rgba(29,78,216,0.25), 0 4px 16px rgba(29,78,216,0.15)',
                }}
              >
                {signatureImage ? (
                  <img
                    src={signatureImage}
                    alt="signature"
                    className="absolute inset-0 w-full h-full pointer-events-none select-none"
                    style={{ opacity: 0.92 }}
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-brand-700 font-bold select-none text-[11px] opacity-60 tracking-[0.15em]">
                      SIGNATURE
                    </span>
                  </div>
                )}
              </div>

              <div className="absolute pointer-events-none z-30 whitespace-nowrap"
                style={{ top: -24, right: 0 }}>
                <span className="bg-slate-900 text-white text-[10px] font-mono px-2 py-0.5 rounded-md shadow-md">
                  {Math.round(mw * 100)}% · p.{marker.page_num}
                </span>
              </div>

              {HANDLES.map(h => (
                <div
                  key={h.id}
                  onMouseDown={startInteract(`resize-${h.rx}`)}
                  style={{
                    position:     'absolute',
                    width:         12,
                    height:        12,
                    left:  h.cx === 0   ? -7 : h.cx === 1 ? 'calc(100% - 5px)' : 'calc(50% - 6px)',
                    top:   h.cy === 0   ? -7 : h.cy === 1 ? 'calc(100% - 5px)' : 'calc(50% - 6px)',
                    cursor:        h.cursor,
                    background:   'white',
                    border:       '2px solid #1d4ed8',
                    borderRadius: '50%',
                    boxShadow:    '0 2px 6px rgba(0,0,0,0.3)',
                    zIndex:        30,
                  }}
                />
              ))}
            </div>
          )}
        </div>
        </Document>
       </div>
      </div>

      {/* Page navigation */}
      {numPages > 1 && (
        <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-full shadow-md border border-slate-200 text-sm select-none">
          <button onClick={() => setPageNum(p => Math.max(1, p - 1))}
            disabled={pageNum <= 1}
            className="w-8 h-8 grid place-items-center rounded-full text-slate-600 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-30 disabled:hover:bg-transparent transition"
            title="Previous page">
            <ChevronLeft size={18} />
          </button>
          <span className="text-slate-700 font-medium text-xs px-2 tabular-nums min-w-[80px] text-center">
            หน้า {pageNum} / {numPages}
          </span>
          <button onClick={() => setPageNum(p => Math.min(numPages, p + 1))}
            disabled={pageNum >= numPages}
            className="w-8 h-8 grid place-items-center rounded-full text-slate-600 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-30 disabled:hover:bg-transparent transition"
            title="Next page">
            <ChevronRight size={18} />
          </button>
        </div>
      )}
     </div>
    </div>
  );
}
