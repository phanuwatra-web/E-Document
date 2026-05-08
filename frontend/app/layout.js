import './globals.css';

export const metadata = {
  title:       'DocSign – Document Signing System',
  description: 'Internal document management and e-signature platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body className="bg-gray-100 min-h-screen">{children}</body>
    </html>
  );
}
