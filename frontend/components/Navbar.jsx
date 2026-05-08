'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function Navbar({ user }) {
  const router = useRouter();

  const logout = async () => {
    // Hit the server so it can clear the httpOnly cookies — JS can't clear
    // them itself. Even if the network fails, we still purge local state
    // so the UI reflects "logged out".
    try { await api.post('/auth/logout'); } catch {}
    try { localStorage.removeItem('user'); } catch {}
    router.push('/login');
  };

  const home = user?.role === 'admin' ? '/admin' : '/dashboard';

  return (
    <nav className="bg-blue-900 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex justify-between items-center h-16">
        <div className="flex items-center gap-6">
          <Link href={home} className="font-bold text-lg tracking-tight">
            📄 DocSign
          </Link>
          {user?.role === 'admin' && (
            <>
              <Link href="/admin"        className="text-blue-200 hover:text-white text-sm transition">Dashboard</Link>
              <Link href="/admin/upload" className="text-blue-200 hover:text-white text-sm transition">+ Upload</Link>
              <Link href="/admin/users"  className="text-blue-200 hover:text-white text-sm transition">Users</Link>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium leading-none">{user?.name}</p>
            <p className="text-xs text-blue-300 mt-0.5">
              {user?.employee_id}
              {user?.department_name ? ` · ${user.department_name}` : ''}
            </p>
          </div>
          <Link
            href="/account/change-password"
            className="text-xs text-blue-200 hover:text-white transition"
            title="Change password"
          >
            🔒 Password
          </Link>
          <button
            onClick={logout}
            className="px-3 py-1.5 text-xs bg-blue-800 hover:bg-blue-700 rounded-lg transition"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
