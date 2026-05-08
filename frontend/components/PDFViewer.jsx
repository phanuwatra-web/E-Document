'use client';
import { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import api from '@/lib/api';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const DEFAULT_W  = 0.22;
const MIN_W      = 0.08;
const MAX_W      = 0.90;
const ASPECT     = 0.30;   // fallback box height = width × ASPECT (used when no image)
const SNAP_DIST  = 0.018;  // snap threshold (fraction of page)
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const BASE_W     = 700;    // base page width at zoom 1×

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
  const [imgAspect,  setImgAspect] = useState(ASPECT); // real h/w ratio of drawn signature
  const [zoomIndex,  setZoomIndex] = useState(2);       // index into ZOOM_STEPS; 2 = 1×

  const pageRef            = useRef(null);
  const interactRef        = useRef(null);   // active drag/resize session
  // Always-fresh ref so event handlers never capture a stale onPositionSelect
  const onSelectRef        = useRef(onPositionSelect);
  useEffect(() => { onSelectRef.current = onPositionSelect; });

  /* ── Load PDF ──────────────────────────────────────────────────── */
  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    setLoading(true);
    setPdfUrl(null);
    setNumPages(0);   // reset — old value belongs to the previous PDF
    // While adjusting, skip embedding *my own* signature so the dashed box
    // is the single source of truth — no "ghost" signature underneath.
    // The `_t` token forces a fresh request after each refreshKey bump so we
    // never see a stale cached PDF (which would look like signatures didn't save).
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
    // Defer the revoke so <Document> has time to fully unmount and release
    // the blob before the URL is invalidated. Revoking synchronously here
    // races with pdf.js worker calls and crashes with "sendWithPromise on null".
    return () => {
      cancelled = true;
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    };
  }, [documentId, refreshKey, positionMode]);

  /* ── Click PDF to place marker ─────────────────────────────────── */
  const handlePageClick = e => {
    if (!positionMode || !onSelectRef.current) return;
    if (marker) return;           // already placed — user drags
    if (interactRef.current) return;

    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pageRatio = rect.width / rect.height;          // pw/ph
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
      // Image height as a fraction of the page height. The box is rendered with
      // `width = mw% of pageWidth` and `aspect = 1 : imgAspect`, so on screen its
      // pixel-height = mw × pageWidth × imgAspect. As a fraction of pageHeight
      // (which equals the y_pct unit) that becomes mw × imgAspect × (pw/ph).
      // We get pw/ph from the rect (preview preserves PDF aspect).
      pageRatio: rect.width / rect.height,
      hRatio:    imgAspect,
    };

    // Create stable handlers bound to this session so removeEventListener works correctly
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

  /* ── Core move logic (pure function, no closure over state) ────── */
  const handleMove = (e, session) => {
    const { mode, rect, sx, sy, orig, hRatio = ASPECT, pageRatio = 1 } = session;
    const dx = (e.clientX - sx) / rect.width;
    const dy = (e.clientY - sy) / rect.height;

    let x = orig.x_pct;
    let y = orig.y_pct;
    let w = orig.width_pct;
    // Image height as a fraction of *page height* (so it can be compared to y_pct).
    // hRatio is the image's height/width ratio, pageRatio is pw/ph.
    const h = () => w * hRatio * pageRatio;
    let snapX = null, snapY = null;

    if (mode === 'drag') {
      x = clamp(orig.x_pct + dx, 0, 1 - w);
      y = clamp(orig.y_pct + dy, 0, 1 - h());

      // Snap left / centre / right
      const sl = trySnap(x, [0, 0.02, 0.5 - w / 2]);
      if (sl.hit) { x = sl.v; snapX = x; }
      else {
        const sr = trySnap(x + w, [0.98, 1, 0.5 + w / 2]);
        if (sr.hit) { x = sr.v - w; snapX = sr.v; }
      }
      // Snap top / bottom
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

  // Reset aspect ratio when signature image changes
  useEffect(() => { if (!signatureImage) setImgAspect(ASPECT); }, [signatureImage]);

  // Ctrl+scroll to zoom
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

  // Cleanup on unmount
  useEffect(() => () => { interactRef.current = null; }, []);

  const zoom      = ZOOM_STEPS[zoomIndex];
  const pageWidth = Math.round(Math.min(BASE_W, typeof window !== 'undefined' ? window.innerWidth - 80 : BASE_W) * zoom);
  const mw = marker?.width_pct ?? DEFAULT_W;
  // The box's aspect must equal the signature's natural aspect — NOT use a
  // height-percentage of the parent, because % height is relative to parent
  // height (page height) while the image aspect is width-based.
  const boxAspect = signatureImage ? (imgAspect || ASPECT) : ASPECT;

  /* ── Render ────────────────────────────────────────────────────── */
  if (loading) return (
    <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading PDF…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center min-h-64 bg-red-50 rounded-lg p-6">
      <p className="text-red-600 text-sm text-center">{error}</p>
    </div>
  );

  return (
    /* Outer wrapper is bound to its parent's width and never expands when
       the PDF inside grows (e.g. via zoom). The PDF gets its own scrollable
       sub-area below so controls stay anchored at this width. */
    <div className="bg-gray-300 rounded-lg p-4 min-h-[500px] max-w-full overflow-hidden">
     <div className="flex flex-col items-center gap-3">

      {/* Instruction banner */}
      {positionMode && (
        <div className="w-full bg-gray-900 text-white text-xs font-medium text-center py-2 px-4 rounded-lg shadow select-none">
          {marker
            ? '↔ ลากกรอบเพื่อย้ายตำแหน่ง · ลาก ● เพื่อปรับขนาด'
            : '🖱 คลิกบนเอกสารเพื่อวางลายเซ็น'}
        </div>
      )}

      {/* Zoom controls */}
      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow text-sm select-none">
        <button
          onClick={() => setZoomIndex(i => Math.max(0, i - 1))}
          disabled={zoomIndex === 0}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30 text-lg font-bold transition"
          title="Zoom out"
        >−</button>
        <span className="w-10 text-center font-mono text-xs text-gray-700 font-semibold">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoomIndex(i => Math.min(ZOOM_STEPS.length - 1, i + 1))}
          disabled={zoomIndex === ZOOM_STEPS.length - 1}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30 text-lg font-bold transition"
          title="Zoom in"
        >+</button>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <button
          onClick={() => setZoomIndex(2)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium transition"
          title="Reset zoom"
        >Reset</button>
      </div>

      {/* Hidden img used only to measure natural aspect ratio of the drawn signature */}
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

      {/* Scrollable PDF area — independent of the controls above/below.
          The inner div uses min-width: max-content so it grows to fit the
          full PDF when zoomed (parent shows a horizontal scrollbar), and
          flex justify-center keeps the page centred when it's narrower. */}
      <div className="w-full overflow-auto">
       <div className="flex justify-center" style={{ minWidth: 'max-content' }}>
        <Document
          key={pdfUrl}                     /* fresh worker for each blob URL */
          file={pdfUrl}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          onLoadError={() => setError('Failed to render PDF')}
          className="shadow-xl rounded"
        >
        <div
          ref={pageRef}
          className="relative select-none"
          onClick={handlePageClick}
          style={{ cursor: positionMode && !marker ? 'crosshair' : 'default' }}
        >
          {/* Wait until the document reports it's loaded — calling getPage
              before that races with worker startup. */}
          {numPages > 0 && <Page pageNumber={pageNum} width={pageWidth} />}

          {/* Blue border overlay */}
          {positionMode && (
            <div className="absolute inset-0 ring-2 ring-blue-500/40 pointer-events-none rounded" />
          )}

          {/* Snap guide lines */}
          {positionMode && snapLine.x !== null && (
            <div className="absolute top-0 bottom-0 w-px bg-blue-500/80 pointer-events-none z-30"
              style={{ left: `${snapLine.x * 100}%` }} />
          )}
          {positionMode && snapLine.y !== null && (
            <div className="absolute left-0 right-0 h-px bg-blue-500/80 pointer-events-none z-30"
              style={{ top: `${snapLine.y * 100}%` }} />
          )}

          {/* Interactive signature box — width is % of parent width, height is
              derived from aspect-ratio so it precisely matches the image. */}
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
              {/* Draggable body — transparent background so PDF content shows through */}
              <div
                onMouseDown={startInteract('drag')}
                className="absolute inset-0 cursor-move overflow-hidden"
                style={{
                  background:   'transparent',
                  border:       '2px dashed #2563eb',
                  borderRadius: 4,
                  boxShadow:    '0 0 0 1px rgba(37,99,235,0.25)',
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
                    <span className="text-blue-700 font-bold select-none text-[11px] opacity-60 tracking-[0.15em]">
                      SIGNATURE
                    </span>
                  </div>
                )}
              </div>

              {/* Dimension chip */}
              <div className="absolute pointer-events-none z-30 whitespace-nowrap"
                style={{ top: -22, right: 0 }}>
                <span className="bg-gray-900 text-white text-[10px] font-mono px-1.5 py-0.5 rounded shadow">
                  {Math.round(mw * 100)}% · p.{marker.page_num}
                </span>
              </div>

              {/* 6 resize handles */}
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
                    border:       '2px solid #2563eb',
                    borderRadius: '50%',
                    boxShadow:    '0 1px 4px rgba(0,0,0,0.3)',
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
      {/* /Scrollable PDF area */}

      {/* Page navigation */}
      {numPages > 1 && (
        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-full shadow text-sm">
          <button
            onClick={() => setPageNum(p => Math.max(1, p - 1))}
            disabled={pageNum <= 1}
            className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-40 hover:bg-blue-700 transition"
          >‹ Prev</button>
          <span className="text-gray-700 font-medium">Page {pageNum} / {numPages}</span>
          <button
            onClick={() => setPageNum(p => Math.min(numPages, p + 1))}
            disabled={pageNum >= numPages}
            className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-40 hover:bg-blue-700 transition"
          >Next ›</button>
        </div>
      )}
     </div>
    </div>
  );
}
