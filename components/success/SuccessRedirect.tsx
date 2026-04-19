"use client";

import Link from "next/link";

/**
 * Pantalla tras volver de Stripe.
 *
 * Flujo actual (MANUAL): NO intentamos activar la cuenta automáticamente. Se
 * muestra un mensaje claro de "pago recibido, pendiente de validación manual".
 * Un administrador aprobará la cuenta desde `/admin/users`.
 *
 * TODO: cuando se restaure la automatización (webhook de Stripe), este
 * componente puede volver a hacer polling a `/api/checkout/verify` para
 * mostrar "Cuenta activada" en cuanto llegue el webhook.
 */
export function SuccessRedirect() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <p className="text-lg font-medium text-foreground">¡Pago recibido!</p>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Hemos registrado tu pago correctamente. La activación de tu carnet se
        revisa manualmente y puede tardar un rato.
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Te avisaremos cuando esté lista. Si lo prefieres, puedes intentar
        iniciar sesión más tarde con el email y contraseña que indicaste en
        el formulario.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/login"
          className="inline-flex min-h-12 min-w-[180px] items-center justify-center rounded-full bg-brand px-8 text-[15px] font-medium text-white transition hover:bg-brand-hover"
        >
          Ir al inicio de sesión
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-12 min-w-[180px] items-center justify-center rounded-full border border-border bg-white px-8 text-[15px] font-medium text-foreground transition hover:bg-zinc-50"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
