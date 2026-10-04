import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "../lib/api";

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Given a typed member code, finds the member and the discounts their plan earns.
// Used to show the discount in the cart / tab BEFORE the server applies it.
export function useMemberBenefit(code: string) {
  const c = useDebounced(code.trim());
  const lookup = useQuery({
    queryKey: ["member-lookup", c],
    enabled: c.length >= 4,
    queryFn: () => api("GET", `/members${qs({ q: c, limit: 5 })}`),
  });
  const hit = lookup.data?.data?.find((m: any) => m.memberCode.toLowerCase() === c.toLowerCase());
  const detail = useQuery({
    queryKey: ["member", String(hit?.id)],
    enabled: Boolean(hit),
    queryFn: () => api("GET", `/members/${hit.id}`),
  });
  const m = detail.data ?? null;
  const active = m?.status === "active";
  return {
    member: m,
    active,
    shopPct: active ? m.plan.shopDiscountPct : 0,
    barPct: active ? m.plan.barDiscountPct : 0,
    pending: code.trim() !== c || lookup.isFetching || detail.isFetching,
  };
}
