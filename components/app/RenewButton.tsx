"use client";

import { useState } from "react";

type Props = {
  membershipId?: string | null;
};

export function RenewButton({ membershipId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/renew", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "No se pudo iniciar la renovación");
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
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="mb-2 text-sm font-semibold text-amber-900">
        Tu bono de este año no está activo
      </p>
      <p className="mb-3 text-sm text-amber-800">
        {membershipId
          ? `Eres el socio ${membershipId}. Renueva para disfrutar del bono de este año.`
          : "Renueva tu bono para acceder a tu carnet digital."}
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
      >
        {loading ? "Preparando pago…" : "Renovar mi bono"}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
