'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Lightweight pagination control.
 *
 *   <Pagination page={page} totalPages={totalPages} total={total} limit={limit}
 *               onPageChange={setPage} />
 */
export default function Pagination({ page, totalPages, total, limit, onPageChange }) {
  if (totalPages <= 1) return null;

  // Build a compact page list with ellipsis: 1 … 4 5 [6] 7 8 … 12
  const pages = [];
  const add = (n) => pages.push(n);
  const window = 1; // pages on each side of current
  add(1);
  if (page - window > 2) add('…l');
  for (let i = Math.max(2, page - window); i <= Math.min(totalPages - 1, page + window); i++) add(i);
  if (page + window < totalPages - 1) add('…r');
  if (totalPages > 1) add(totalPages);

  const from = (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between gap-3 mt-4 flex-wrap text-sm">
      <p className="text-slate-500 text-xs">
        แสดง <span className="font-semibold text-slate-700 tabular-nums">{from}–{to}</span> จาก <span className="font-semibold text-slate-700 tabular-nums">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1}
          className="w-8 h-8 grid place-items-center rounded-md text-slate-600 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-30 disabled:hover:bg-transparent transition"
          title="ก่อนหน้า">
          <ChevronLeft size={16} />
        </button>
        {pages.map((p, i) => (
          typeof p === 'number' ? (
            <button key={i} onClick={() => onPageChange(p)}
              className={`min-w-[32px] h-8 px-2 rounded-md text-xs font-medium tabular-nums transition
                ${p === page
                  ? 'bg-brand-700 text-white'
                  : 'text-slate-600 hover:bg-brand-50 hover:text-brand-700'}`}>
              {p}
            </button>
          ) : (
            <span key={i} className="text-slate-400 px-1 select-none">…</span>
          )
        ))}
        <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages}
          className="w-8 h-8 grid place-items-center rounded-md text-slate-600 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-30 disabled:hover:bg-transparent transition"
          title="ถัดไป">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
