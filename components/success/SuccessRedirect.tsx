"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Status = "loading" | "active" | "pending" | "unpaid" | "error";

const MAX_ATTEMPTS = 6;
const POLL_DELAY_MS = 2000;

export function SuccessRedirect() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<Status>(() =>
    sessionId ? "loading" : "error",
  );
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;
    cancelledRef.current = false;

    async function check(attempt: number) {
      try {
        const res = await fetch(
          `/api/checkout/verify?session_id=${encodeURIComponent(sessionId!)}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as {
          paid?: boolean;
          accountStatus?: "active" | "pending" | "unpaid";
        };
        if (cancelledRef.current) return;
        if (!res.ok) {
          setStatus("error");
          return;
        }
        if (data.accountStatus === "active") {
          setStatus("active");
          return;
        }
        if (data.paid) {
          setStatus("pending");
          if (attempt < MAX_ATTEMPTS) {
            setTimeout(() => check(attempt + 1), POLL_DELAY_MS);
          }
          return;
        }
        setStatus("unpaid");
      } catch {
        if (!cancelledRef.current) setStatus("error");
      }
    }

    check(1);
    return () => {
      cancelledRef.current = true;
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
          El pago aún no consta como completado. Si acabas de pagar, espera
          unos segundos o contacta con la caseta.
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

  if (status === "pending") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-lg font-medium text-foreground">¡Pago recibido!</p>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Estamos activando tu carnet. Esto solo tarda unos segundos…
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <p className="text-lg font-medium text-foreground">
        ¡Tu carnet está listo!
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Hemos creado tu cuenta. Inicia sesión con el email y la contraseña que
        indicaste en el formulario para acceder a tu carnet digital.
      </p>
      <Link
        href="/login"
        className="mt-8 inline-flex min-h-12 min-w-[200px] items-center justify-center rounded-full bg-brand px-8 text-[15px] font-medium text-white transition hover:bg-brand-hover"
      >
        Iniciar sesión
      </Link>
    </div>
  );
}
