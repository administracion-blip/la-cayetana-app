"use client";

import { useState } from "react";

type Props = {
  onClose: () => void;
  /**
   * Se llama tras enviar la invitación con éxito. Pasamos la URL solo si la
   * API la devolvió (modo log-only / SES sin configurar) para que el admin
   * pueda copiarla manualmente.
   */
  onInvited: (info: {
    email: string;
    inviteUrl?: string;
    emailSent: boolean;
  }) => void;
};

/**
 * Modal para enviar una invitación de alta sin pasar por Stripe.
 * El destinatario recibe un email con un enlace que caduca a los 7 días;
 * al abrirlo, completa sus datos en `/invitacion` y queda activo.
 */
export function InviteMemberModal({ onClose, onInvited }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Introduce un email para enviar la invitación");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            emailSent?: boolean;
            warning?: string;
            inviteUrl?: string;
          }
        | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "No se pudo enviar la invitación");
        return;
      }
      onInvited({
        email: email.trim(),
        emailSent: data.emailSent !== false,
        inviteUrl: data.inviteUrl,
      });
    } catch {
      setError("Error de red al enviar la invitación");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-member-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <div>
          <h2
            id="invite-member-title"
            className="text-lg font-semibold text-foreground"
          >
            Invitar nuevo socio
          </h2>
          <p className="mt-1 text-sm text-muted">
            Le enviaremos un email con un enlace para que rellene sus datos.
            Al completar el formulario, su cuenta se activará automáticamente
            (sin pasar por Stripe).
          </p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <label
              className="mb-1 block text-sm font-medium text-foreground"
              htmlFor="invite-email"
            >
              Email del invitado
            </label>
            <input
              id="invite-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
            />
          </div>
          <div>
            <label
              className="mb-1 block text-sm font-medium text-foreground"
              htmlFor="invite-name"
            >
              Nombre <span className="text-muted">(opcional)</span>
            </label>
            <input
              id="invite-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Para personalizar el saludo del email"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
            />
          </div>
          <div>
            <label
              className="mb-1 block text-sm font-medium text-foreground"
              htmlFor="invite-phone"
            >
              Teléfono <span className="text-muted">(opcional)</span>
            </label>
            <input
              id="invite-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Se precarga en el formulario del invitado"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
            />
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {loading ? "Enviando…" : "Enviar invitación"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
