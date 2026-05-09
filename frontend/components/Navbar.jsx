'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FileSignature, LayoutDashboard, Upload, Users, KeyRound, LogOut } from 'lucide-react';
import NotificationBell from './NotificationBell';
import api from '@/lib/api';

export default function Navbar({ user }) {
  const router   = useRouter();
  const pathname = usePathname();

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    try { localStorage.removeItem('user'); } catch {}
    router.push('/login');
  };

  const home = user?.role === 'admin' ? '/admin' : '/dashboard';

  const initials = (user?.name || '?')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const NavLink = ({ href, icon: Icon, children }) => {
    const active = pathname === href;
    return (
      <Link href={href}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
          ${active
            ? 'bg-white/10 text-white'
            : 'text-blue-200 hover:text-white hover:bg-white/5'}`}
      >
        <Icon size={16} strokeWidth={2.2} />
        <span className="hidden md:inline">{children}</span>
      </Link>
    );
  };

  return (
    <nav className="bg-gradient-to-r from-brand-950 via-brand-900 to-brand-800 text-white shadow-lg sticky top-0 z-40 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex justify-between items-center h-16">
        <div className="flex items-center gap-1 sm:gap-3">
          <Link href={home} className="flex items-center gap-2 font-bold text-lg tracking-tight mr-2 sm:mr-4">
            <span className="bg-white/10 p-1.5 rounded-md">
              <FileSignature size={20} strokeWidth={2.2} />
            </span>
            <span className="hidden sm:inline">DocSign</span>
          </Link>
          {user?.role === 'admin' && (
            <>
              <NavLink href="/admin"        icon={LayoutDashboard}>Dashboard</NavLink>
              <NavLink href="/admin/upload" icon={Upload}>Upload</NavLink>
              <NavLink href="/admin/users"  icon={Users}>Users</NavLink>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 grid place-items-center text-sm font-semibold ring-2 ring-white/10">
              {initials}
            </div>
            <div className="text-right leading-tight">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-[11px] text-blue-300">
                {user?.employee_id}
                {user?.department_name ? ` · ${user.department_name}` : ''}
              </p>
            </div>
          </div>
          {user && <NotificationBell />}
          <Link href="/account/change-password"
            className="p-2 rounded-md text-blue-200 hover:text-white hover:bg-white/5 transition-colors"
            title="Change password">
            <KeyRound size={16} strokeWidth={2.2} />
          </Link>
          <button onClick={logout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 rounded-md transition-colors">
            <LogOut size={14} strokeWidth={2.2} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
