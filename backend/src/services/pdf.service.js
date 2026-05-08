const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');

const embedSignatures = async (filePath, signatures) => {
  const pdfBytes = fs.readFileSync(filePath);
  const pdfDoc  = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages   = pdfDoc.getPages();

  for (const sig of signatures) {
    const pageIndex = (sig.page_num || 1) - 1;
    if (pageIndex >= pages.length) continue;

    const page              = pages[pageIndex];
    const { width: pw, height: ph } = page.getSize();

    // Width is user-controlled (clamped 5%–95%); height scales with width.
    const widthPct = Math.min(0.95, Math.max(0.05, parseFloat(sig.width_pct) || 0.22));
    const boxW = pw * widthPct;
    // Stamp height scales with width so the proportions look right at any size.
    const boxH = Math.max(28, boxW * 0.30);
    const boxX = Math.min(sig.x_pct * pw, pw - boxW - 4);
    const boxY = ph - (sig.y_pct * ph) - boxH; // convert top→bottom origin

    if (sig.signature_type === 'draw' && sig.signature_data) {
      try {
        const b64    = sig.signature_data.replace(/^data:image\/png;base64,/, '');
        const imgBuf = Buffer.from(b64, 'base64');
        const img    = await pdfDoc.embedPng(imgBuf);

        // Use actual image aspect ratio for height — must also recalculate Y
        // because PDF origin is bottom-left, so Y depends on the real height.
        const imgH = boxW * (img.height / img.width);
        const imgY = ph - (sig.y_pct * ph) - imgH;   // top-aligned with the marker
        page.drawImage(img, { x: boxX, y: imgY, width: boxW, height: imgH, opacity: 0.92 });
      } catch {
        _drawTextStamp(page, sig, boxX, boxY, boxW, boxH, font, fontReg);
      }
    } else {
      _drawTextStamp(page, sig, boxX, boxY, boxW, boxH, font, fontReg);
    }
  }

  return pdfDoc.save();
};

const _drawTextStamp = (page, sig, x, y, w, h, fontBold, fontReg) => {
  // Font sizes scale with the box so a wider stamp looks right
  const titleSize = Math.max(8,  Math.min(14, w * 0.07));
  const nameSize  = Math.max(7,  Math.min(11, w * 0.05));
  const dateSize  = Math.max(6,  Math.min(9,  w * 0.04));
  const pad       = Math.max(4,  w * 0.025);

  // Background
  page.drawRectangle({
    x, y, width: w, height: h,
    color: rgb(0.93, 0.96, 1),
    opacity: 0.85,
  });
  // Border
  page.drawRectangle({
    x, y, width: w, height: h,
    borderColor: rgb(0.1, 0.25, 0.7),
    borderWidth: 1.2,
    opacity: 1,
  });
  page.drawText('Signed', {
    x: x + pad, y: y + h - titleSize - pad,
    size: titleSize, font: fontBold,
    color: rgb(0.1, 0.25, 0.7),
  });
  page.drawText(sig.signer_name || '', {
    x: x + pad, y: y + h - titleSize - nameSize - pad - 2,
    size: nameSize, font: fontReg,
    color: rgb(0.2, 0.2, 0.2),
    maxWidth: w - pad * 2,
  });
  page.drawText(_fmtDate(sig.signed_at), {
    x: x + pad, y: y + pad,
    size: dateSize, font: fontReg,
    color: rgb(0.45, 0.45, 0.45),
  });
};

const _fmtDate = (d) =>
  new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

module.exports = { embedSignatures };
