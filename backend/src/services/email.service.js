const transporter = require('../config/email');

const notifyNewDocument = async (document, users) => {
  const recipients = users.map(u => u.email).filter(Boolean);
  if (recipients.length === 0) return;

  const uploadedAt = new Date(document.created_at).toLocaleString('th-TH', {
    dateStyle: 'long', timeStyle: 'short',
  });

  const mailOptions = {
    from:    `"DocSign System" <${process.env.SMTP_USER}>`,
    to:      process.env.SMTP_USER,   // visible recipient (the system itself)
    bcc:     recipients,              // hide other recipients from each other
    subject: `[DocSign] New Document Requires Your Signature: ${document.title}`,
    html: `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <style>
    body { margin:0; padding:0; background:#f3f4f6; font-family: Arial, sans-serif; }
    .wrap  { max-width:600px; margin:32px auto; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
    .head  { background:#1e3a8a; color:#fff; padding:28px 36px; }
    .head h1 { margin:0; font-size:22px; }
    .head p  { margin:4px 0 0; font-size:13px; color:#bfdbfe; }
    .body  { padding:32px 36px; }
    .card  { background:#eff6ff; border-left:4px solid #1e3a8a; padding:16px 20px; border-radius:6px; margin:20px 0; }
    .card h2 { margin:0 0 6px; font-size:17px; color:#1e40af; }
    .card p  { margin:4px 0; font-size:13px; color:#4b5563; }
    .btn   { display:inline-block; background:#1e3a8a; color:#fff; text-decoration:none; padding:12px 28px; border-radius:8px; font-weight:bold; font-size:14px; margin-top:20px; }
    .note  { font-size:12px; color:#9ca3af; margin-top:24px; }
    .foot  { background:#f9fafb; border-top:1px solid #e5e7eb; padding:14px 36px; font-size:12px; color:#9ca3af; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <h1>&#128196; New Document to Sign</h1>
      <p>มีเอกสารใหม่ที่ต้องการลายเซ็นของคุณ</p>
    </div>
    <div class="body">
      <p>เอกสารใหม่ได้รับการมอบหมายให้กับ department ของคุณ กรุณาเข้าสู่ระบบเพื่อตรวจสอบและลงนาม</p>
      <div class="card">
        <h2>${document.title}</h2>
        ${document.description ? `<p>${document.description}</p>` : ''}
        <p>&#128197; อัปโหลดเมื่อ: ${uploadedAt}</p>
      </div>
      <a href="${process.env.FRONTEND_URL}/dashboard" class="btn">View &amp; Sign Document</a>
      <p class="note">กรุณาลงนามภายในเวลาที่กำหนด หากมีปัญหาติดต่อ IT Support</p>
    </div>
    <div class="foot">
      This is an automated notification from DocSign. Please do not reply to this email.
    </div>
  </div>
</body>
</html>`,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = { notifyNewDocument };
