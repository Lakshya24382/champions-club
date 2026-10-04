import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "../lib/api";
import { fmtDate } from "../lib/format";
import { Input } from "./ui";

// Debounce so we do not call the API on every keystroke
function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// A text box for a member code (CC-000042) that shows who it belongs to,
// so the front desk can confirm the right person before taking a booking or payment.
export default function MemberCodeInput({ value, onChange, placeholder = "CC-000042" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const code = useDebounced(value.trim());
  const { data, isFetching } = useQuery({
    queryKey: ["member-lookup", code],
    enabled: code.length >= 4,
    queryFn: () => api("GET", `/members${qs({ q: code, limit: 5 })}`),
  });
  const match = data?.data?.find((m: any) => m.memberCode.toLowerCase() === code.toLowerCase());

  return (
    <div>
      <Input value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} placeholder={placeholder} autoComplete="off" />
      {code.length >= 4 && !isFetching && (
        <p className={`mt-1 text-xs ${match ? (match.status === "active" ? "text-emerald-600" : "text-red-600") : "text-red-600"}`}>
          {match
            ? `${match.fullName} - ${match.plan.name} - ${match.status === "active" ? `active until ${fmtDate(match.expiresAt)}` : "membership expired"}`
            : "No member found with that code"}
        </p>
      )}
    </div>
  );
}
