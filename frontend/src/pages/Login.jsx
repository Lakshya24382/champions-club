import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAuth } from '../auth.jsx';
import { Field, inputCls, btnCls } from '../components/ui.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('owner@champions.club');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try { await login(email, password); navigate('/dashboard'); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow">
        <h1 className="text-xl font-bold text-emerald-700">🏆 Champions Club · Staff</h1>
        <Field label="Email"><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className={`${btnCls} w-full`}>Sign in</button>
        <Link to="/" className="block text-center text-sm text-slate-500 hover:text-slate-900">← Back to the website</Link>
      </form>
    </div>
  );
}
