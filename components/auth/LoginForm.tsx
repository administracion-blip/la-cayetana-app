"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  initialError?: string | null;
  successMessage?: string | null;
};

export function LoginForm({ initialError, successMessage }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo iniciar sesión");
        return;
      }
      // Señal efímera para forzar al host del pop up de programación a saltar
      // al entrar en /app, saltándose el cooldown de 1 h una única vez.
      try {
        sessionStorage.setItem("programacion_popup_force", "1");
      } catch {
        // sessionStorage puede no estar disponible; no es crítico
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
      method="post"
      action="/api/auth/login"
      className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm"
    >
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none ring-brand focus:ring-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-muted" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none ring-brand focus:ring-2"
        />
      </div>
      <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          name="rememberMe"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="h-4 w-4 cursor-pointer rounded border-border text-brand focus:ring-brand"
        />
        Recordarme en este dispositivo
      </label>
      {successMessage ? (
        <p className="text-sm text-emerald-800" role="status">
          {successMessage}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-full bg-brand py-3 text-[15px] font-medium text-white hover:bg-brand-hover active:bg-[#8f1d1d] disabled:opacity-60"
      >
        {loading ? "Entrando…" : "Entrar"}
      </button>
      <p className="text-center text-sm">
        <Link
          href="/forgot-password"
          className="text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          ¿Has olvidado tu contraseña?
        </Link>
      </p>
      <p className="text-center text-sm text-muted">
        ¿Aún no tienes carnet?{" "}
        <Link
          href="/"
          className="text-brand underline-offset-2 hover:underline"
        >
          Volver al inicio
        </Link>
      </p>
    </form>
  );
}
