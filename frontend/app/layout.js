import './globals.css';
import { IBM_Plex_Sans_Thai, Inter } from 'next/font/google';
import { Toaster } from 'sonner';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-thai',
  display: 'swap',
});

export const metadata = {
  title:       'DocSign – Document Signing System',
  description: 'Internal document management and e-signature platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th" className={`${inter.variable} ${plexThai.variable}`}>
      <body className="bg-slate-50 min-h-screen font-sans antialiased text-slate-800">
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            style: { fontFamily: 'var(--font-thai), var(--font-inter), system-ui' },
          }}
        />
      </body>
    </html>
  );
}
