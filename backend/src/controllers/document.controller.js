const fs   = require('fs');
const path = require('path');
const db   = require('../config/database');
const emailService  = require('../services/email.service');
const { embedSignatures } = require('../services/pdf.service');
const audit = require('../services/audit.service');

const uploadDocument = async (req, res, next) => {
  // Helper: clean up the uploaded file when validation fails afterwards.
  const cleanupFile = () => {
    if (req.file?.path) {
      fs.promises.unlink(req.file.path).catch(() => {});
    }
  };

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'PDF file is required' });
    }

    const { title, description, department_id } = req.body;
    if (!title || !department_id) {
      cleanupFile();
      return res.status(400).json({ error: 'title and department_id are required' });
    }

    const deptCheck = await db.query('SELECT id FROM departments WHERE id = $1', [department_id]);
    if (!deptCheck.rows[0]) {
      cleanupFile();
      return res.status(400).json({ error: 'Department not found' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const docResult = await client.query(
        `INSERT INTO documents (title, description, file_path, original_name, file_size, department_id, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          title.trim(),
          description?.trim() || null,
          req.file.filename,
          req.file.originalname,
          req.file.size,
          department_id,
          req.user.id,
        ]
      );
      const document = docResult.rows[0];

      const usersResult = await client.query(
        `SELECT id, name, email FROM users
         WHERE department_id = $1 AND is_active = true AND role = 'user'`,
        [department_id]
      );

      for (const u of usersResult.rows) {
        await client.query(
          `INSERT INTO document_assignments (document_id, user_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [document.id, u.id]
        );
      }

      await client.query('COMMIT');

      if (usersResult.rows.length > 0) {
        emailService.notifyNewDocument(document, usersResult.rows).catch(err => {
          // Use the request-scoped logger so the failure shares reqId with
          // the upload that triggered it.
          (req.log || require('../config/logger')).warn(
            { err: { message: err.message }, document_id: document.id, recipients: usersResult.rows.length },
            'email notification failed'
          );
        });
      }

      res.status(201).json({
        message: 'Document uploaded successfully',
        document: {
          id:            document.id,
          title:         document.title,
          department_id: document.department_id,
          created_at:    document.created_at,
        },
        notified_users: usersResult.rows.length,
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

const getDocuments = async (req, res, next) => {
  try {
    let query, params;

    if (req.user.role === 'admin') {
      query = `
        SELECT d.*,
               dept.name AS department_name,
               u.name    AS uploaded_by_name,
               COUNT(da.id)                                          AS total_assignees,
               COUNT(da.id) FILTER (WHERE da.status = 'signed')     AS signed_count
        FROM documents d
        LEFT JOIN departments dept ON d.department_id = dept.id
        LEFT JOIN users u          ON d.uploaded_by   = u.id
        LEFT JOIN document_assignments da ON d.id = da.document_id
        GROUP BY d.id, dept.name, u.name
        ORDER BY d.created_at DESC`;
      params = [];
    } else {
      query = `
        SELECT d.*,
               dept.name AS department_name,
               u.name    AS uploaded_by_name,
               da.status AS my_status
        FROM documents d
        LEFT JOIN departments dept ON d.department_id = dept.id
        LEFT JOIN users u          ON d.uploaded_by   = u.id
        JOIN document_assignments da ON d.id = da.document_id AND da.user_id = $1
        ORDER BY d.created_at DESC`;
      params = [req.user.id];
    }

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

const getDocument = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT d.*, dept.name AS department_name, u.name AS uploaded_by_name
       FROM documents d
       LEFT JOIN departments dept ON d.department_id = dept.id
       LEFT JOIN users u          ON d.uploaded_by   = u.id
       WHERE d.id = $1`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Document not found' });

    const document = result.rows[0];

    if (req.user.role !== 'admin') {
      const assignCheck = await db.query(
        'SELECT status FROM document_assignments WHERE document_id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      if (!assignCheck.rows[0]) return res.status(403).json({ error: 'Access denied' });
      document.my_status = assignCheck.rows[0].status;
    }

    const sigResult = await db.query(
      `SELECT s.id, s.signature_type, s.signed_at, s.ip_address,
              u.name AS signer_name, u.employee_id
       FROM signatures s
       JOIN users u ON s.user_id = u.id
       WHERE s.document_id = $1
       ORDER BY s.signed_at`,
      [id]
    );
    document.signatures = sigResult.rows;

    res.json(document);
  } catch (err) {
    next(err);
  }
};

const getDocumentFile = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'SELECT file_path, original_name FROM documents WHERE id = $1',
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Document not found' });

    if (req.user.role !== 'admin') {
      const check = await db.query(
        'SELECT id FROM document_assignments WHERE document_id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      if (!check.rows[0]) return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = path.join(__dirname, '../../uploads', result.rows[0].file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server' });

    // When the client is in "adjust" mode, exclude the caller's own signature
    // so the live dashed-box overlay isn't competing with a stale embed.
    const isAdjust = req.query.adjust === '1';
    const sigResult = isAdjust
      ? await db.query(
          `SELECT s.signature_type, s.signature_data, s.page_num, s.x_pct, s.y_pct, s.width_pct, s.signed_at,
                  u.name AS signer_name
           FROM signatures s
           JOIN users u ON s.user_id = u.id
           WHERE s.document_id = $1 AND s.user_id <> $2
           ORDER BY s.signed_at`,
          [id, req.user.id]
        )
      : await db.query(
          `SELECT s.signature_type, s.signature_data, s.page_num, s.x_pct, s.y_pct, s.width_pct, s.signed_at,
                  u.name AS signer_name
           FROM signatures s
           JOIN users u ON s.user_id = u.id
           WHERE s.document_id = $1
           ORDER BY s.signed_at`,
          [id]
        );

    res.setHeader('Content-Type', 'application/pdf');
    // Force the browser/axios to always re-fetch — otherwise the cached file
    // (rendered before the latest signature was stored) keeps coming back
    // and the user thinks signatures weren't saved.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    // RFC 5987: HTTP headers only allow ASCII, so UTF-8 filenames (Thai, etc.) must be
    // percent-encoded in `filename*` and a safe ASCII fallback given in `filename`.
    const rawName     = result.rows[0].original_name || 'document.pdf';
    const asciiName   = rawName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'") || 'document.pdf';
    const utf8Encoded = encodeURIComponent(rawName);
    const isDownload  = req.query.download === '1';
    const disposition = isDownload ? 'attachment' : 'inline';
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${asciiName}"; filename*=UTF-8''${utf8Encoded}`
    );

    // Only audit explicit downloads — viewing the embedded preview every render
    // would flood the log. Track downloads (which produce a saved artefact)
    // and skip the inline-view case.
    if (isDownload) {
      audit.log({
        req,
        action:       audit.ACTIONS.DOCUMENT_DOWNLOAD,
        resourceType: 'document',
        resourceId:   parseInt(id),
        metadata: {
          filename:        rawName,
          embedded_count:  sigResult.rows.length,
        },
      });
    }

    if (sigResult.rows.length > 0) {
      const pdfBytes = await embedSignatures(filePath, sigResult.rows);
      res.send(Buffer.from(pdfBytes));
    } else {
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    next(err);
  }
};

const getDocumentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT u.employee_id, u.name, u.email,
              da.status,
              s.signed_at, s.signature_type
       FROM document_assignments da
       JOIN users u ON da.user_id = u.id
       LEFT JOIN signatures s ON s.document_id = da.document_id AND s.user_id = da.user_id
       WHERE da.document_id = $1
       ORDER BY da.assigned_at`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

const deleteDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'DELETE FROM documents WHERE id = $1 RETURNING file_path',
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Document not found' });

    // Delete the file asynchronously and tolerate "file already missing".
    // A failed unlink should NOT roll back the DB delete or hang the request.
    const filePath = path.join(__dirname, '../../uploads', result.rows[0].file_path);
    fs.promises.unlink(filePath).catch(err => {
      if (err.code !== 'ENOENT') {
        (req.log || require('../config/logger')).warn(
          { err: { message: err.message }, document_id: parseInt(id), filePath },
          'orphaned file after document deletion — manual cleanup required'
        );
      }
    });

    res.json({ ok: true, message: 'Document deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  uploadDocument,
  getDocuments,
  getDocument,
  getDocumentFile,
  getDocumentStatus,
  deleteDocument,
};
