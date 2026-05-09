/**
 * Tiny wrapper around xlsx for one-call exports from the UI.
 *
 *   exportToExcel({
 *     filename: 'documents.xlsx',
 *     sheetName: 'Documents',
 *     rows: [{ Title: 'a', Dept: 'HR' }, ...],
 *     columnWidths: [40, 15, ...],   // optional, in chars
 *   });
 */
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export function exportToExcel({ filename, sheetName = 'Sheet1', rows, columnWidths }) {
  if (!rows || rows.length === 0) {
    throw new Error('No rows to export');
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  if (columnWidths) {
    ws['!cols'] = columnWidths.map(w => ({ wch: w }));
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); // Excel max 31 chars
  XLSX.writeFile(wb, filename);
}

/**
 * Build a timestamped filename like `docsign-documents-2026-05-09_143022.xlsx`.
 */
export function timestampedFilename(prefix, ext = 'xlsx') {
  const ts = format(new Date(), 'yyyy-MM-dd_HHmmss');
  return `docsign-${prefix}-${ts}.${ext}`;
}
