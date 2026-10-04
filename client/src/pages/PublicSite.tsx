import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight, CalendarDays, CheckCircle2, Clock3, Dumbbell,
  MapPin, ShoppingBag, Trophy
} from "lucide-react";
import { api, qs } from "../lib/api";
import { addDays, inr, todayStr } from "../lib/format";
import { Button, Card, Field, Input, Select, Textarea } from "../components/ui";

const SPORTS = ["tennis", "cricket", "padel", "badminton"] as const;
const CATEGORIES = ["", "racket", "ball", "shoes", "accessory", "apparel"];

type CartLine = {
  variantId: number;
  name: string;
  label: string;
  price: number;
  qty: number;
};

export default function PublicSite() {
  const today = todayStr();

  const [sport, setSport] = useState("tennis");
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [fulfilment, setFulfilment] = useState("pickup");
  const [address, setAddress] = useState("");
  const [memberCode, setMemberCode] = useState("");
  const [orderMessage, setOrderMessage] = useState("");

  const [trial, setTrial] = useState({
    name: "", phone: "", email: "", sport: "tennis",
    date: today, startsAt: "", message: ""
  });

  const [enquiry, setEnquiry] = useState({
    name: "", phone: "", email: "", type: "membership",
    interestedPlan: "gold", sport: "tennis",
    companyName: "", message: ""
  });

  const club = useQuery({
    queryKey: ["public-club"],
    queryFn: () => api("GET", "/public/club")
  });

  const availability = useQuery({
    queryKey: ["public-availability", sport, date],
    queryFn: () => api("GET", `/availability${qs({ date, days: 1, sport })}`)
  });

  const products = useQuery({
    queryKey: ["public-products", category, search],
    queryFn: () => api("GET", `/shop/products${qs({ category, q: search })}`)
  });

  // Public availability includes every court. Deduplicate times because
  // the trial API selects a suitable free court for us.
  const trialAvailability = useQuery({
    queryKey: ["trial-availability", trial.sport, trial.date],
    queryFn: () => api("GET", `/availability${qs({
      date: trial.date, days: 1, sport: trial.sport
    })}`)
  });

  const slots = useMemo(() => {
    const days = availability.data ?? [];
    return days.flatMap((day: any) =>
      day.courts.flatMap((court: any) =>
        court.slots
          .filter((slot: any) => slot.state === "free")
          .map((slot: any) => ({
            startsAt: slot.startsAt,
            time: slot.time,
            court: court.name,
            rate: court.ratePerHour
          }))
      )
    );
  }, [availability.data]);

  const trialSlots = useMemo(() => {
    const days = trialAvailability.data ?? [];
    const byTime = new Map<string, { startsAt: string; time: string }>();

    for (const day of days as any[]) {
      for (const court of day.courts) {
        for (const slot of court.slots) {
          if (slot.state === "free" && !byTime.has(slot.startsAt)) {
            byTime.set(slot.startsAt, {
              startsAt: slot.startsAt,
              time: slot.time
            });
          }
        }
      }
    }

    return [...byTime.values()];
  }, [trialAvailability.data]);

  const sendEnquiry = useMutation({
    mutationFn: () => api("POST", "/public/enquiries", {
      name: enquiry.name.trim(),
      phone: enquiry.phone.trim(),
      ...(enquiry.email.trim() ? { email: enquiry.email.trim() } : {}),
      type: enquiry.type,
      ...(enquiry.type === "membership"
        ? { interestedPlan: enquiry.interestedPlan }
        : {}),
      ...(enquiry.type === "corporate"
        ? { companyName: enquiry.companyName.trim() }
        : {}),
      sport: enquiry.sport,
      message: enquiry.message.trim()
    }),
    onSuccess: (result: any) => {
      toast.success(`Enquiry submitted. Reference: ${result.reference}`);
      setEnquiry({
        name: "", phone: "", email: "", type: "membership",
        interestedPlan: "gold", sport: "tennis",
        companyName: "", message: ""
      });
    }
  });

  const bookTrial = useMutation({
    mutationFn: () => api("POST", "/public/trial", {
      name: trial.name.trim(),
      phone: trial.phone.trim(),
      ...(trial.email.trim() ? { email: trial.email.trim() } : {}),
      sport: trial.sport,
      startsAt: trial.startsAt,
      ...(trial.message.trim() ? { message: trial.message.trim() } : {})
    }),
    onSuccess: (result: any) => {
      toast.success(`Trial booked! Reference: ${result.reference}`);
      setTrial({
        name: "", phone: "", email: "", sport: "tennis",
        date: todayStr(), startsAt: "", message: ""
      });
    }
  });

  const placeOrder = useMutation({
    mutationFn: () => api("POST", "/shop/orders/online", {
      items: cart.map(item => ({
        variantId: item.variantId,
        quantity: item.qty
      })),
      customerName: customerName.trim(),
      customerPhone: phone.trim(),
      fulfilment,
      ...(fulfilment === "delivery"
        ? { deliveryAddress: address.trim() }
        : {}),
      ...(memberCode.trim()
        ? { memberCode: memberCode.trim() }
        : {})
    }),
    onSuccess: (result: any) => {
      setOrderMessage(
        `Order placed successfully${result.orderNumber
          ? `: ${result.orderNumber}`
          : result.id ? `: #${result.id}` : "."}`
      );
      setCart([]);
      setCustomerName("");
      setPhone("");
      setEmail("");
      setAddress("");
      setMemberCode("");
      toast.success("Your order has been placed.");
    }
  });

  function updateCart(line: CartLine, delta: number) {
    setCart(current => {
      const found = current.find(item => item.variantId === line.variantId);

      if (!found && delta > 0) {
        return [...current, { ...line, qty: 1 }];
      }

      return current
        .map(item => item.variantId === line.variantId
          ? { ...item, qty: item.qty + delta }
          : item)
        .filter(item => item.qty > 0);
    });
  }

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.price * item.qty, 0
  );

  const clubInfo = club.data ?? {};
  const plans = clubInfo.plans ?? [];
  const sportsInfo = clubInfo.sports ?? [];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <a href="#home" className="flex items-center gap-2 font-bold tracking-tight">
            <Trophy className="text-emerald-400" />
            <span>CHAMPIONS<span className="text-emerald-400"> CLUB</span></span>
          </a>

          <nav className="hidden items-center gap-6 text-sm md:flex">
            <a href="#sports" className="text-slate-300 hover:text-white">Sports</a>
            <a href="#plans" className="text-slate-300 hover:text-white">Memberships</a>
            <a href="#availability" className="text-slate-300 hover:text-white">Courts</a>
            <a href="#shop" className="text-slate-300 hover:text-white">Pro shop</a>
            <a href="#contact" className="text-slate-300 hover:text-white">Contact</a>
          </nav>

          <Link to="/login"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
            Staff login
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section id="home" className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-slate-950 to-slate-900" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-20 md:grid-cols-2 md:py-28">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300">
              <CheckCircle2 size={15} /> Play more. Play together.
            </div>
            <h1 className="max-w-2xl text-4xl font-black leading-tight tracking-tight md:text-6xl">
              Your game.
              <span className="block text-emerald-400">Your community.</span>
            </h1>
            <p className="mt-5 max-w-xl leading-7 text-slate-300">
              Find your court, discover your membership, gear up for your next
              match and become part of the Champions Club community.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#trial"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-slate-950 hover:bg-emerald-400">
                Book a free trial <ArrowRight size={17} />
              </a>
              <a href="#availability"
                className="rounded-lg border border-white/20 px-5 py-3 font-semibold hover:bg-white/10">
                Check court availability
              </a>
            </div>
            <p className="mt-5 text-xs text-slate-400">
              One free, one-hour trial per person, subject to availability.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <Dumbbell className="mb-8 text-emerald-400" size={28} />
              <div className="text-2xl font-bold">Play</div>
              <p className="mt-2 text-sm text-slate-300">Book courts and join social sessions.</p>
            </div>
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
              <Trophy className="mb-8 text-emerald-400" size={28} />
              <div className="text-2xl font-bold">Improve</div>
              <p className="mt-2 text-sm text-slate-300">Make every session count.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <ShoppingBag className="mb-8 text-emerald-400" size={28} />
              <div className="text-2xl font-bold">Gear up</div>
              <p className="mt-2 text-sm text-slate-300">Shop equipment and accessories.</p>
            </div>
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
              <CalendarDays className="mb-8 text-emerald-400" size={28} />
              <div className="text-2xl font-bold">Connect</div>
              <p className="mt-2 text-sm text-slate-300">Join the club and meet fellow players.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Sports */}
      <section id="sports" className="mx-auto max-w-7xl px-5 py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-700">Find your game</p>
        <h2 className="mt-2 text-3xl font-bold">Sport brings us together.</h2>
        {club.isLoading ? <p className="mt-5 text-slate-500">Loading club information...</p> :
          club.error ? <p className="mt-5 text-red-600">Could not load club information. Check that the API is running.</p> :
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sportsInfo.map((s: any) => (
              <Card key={s.sport} className="border border-slate-200 p-5">
                <div className="text-lg font-bold capitalize">{s.sport}</div>
                <p className="mt-2 text-sm text-slate-500">{s.courts} active court(s)</p>
                <p className="mt-4 font-semibold text-emerald-700">
                  From {inr(s.fromPricePerHour)}/hour
                </p>
                <a href="#availability" onClick={() => setSport(s.sport)}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold">
                  Find a slot <ArrowRight size={15} />
                </a>
              </Card>
            ))}
          </div>
        }
      </section>

      {/* Plans */}
      <section id="plans" className="bg-slate-50 py-16">
        <div className="mx-auto max-w-7xl px-5">
          <p className="text-sm font-bold uppercase tracking-widest text-emerald-700">Memberships</p>
          <h2 className="mt-2 text-3xl font-bold">Find your place at the club.</h2>
          <p className="mt-3 max-w-2xl text-slate-600">
            Choose a plan that suits you. Contact our team if you need help
            understanding the benefits.
          </p>

          {club.isLoading ? <p className="mt-6 text-slate-500">Loading plans...</p> :
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {plans.map((p: any) => (
                <Card key={p.tier}
                  className={`border p-6 ${p.tier === "gold" ? "border-emerald-500 ring-1 ring-emerald-500" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold">{p.name}</h3>
                    {p.tier === "gold" &&
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">Premium</span>}
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{p.description}</p>
                  <div className="mt-6">
                    <span className="text-3xl font-black">{inr(p.monthlyFee)}</span>
                    <span className="text-sm text-slate-500"> / month</span>
                  </div>
                  <ul className="mt-6 space-y-3">
                    {(p.perks ?? []).map((perk: string) => (
                      <li key={perk} className="flex gap-2 text-sm">
                        <CheckCircle2 size={17} className="shrink-0 text-emerald-600" />
                        {perk}
                      </li>
                    ))}
                  </ul>
                  <a href="#contact"
                    onClick={() => setEnquiry(old => ({
                      ...old, type: "membership", interestedPlan: p.tier
                    }))}
                    className="mt-7 block rounded-lg bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-slate-700">
                    Enquire about {p.name}
                  </a>
                </Card>
              ))}
            </div>
          }
        </div>
      </section>

      {/* Availability */}
      <section id="availability" className="mx-auto max-w-7xl px-5 py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-700">Court finder</p>
        <h2 className="mt-2 text-3xl font-bold">Find your next session.</h2>
        <p className="mt-3 text-slate-600">Availability is loaded from the club's booking system.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Sport">
            <Select value={sport} onChange={e => setSport(e.target.value)}>
              {SPORTS.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" min={today} max={addDays(today, 6)} value={date}
              onChange={e => setDate(e.target.value)} />
          </Field>
        </div>

        {availability.isLoading ? <p className="mt-6 text-slate-500">Checking availability...</p> :
          availability.error ? <p className="mt-6 text-red-600">Availability could not be loaded.</p> :
          slots.length === 0 ? <p className="mt-6 rounded-xl bg-slate-50 p-5 text-slate-600">No free slots were found for this selection.</p> :
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {slots.map((slot: any, i: number) => (
              <div key={`${slot.startsAt}-${slot.court}-${i}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                <div>
                  <div className="font-semibold">{slot.court}</div>
                  <div className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                    <Clock3 size={14} /> {slot.time} · {inr(slot.rate)}/hour
                  </div>
                </div>
                <Button size="sm" onClick={() => {
                  setTrial(old => ({
                    ...old, sport, date, startsAt: slot.startsAt
                  }));
                  document.getElementById("trial")?.scrollIntoView({ behavior: "smooth" });
                }}>
                  Try this time
                </Button>
              </div>
            ))}
          </div>
        }
        <p className="mt-4 text-xs text-slate-500">
          Displayed slots can change as bookings are made. The server checks availability again when a trial is submitted.
        </p>
      </section>

      {/* Trial booking */}
      <section id="trial" className="bg-slate-950 py-16 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 md:grid-cols-2">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-emerald-400">Your first session</p>
            <h2 className="mt-3 text-3xl font-bold">Try the club for free.</h2>
            <p className="mt-4 leading-7 text-slate-300">
              Choose a sport and an available time. The server will confirm the
              booking, assign a free court and prevent the same phone number from
              claiming another free trial.
            </p>
            <p className="mt-5 text-sm text-slate-400">One free one-hour trial per person.</p>
          </div>

          <form className="space-y-4 rounded-2xl bg-white p-6 text-slate-900"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              bookTrial.mutate();
            }}>
            <Field label="Full name">
              <Input required minLength={2} maxLength={120} value={trial.name}
                onChange={e => setTrial({ ...trial, name: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone">
                <Input required type="tel" pattern="[+]?[0-9]{10,13}"
                  placeholder="10-digit number" value={trial.phone}
                  onChange={e => setTrial({ ...trial, phone: e.target.value })} />
              </Field>
              <Field label="Email (optional)">
                <Input type="email" value={trial.email}
                  onChange={e => setTrial({ ...trial, email: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sport">
                <Select value={trial.sport} onChange={e => setTrial({
                  ...trial, sport: e.target.value, startsAt: ""
                })}>
                  {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Date">
                <Input required type="date" min={today} max={addDays(today, 6)}
                  value={trial.date} onChange={e => setTrial({
                    ...trial, date: e.target.value, startsAt: ""
                  })} />
              </Field>
            </div>
            <Field label="Available time">
              <Select required value={trial.startsAt}
                onChange={e => setTrial({ ...trial, startsAt: e.target.value })}>
                <option value="">Choose a free slot</option>
                {trialSlots.map((s: any) => (
                  <option key={s.startsAt} value={s.startsAt}>{s.time}</option>
                ))}
              </Select>
              {trialAvailability.isFetching &&
                <span className="mt-1 block text-xs text-slate-500">Refreshing available times...</span>}
            </Field>
            <Field label="Anything we should know? (optional)">
              <Textarea maxLength={500} value={trial.message}
                onChange={e => setTrial({ ...trial, message: e.target.value })} />
            </Field>
            <Button className="w-full" type="submit"
              disabled={!trial.startsAt || trialAvailability.isFetching}
              loading={bookTrial.isPending}>
              Book free trial
            </Button>
          </form>
        </div>
      </section>

      {/* Pro shop */}
      <section id="shop" className="mx-auto max-w-7xl px-5 py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-700">Pro shop</p>
        <h2 className="mt-2 text-3xl font-bold">Gear up for your game.</h2>
        <p className="mt-3 text-slate-600">Order online for collection at the club or delivery.</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Input className="min-w-48 flex-1" placeholder="Search products or brands"
            value={search} onChange={e => setSearch(e.target.value)} />
          <Select className="w-44" value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c ? c[0].toUpperCase() + c.slice(1) : "All categories"}</option>)}
          </Select>
        </div>

        {products.isLoading ? <p className="mt-6 text-slate-500">Loading shop...</p> :
          products.error ? <p className="mt-6 text-red-600">Could not load products.</p> :
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(products.data ?? []).map((p: any) => (
              <Card key={p.id} className="border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold">{p.name}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs capitalize">{p.category}</span>
                </div>
                {p.brand && <p className="mt-1 text-sm text-slate-500">{p.brand}</p>}
                {p.description && <p className="mt-3 text-sm text-slate-600">{p.description}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {p.variants.map((v: any) => {
                    const line = {
                      variantId: v.id, name: p.name, label: v.label,
                      price: Number(v.price), qty: 1
                    };
                    return (
                      <button key={v.id} disabled={!v.inStock}
                        onClick={() => updateCart(line, 1)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">
                        <span className="block font-medium">{v.label}</span>
                        <span className="block">{inr(v.price)}</span>
                        <span className="text-xs text-slate-500">{v.inStock ? "Add to cart" : "Out of stock"}</span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        }

        <div className="mt-10 grid gap-8 rounded-2xl bg-slate-50 p-6 lg:grid-cols-2">
          <div>
            <h3 className="text-xl font-bold">Your cart</h3>
            {cart.length === 0 ? <p className="mt-4 text-sm text-slate-500">Choose an available product variant above.</p> :
              <ul className="mt-4 divide-y divide-slate-200">
                {cart.map(line => (
                  <li key={line.variantId} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <div className="font-medium">{line.name}</div>
                      <div className="text-sm text-slate-500">{line.label} · {inr(line.price)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button aria-label="Remove one" onClick={() => updateCart(line, -1)}
                        className="rounded border px-2 py-1">−</button>
                      <span>{line.qty}</span>
                      <button aria-label="Add one" onClick={() => updateCart(line, 1)}
                        className="rounded border px-2 py-1">+</button>
                    </div>
                  </li>
                ))}
              </ul>
            }
            <div className="mt-4 flex justify-between border-t border-slate-200 pt-4 text-lg font-bold">
              <span>Items subtotal</span><span>{inr(cartTotal)}</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Final discounts, delivery charges and totals are calculated by the server at checkout.
            </p>
          </div>

          <form className="space-y-4" onSubmit={(e: FormEvent) => {
            e.preventDefault();
            placeOrder.mutate();
          }}>
            <h3 className="text-xl font-bold">Checkout</h3>
            <Field label="Full name">
              <Input required minLength={2} value={customerName}
                onChange={e => setCustomerName(e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input required type="tel" pattern="[+]?[0-9]{10,13}" value={phone}
                onChange={e => setPhone(e.target.value)} />
            </Field>
            <Field label="Member code (optional)">
              <Input value={memberCode} placeholder="CC-000001"
                onChange={e => setMemberCode(e.target.value.toUpperCase())} />
            </Field>
            <Field label="Fulfilment">
              <Select value={fulfilment} onChange={e => setFulfilment(e.target.value)}>
                <option value="pickup">Collect at the club</option>
                <option value="delivery">Delivery</option>
              </Select>
            </Field>
            {fulfilment === "delivery" &&
              <Field label="Delivery address">
                <Textarea required minLength={10} value={address}
                  onChange={e => setAddress(e.target.value)} />
              </Field>
            }
            {orderMessage && <p className="text-sm font-medium text-emerald-700">{orderMessage}</p>}
            <Button className="w-full" type="submit" disabled={!cart.length} loading={placeOrder.isPending}>
              Place order
            </Button>
          </form>
        </div>
      </section>

      {/* Contact and enquiries */}
      <section id="contact" className="bg-slate-50 py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 md:grid-cols-2">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-emerald-700">Get in touch</p>
            <h2 className="mt-2 text-3xl font-bold">Let's get you playing.</h2>
            <p className="mt-4 text-slate-600">
              Ask about memberships, corporate plans, court access or anything else.
              Your enquiry will enter the club's staff follow-up queue.
            </p>
            <div className="mt-8 space-y-4 text-sm">
              {clubInfo.contact?.phone &&
                <p><b>Phone:</b> {clubInfo.contact.phone}</p>}
              {clubInfo.contact?.email &&
                <p><b>Email:</b> {clubInfo.contact.email}</p>}
              {clubInfo.contact?.address &&
                <p className="flex gap-2"><MapPin size={17} /> {clubInfo.contact.address}</p>}
              {clubInfo.hours &&
                <p><b>Club hours:</b> {clubInfo.hours.opens}–{clubInfo.hours.closes}</p>}
            </div>
          </div>

          <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              sendEnquiry.mutate();
            }}>
            <Field label="Full name">
              <Input required minLength={2} value={enquiry.name}
                onChange={e => setEnquiry({ ...enquiry, name: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone">
                <Input required type="tel" pattern="[+]?[0-9]{10,13}"
                  value={enquiry.phone}
                  onChange={e => setEnquiry({ ...enquiry, phone: e.target.value })} />
              </Field>
              <Field label="Email (optional)">
                <Input type="email" value={enquiry.email}
                  onChange={e => setEnquiry({ ...enquiry, email: e.target.value })} />
              </Field>
            </div>
            <Field label="Enquiry type">
              <Select value={enquiry.type} onChange={e => setEnquiry({
                ...enquiry, type: e.target.value
              })}>
                <option value="membership">Membership</option>
                <option value="corporate">Corporate membership</option>
                <option value="general">General question</option>
              </Select>
            </Field>
            {enquiry.type === "membership" &&
              <Field label="Interested plan">
                <Select value={enquiry.interestedPlan} onChange={e => setEnquiry({
                  ...enquiry, interestedPlan: e.target.value
                })}>
                  {["gold", "silver", "junior"].map(p =>
                    <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                </Select>
              </Field>
            }
            {enquiry.type === "corporate" &&
              <Field label="Company name">
                <Input required minLength={2} value={enquiry.companyName}
                  onChange={e => setEnquiry({ ...enquiry, companyName: e.target.value })} />
              </Field>
            }
            <Field label="Sport of interest (optional)">
              <Select value={enquiry.sport} onChange={e => setEnquiry({
                ...enquiry, sport: e.target.value
              })}>
                {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="How can we help?">
              <Textarea required minLength={5} maxLength={1000}
                value={enquiry.message}
                onChange={e => setEnquiry({ ...enquiry, message: e.target.value })} />
            </Field>
            <Button className="w-full" type="submit" loading={sendEnquiry.isPending}>
              Send enquiry
            </Button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 px-5 py-8 text-white">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="font-bold">CHAMPIONS CLUB</div>
            <p className="mt-1 text-xs text-slate-400">Play more. Play together.</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-300">
            <a href="#plans" className="hover:text-white">Memberships</a>
            <a href="#availability" className="hover:text-white">Availability</a>
            <a href="#shop" className="hover:text-white">Shop</a>
            <Link to="/login" className="hover:text-white">Staff login</Link>
          </div>
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} Champions Club</p>
        </div>
      </footer>
    </div>
  );
}

