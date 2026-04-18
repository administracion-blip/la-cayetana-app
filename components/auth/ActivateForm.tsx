"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  sessionId: string;
};

export function ActivateForm({ sessionId }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [emailLocked, setEmailLocked] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`,
        );
        const data = (await res.json()) as {
          prefillEmail?: string;
          prefillName?: string;
          emailFromStripe?: boolean;
        };
        if (ignore || !res.ok) return;
        if (data.prefillName) setName(data.prefillName);
        if (data.prefillEmail) setEmail(data.prefillEmail);
        setEmailLocked(Boolean(data.emailFromStripe));
      } catch {
        /* el usuario puede rellenar a mano */
      } finally {
        if (!ignore) setHydrating(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [sessionId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          name,
          email,
          password,
          phone: phone || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo completar el registro");
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm"
    >
      {hydrating ? (
        <p className="text-sm text-muted" role="status">
          Cargando datos del pago…
        </p>
      ) : null}
      <div>
        <label className="mb-1 block text-sm text-muted" htmlFor="name">
          Nombre completo
        </label>
        <input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none ring-brand focus:ring-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-muted" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          readOnly={emailLocked}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none ring-brand focus:ring-2 ${emailLocked ? "cursor-not-allowed bg-zinc-50 text-muted" : ""}`}
        />
        {emailLocked ? (
          <p className="mt-1 text-xs text-muted">
            Mismo email que en el pago de Stripe.
          </p>
        ) : null}
      </div>
      <div>
        <label className="mb-1 block text-sm text-muted" htmlFor="phone">
          Teléfono (opcional)
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none ring-brand focus:ring-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-muted" htmlFor="password">
          Contraseña (mín. 8 caracteres)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none ring-brand focus:ring-2"
        />
      </div>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading || hydrating}
        className="mt-2 rounded-full bg-brand py-3 text-[15px] font-medium text-white hover:bg-brand-hover disabled:opacity-60"
      >
        {loading ? "Creando cuenta…" : "Activar mi carnet"}
      </button>
    </form>
  );
}
