const TOKEN_KEY = 'cc_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export async function api(path, { method = 'GET', body, authToken } = {}) {
  const token = authToken ?? getToken();

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

  // Only the staff session is managed by AuthProvider. Member-portal requests
  // pass their token explicitly and must not unexpectedly redirect to /login.
  // Returning the 401 lets the member portal clear its own session cleanly.
  if (res.status === 401 && !['/auth/login', '/auth/member-login'].includes(path) && !authToken) {
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


export async function apiBlob(path, { method = 'GET', body, authToken } = {}) {
  const token = authToken ?? getToken();
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Network error — check your connection and try again');
  }
  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
    return null;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return res.blob();
}
