"use client";

import { useState } from "react";

function paymentLinkUrl(): string | null {
  const u = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK?.trim();
  if (!u) return null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function StartCheckoutButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);

    const pl = paymentLinkUrl();
    if (pl) {
      setLoading(true);
      window.location.href = pl;
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/checkout/create", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "No se pudo iniciar el pago");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex min-h-12 min-w-[220px] items-center justify-center rounded-full bg-brand px-8 text-[15px] font-medium text-white transition hover:bg-brand-hover disabled:opacity-60"
      >
        {loading ? "Abriendo pago…" : "Consigue tu carnet"}
      </button>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
