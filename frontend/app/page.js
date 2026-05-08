'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function RootPage() {
  const router = useRouter();

  // We can't read the auth_token cookie from JS (it's httpOnly — by design).
  // Instead, ask the server "who am I?". A 200 means cookie is valid; a 401
  // means we're logged out. The axios 401 interceptor will redirect to
  // /login automatically, so we only need to handle the 200 case here.
  useEffect(() => {
    api.get('/auth/me')
      .then(res => {
        // Cache for the next page render — non-secret info only.
        localStorage.setItem('user', JSON.stringify(res.data));
        router.replace(res.data.role === 'admin' ? '/admin' : '/dashboard');
      })
      .catch(() => {
        // Interceptor already redirected on 401, but in case of network
        // error we still want to land on login.
        router.replace('/login');
      });
  }, []);

  return null;
}
