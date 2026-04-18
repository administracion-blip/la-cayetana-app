"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function SuccessRedirect() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<
    "loading" | "paid" | "unpaid" | "error"
  >(() => (sessionId ? "loading" : "error"));

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`,
        );
        const data = (await res.json()) as {
          paid?: boolean;
        };
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          return;
        }
        setStatus(data.paid ? "paid" : "unpaid");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-muted">No hay sesión de pago. Vuelve al inicio.</p>
        <Link href="/" className="mt-4 inline-block text-brand underline">
          Inicio
        </Link>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-muted">Comprobando el pago…</p>
      </div>
    );
  }

  if (status === "unpaid") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-muted">
          El pago aún no consta como completado. Si acabas de pagar, espera unos
          segundos o contacta con la caseta.
        </p>
        <Link href="/" className="mt-4 inline-block text-brand underline">
          Volver al inicio
        </Link>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-muted">No se pudo verificar el pago.</p>
        <Link href="/" className="mt-4 inline-block text-brand underline">
          Inicio
        </Link>
      </div>
    );
  }

  const activateHref = `/activate?session_id=${encodeURIComponent(sessionId)}`;

  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <p className="text-lg font-medium text-foreground">¡Pago recibido!</p>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        El pago queda guardado en el sistema. Siguiente paso: elige contraseña y
        completa tus datos para obtener tu número de socio y el código QR.
      </p>
      <Link
        href={activateHref}
        className="mt-8 inline-flex min-h-12 min-w-[200px] items-center justify-center rounded-full bg-brand px-8 text-[15px] font-medium text-white transition hover:bg-brand-hover"
      >
        Completar registro
      </Link>
    </div>
  );
}
