export const phoneKey = (p) => String(p ?? "").replace(/\D/g, "").slice(-10);
