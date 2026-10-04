import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { Button, Card, Field, Input } from "../components/ui";

export default function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/app" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      nav(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-900 p-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-slate-900">Champions Club</h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">Staff sign in</p>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
          <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={busy} className="w-full">Sign in</Button>
        </form>
      </Card>
    </div>
  );
}
