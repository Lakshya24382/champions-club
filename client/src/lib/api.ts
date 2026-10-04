const TOKEN_KEY = "cc_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Builds "?a=1&b=2" and skips empty values
export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function request(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

async function toError(res: Response) {
  let data: any = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  const details = data?.details
    ? Object.entries(data.details).map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`).join("; ")
    : "";
  return new ApiError(res.status, [data?.error ?? res.statusText, details].filter(Boolean).join(" - "));
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await request(method, path, body);
  if (!res.ok) {
    // An expired token anywhere in the app sends the user back to the login page
    if (res.status === 401 && getToken()) {
      setToken(null);
      window.dispatchEvent(new Event("cc:logout"));
    }
    throw await toError(res);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// Fetch a protected HTML page (invoice, receipt) and open it in a new tab for printing
export async function openDocument(path: string) {
  const res = await request("GET", path);
  if (!res.ok) throw await toError(res);
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank");
}

// Fetch a protected file (CSV export) and save it
export async function downloadFile(path: string, filename: string) {
  const res = await request("GET", path);
  if (!res.ok) throw await toError(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
