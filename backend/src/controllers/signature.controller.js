const db    = require('../config/database');
const audit = require('../services/audit.service');

// parseFloat returns NaN (not null/undefined) on bad input, so `??` fallback won't fire.
const clamp = (v, fallback, min = 0, max = 1) => {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const signDocument = async (req, res, next) => {
  try {
    const { document_id, signature_type, signature_data, page_num, x_pct, y_pct, width_pct } = req.body;

    if (!document_id || !signature_type) {
      return res.status(400).json({ error: 'document_id and signature_type are required' });
    }
    if (!['click', 'draw'].includes(signature_type)) {
      return res.status(400).json({ error: 'signature_type must be "click" or "draw"' });
    }
    if (signature_type === 'draw' && !signature_data) {
      return res.status(400).json({ error: 'signature_data is required for draw type' });
    }

    const assignCheck = await db.query(
      'SELECT id, status FROM document_assignments WHERE document_id = $1 AND user_id = $2',
      [document_id, req.user.id]
    );
    if (!assignCheck.rows[0]) {
      return res.status(403).json({ error: 'You are not assigned to this document' });
    }
    if (assignCheck.rows[0].status === 'signed') {
      return res.status(409).json({ error: 'You have already signed this document. Use "unsign" first if you want to re-sign.' });
    }

    const ip     = req.ip || req.socket?.remoteAddress || 'unknown';
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const pageNum  = Number.isInteger(parseInt(page_num)) && parseInt(page_num) >= 1 ? parseInt(page_num) : 1;
      const xPct     = clamp(x_pct,     0.05);
      const yPct     = clamp(y_pct,     0.10);
      const widthPct = clamp(width_pct, 0.22, 0.05, 0.95);  // min 5%, max 95% of page width

      const sigResult = await client.query(
        `INSERT INTO signatures (document_id, user_id, signature_type, signature_data, ip_address, page_num, x_pct, y_pct, width_pct)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, signed_at, signature_type`,
        [document_id, req.user.id, signature_type, signature_data || null, ip, pageNum, xPct, yPct, widthPct]
      );

      await client.query(
        `UPDATE document_assignments SET status = 'signed'
         WHERE document_id = $1 AND user_id = $2`,
        [document_id, req.user.id]
      );

      await client.query('COMMIT');

      audit.log({
        req,
        action:       audit.ACTIONS.SIGNATURE_SIGN,
        resourceType: 'signature',
        resourceId:   sigResult.rows[0].id,
        metadata: {
          document_id, signature_type,
          page_num: pageNum, x_pct: xPct, y_pct: yPct, width_pct: widthPct,
        },
      });

      res.status(201).json({
        ok:        true,
        message:   'Document signed successfully',
        signature: sigResult.rows[0],
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
};

// Remove the current user's signature on a document so they can re-sign with a new
// position/size. We reset the assignment back to 'pending'.
const unsignDocument = async (req, res, next) => {
  const { documentId } = req.params;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const del = await client.query(
      'DELETE FROM signatures WHERE document_id = $1 AND user_id = $2 RETURNING id',
      [documentId, req.user.id]
    );
    if (!del.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'You have not signed this document' });
    }

    await client.query(
      `UPDATE document_assignments SET status = 'pending'
       WHERE document_id = $1 AND user_id = $2`,
      [documentId, req.user.id]
    );

    await client.query('COMMIT');

    audit.log({
      req,
      action:       audit.ACTIONS.SIGNATURE_UNSIGN,
      resourceType: 'signature',
      resourceId:   del.rows[0].id,
      metadata:     { document_id: parseInt(documentId) },
    });

    res.json({ ok: true, message: 'Signature removed. You can sign again.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const updateSignaturePosition = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { x_pct, y_pct, width_pct, page_num } = req.body;

    const pageNum  = parseInt(page_num) >= 1 ? parseInt(page_num) : 1;
    const xPct     = clamp(x_pct,     0.05);
    const yPct     = clamp(y_pct,     0.10);
    const widthPct = clamp(width_pct, 0.22, 0.05, 0.95);

    // Snapshot the previous position so the audit log captures before/after.
    const prev = await db.query(
      `SELECT page_num, x_pct, y_pct, width_pct FROM signatures
       WHERE document_id=$1 AND user_id=$2`,
      [documentId, req.user.id]
    );

    const result = await db.query(
      `UPDATE signatures SET x_pct=$1, y_pct=$2, width_pct=$3, page_num=$4
       WHERE document_id=$5 AND user_id=$6 RETURNING id`,
      [xPct, yPct, widthPct, pageNum, documentId, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Signature not found' });

    audit.log({
      req,
      action:       audit.ACTIONS.SIGNATURE_UPDATE_POS,
      resourceType: 'signature',
      resourceId:   result.rows[0].id,
      metadata: {
        document_id: parseInt(documentId),
        before: prev.rows[0],
        after:  { page_num: pageNum, x_pct: xPct, y_pct: yPct, width_pct: widthPct },
      },
    });

    res.json({ ok: true, message: 'Position updated' });
  } catch (err) {
    next(err);
  }
};

// Returns the calling user's own signature (including image data) for a document
const getMySignature = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const result = await db.query(
      `SELECT signature_type, signature_data, page_num, x_pct, y_pct, width_pct, signed_at
       FROM signatures WHERE document_id = $1 AND user_id = $2`,
      [documentId, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Signature not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

const getDocumentSignatures = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const result = await db.query(
      `SELECT s.id, s.signature_type, s.signed_at, s.ip_address,
              u.name, u.employee_id, d.name AS department_name
       FROM signatures s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE s.document_id = $1
       ORDER BY s.signed_at`,
      [documentId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

module.exports = { signDocument, unsignDocument, updateSignaturePosition, getMySignature, getDocumentSignatures };
