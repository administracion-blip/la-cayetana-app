"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  isCaptchaEnabledOnClient,
  TurnstileField,
} from "@/components/security/TurnstileField";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRequired = isCaptchaEnabledOnClient();
  const handleCaptchaToken = useCallback((token: string | null) => {
    setCaptchaToken(token);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (captchaRequired && !captchaToken) {
      setError("Completa la verificación anti-bot antes de continuar.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, captchaToken }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "No se pudo enviar la solicitud");
        return;
      }
      setDone(true);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-[15px] leading-relaxed text-foreground">
          Si ese email está registrado, recibirás un enlace para restablecer la
          contraseña (revisa también spam).
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-brand underline-offset-2 hover:underline"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm"
    >
      <div>
        <label className="mb-1 block text-sm text-muted" htmlFor="fp-email">
          Email de tu cuenta
        </label>
        <input
          id="fp-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none ring-brand focus:ring-2"
        />
      </div>
      <TurnstileField onToken={handleCaptchaToken} />
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading || (captchaRequired && !captchaToken)}
        className="mt-2 rounded-full bg-brand py-3 text-[15px] font-medium text-white hover:bg-brand-hover disabled:opacity-60"
      >
        {loading ? "Enviando…" : "Enviar enlace"}
      </button>
      <p className="text-center text-sm text-muted">
        <Link
          href="/login"
          className="text-brand underline-offset-2 hover:underline"
        >
          Volver al inicio de sesión
        </Link>
      </p>
    </form>
  );
}
