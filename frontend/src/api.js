const TOKEN_KEY = 'cc_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    // Covers offline, DNS failure, CORS preflight blocked, etc.
    throw new Error('Network error — check your connection and try again');
  }

  // Try to parse JSON; fall back to null for empty responses (204, etc.)
  const data = await res.json().catch(() => null);

  // Expired / invalid session — clear token and redirect to login
  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    window.location.href = '/login';
    return;
  }

  if (!res.ok) {
    const details = data?.details?.map((d) => `${d.field}: ${d.message}`).join(', ');
    throw new Error(details || data?.error || `Request failed (${res.status})`);
  }

  return data;
}
