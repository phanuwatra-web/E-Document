import axios from 'axios';

const api = axios.create({
  baseURL:         process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  // Send/receive cookies cross-origin. Required for httpOnly auth cookie.
  // Pairs with backend `cors({ credentials: true, origin: <exact origin> })`.
  withCredentials: true,
});

/**
 * Read a cookie value by name. Returns null if missing or in SSR (no document).
 * The CSRF cookie is intentionally NOT httpOnly so this works.
 */
const readCookie = (name) => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
};

// Methods that mutate state must echo the CSRF token back. Safe methods (GET,
// HEAD, OPTIONS) don't — and the server doesn't check them, matching RFC 7231.
const STATE_CHANGING = new Set(['post', 'put', 'patch', 'delete']);

api.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase();
  if (STATE_CHANGING.has(method)) {
    const csrf = readCookie('csrf_token');
    if (csrf) config.headers['X-CSRF-Token'] = csrf;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // 401 → session is invalid (cookie expired or revoked). Bounce to login.
    // We don't clear localStorage tokens anymore (we don't store any), but we
    // DO clear the cached display profile so the next page sees a fresh state.
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      try { localStorage.removeItem('user'); } catch {}
      // Avoid redirect loops while already on /login.
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export default api;
