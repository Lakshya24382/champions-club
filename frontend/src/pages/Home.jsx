import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { money } from '../components/ui.jsx';
import EnquiryForm from '../components/EnquiryForm.jsx';

const SPORT_ICON = { tennis: '🎾', cricket: '🏏', padel: '🏓', badminton: '🏸' };

const courtBenefit = (pct) => (pct >= 100 ? 'Court bookings included' : pct > 0 ? `${pct}% off court bookings` : 'Standard court rates');

export default function Home() {
  const { hash } = useLocation();
  const { data, isLoading, error } = useQuery({ queryKey: ['overview'], queryFn: () => api('/public/overview') });

  // Scroll to #contact / #plans after the content has rendered
  useEffect(() => {
    if (!hash || !data) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [hash, data]);

  if (isLoading) return <p className="p-6">Loading…</p>;
  if (error) return <p className="p-6 text-red-600">{error.message}</p>;

  const bySport = data.courts.reduce((acc, c) => {
    (acc[c.sport] ??= []).push(c);
    return acc;
  }, {});
  const cheapestSocial = Math.min(...data.courts.map((c) => c.social_price_per_person));

  return (
    <div>
      {/* Hero */}
      <section className="bg-emerald-800 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h1 className="max-w-2xl text-4xl font-bold leading-tight md:text-5xl">Play your best at Champions Club</h1>
          <p className="mt-4 max-w-xl text-lg text-emerald-100">
            Tennis, padel, badminton and cricket courts, a pro shop for everything you need, and a cafe for after the match.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/book" className="rounded-lg bg-white px-5 py-3 font-semibold text-emerald-800 hover:bg-emerald-50">See what's free · Book a trial</Link>
            <Link to="/shop" className="rounded-lg border border-emerald-300 px-5 py-3 font-semibold hover:bg-emerald-700">Visit the pro shop</Link>
            <Link to="/member-portal" className="rounded-lg border border-emerald-200/50 px-5 py-3 font-semibold text-emerald-100 hover:bg-emerald-700/50">Member login →</Link>
          </div>
          <p className="mt-6 text-sm text-emerald-200">Open daily {data.hours.open} – {data.hours.close} · {data.sessionMin}-minute sessions</p>
        </div>
      </section>

      {/* Courts and prices */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-bold">Courts & prices</h2>
        <p className="mt-1 text-slate-600">Walk-in rates per one-hour session. Members pay less, and Gold members play free.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(bySport).map(([sport, list]) => (
            <div key={sport} className="rounded-xl border bg-white p-4">
              <p className="text-3xl">{SPORT_ICON[sport]}</p>
              <h3 className="mt-2 font-semibold capitalize">{sport}</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {list.map((c) => <li key={c.id} className="flex justify-between"><span>{c.name}</span><span>{money(c.price_per_hour)}/hr</span></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
          🎉 <b>Friday social play</b>, {data.social.from} – {data.social.to}: share a court with other players from {money(cheapestSocial)} per person. Just turn up.
        </div>
      </section>

      {/* Plans */}
      <section id="plans" className="bg-white py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold">Membership plans</h2>
          <p className="mt-1 text-slate-600">Every plan also gives you discounts at the pro shop and the bar.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {data.plans.map((p) => (
              <div key={p.id} className={`rounded-xl border p-5 ${p.code === 'GOLD' ? 'border-yellow-400 bg-yellow-50' : 'bg-white'}`}>
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="mt-1 text-3xl font-bold">{money(p.price)}<span className="text-sm font-normal text-slate-500"> / {p.duration_days} days</span></p>
                <p className="mt-2 text-sm text-slate-600">{p.description}</p>
                <ul className="mt-3 space-y-1 text-sm">
                  <li>✔ {courtBenefit(p.court_discount_pct)}</li>
                  <li>✔ {p.shop_discount_pct}% off in the pro shop</li>
                  <li>✔ {p.bar_discount_pct}% off at the bar & cafe</li>
                  {p.max_age != null && <li>✔ For players aged {p.max_age} and under</li>}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-500">Ready to join, or want a custom offer? Send us a message below and we'll prepare a quote.</p>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="mx-auto max-w-3xl px-4 py-12">
        <h2 className="text-2xl font-bold">Get in touch</h2>
        <p className="mb-5 mt-1 text-slate-600">Questions about plans, coaching or corporate bookings? Leave your details and we'll call you back.</p>
        <div className="rounded-xl border bg-white p-5">
          <EnquiryForm plans={data.plans} />
        </div>
      </section>
    </div>
  );
}
