const TOKEN_KEY = 'cc_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);

  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    window.location.href = '/login';
  }
  if (!res.ok) {
    const details = data?.details?.map((d) => `${d.field}: ${d.message}`).join(', ');
    throw new Error(details || data?.error || 'Request failed');
  }
  return data;
}
