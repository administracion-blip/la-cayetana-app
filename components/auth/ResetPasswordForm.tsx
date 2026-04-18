"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  initialToken: string;
};

export function ResetPasswordForm({ initialToken }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 8) {
      setError("Mínimo 8 caracteres.");
      return;
    }
    if (!initialToken.trim()) {
      setError("Falta el token del enlace. Abre el enlace del correo completo.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: initialToken, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo cambiar la contraseña");
        return;
      }
      router.push("/login?reset=ok");
      router.refresh();
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  if (!initialToken.trim()) {
    return (
      <div className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-sm text-muted">
          Enlace incompleto. Usa el enlace del correo o{" "}
          <Link href="/forgot-password" className="text-brand underline">
            solicita uno nuevo
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm"
    >
      <div>
        <label className="mb-1 block text-sm text-muted" htmlFor="np1">
          Nueva contraseña
        </label>
        <input
          id="np1"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none ring-brand focus:ring-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-muted" htmlFor="np2">
          Repetir contraseña
        </label>
        <input
          id="np2"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
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
        disabled={loading}
        className="mt-2 rounded-full bg-brand py-3 text-[15px] font-medium text-white hover:bg-brand-hover disabled:opacity-60"
      >
        {loading ? "Guardando…" : "Guardar contraseña"}
      </button>
      <p className="text-center text-sm text-muted">
        <Link href="/login" className="text-brand underline-offset-2 hover:underline">
          Ir al inicio de sesión
        </Link>
      </p>
    </form>
  );
}
