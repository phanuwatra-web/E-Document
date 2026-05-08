const nodemailer = require('nodemailer');
const logger     = require('./logger');

// SMTP host/port are env-driven so this app works with any provider
// (Office365, Gmail Workspace, SendGrid, Postmark, internal relay…). Defaults
// keep the previous behaviour (Office365 STARTTLS on 587) for zero-config
// operation in existing deployments.
const SMTP_HOST   = process.env.SMTP_HOST   || 'smtp.office365.com';
const SMTP_PORT   = parseInt(process.env.SMTP_PORT, 10) || 587;
// SMTP_SECURE=true → implicit TLS (port 465). Otherwise STARTTLS upgrade.
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  requireTLS: !SMTP_SECURE, // require STARTTLS when not already implicit-TLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    minVersion: 'TLSv1.2',
    // never disable certificate validation in production — it allows MITM attacks
    rejectUnauthorized: process.env.NODE_ENV === 'production',
  },
});

transporter.verify((err) => {
  if (err) {
    logger.warn(
      { err: { message: err.message }, host: SMTP_HOST, port: SMTP_PORT },
      'email transporter unavailable'
    );
  } else {
    logger.info({ host: SMTP_HOST, port: SMTP_PORT }, 'SMTP ready');
  }
});

module.exports = transporter;
