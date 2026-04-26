"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PrivacyPolicyModal } from "@/components/auth/PrivacyPolicyModal";
import {
  isCaptchaEnabledOnClient,
  TurnstileField,
} from "@/components/security/TurnstileField";
import { MAX_BIRTH_YEAR, MIN_BIRTH_YEAR } from "@/lib/validation";

const SEX_OPTIONS: {
  value: "male" | "female" | "prefer_not_to_say";
  label: string;
}[] = [
  { value: "male", label: "Hombre" },
  { value: "female", label: "Mujer" },
  { value: "prefer_not_to_say", label: "Prefiero no decirlo" },
];

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.06 10.06 0 0 1 12 19c-6.5 0-10-7-10-7a17.54 17.54 0 0 1 4.06-4.94" />
      <path d="M9.88 5.08A10.42 10.42 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.23 4.3" />
      <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}

type Props = {
  token: string;
};

type PreviewState =
  | { phase: "loading" }
  | { phase: "ready"; email: string; name: string; phone: string }
  | { phase: "error"; message: string };

export function AcceptInviteForm({ token }: Props) {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ phase: "loading" });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sex, setSex] =
    useState<"" | "male" | "female" | "prefer_not_to_say">("");
  const [birthYear, setBirthYear] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ membershipId: string | null } | null>(
    null,
  );
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRequired = isCaptchaEnabledOnClient();
  const handleCaptchaToken = useCallback((token: string | null) => {
    setCaptchaToken(token);
  }, []);

  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const years = useMemo(
    () =>
      Array.from(
        { length: MAX_BIRTH_YEAR - MIN_BIRTH_YEAR + 1 },
        (_, i) => MAX_BIRTH_YEAR - i,
      ),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setPreview({
        phase: "error",
        message: "Falta el token de invitación en el enlace.",
      });
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/auth/accept-invite/preview?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; email?: string; name?: string; phone?: string; error?: string }
          | null;
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setPreview({
            phase: "error",
            message:
              data?.error ??
              "El enlace no es válido. Pide al admin que te envíe uno nuevo.",
          });
          return;
        }
        setPreview({
          phase: "ready",
          email: data.email ?? "",
          name: data.name ?? "",
          phone: data.phone ?? "",
        });
        if (data.name) setName(data.name);
        if (data.phone) setPhone(data.phone);
      } catch {
        if (cancelled) return;
        setPreview({
          phase: "error",
          message: "No se pudo validar el enlace de invitación.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (preview.phase !== "ready") return;

    if (!name.trim()) {
      setError("Introduce tu nombre completo");
      return;
    }
    if (!phone.trim()) {
      setError("Introduce un teléfono de contacto");
      return;
    }
    if (!sex) {
      setError("Selecciona una opción en «Sexo»");
      return;
    }
    if (!birthYear) {
      setError("Selecciona tu año de nacimiento");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== confirmPassword) return;
    if (!acceptTerms) {
      setError("Debes aceptar las condiciones para continuar");
      return;
    }
    if (captchaRequired && !captchaToken) {
      setError("Completa la verificación anti-bot antes de continuar.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name,
          phone,
          sex,
          birthYear: Number(birthYear),
          password,
          confirmPassword,
          acceptTerms,
          captchaToken,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; membershipId?: string | null; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "No se pudo completar el alta");
        return;
      }
      setDone({ membershipId: data.membershipId ?? null });
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (preview.phase === "loading") {
    return (
      <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted shadow-sm">
        Validando invitación…
      </div>
    );
  }

  if (preview.phase === "error") {
    return (
      <div className="mx-auto w-full max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm">
        <p className="font-semibold">No podemos abrir tu invitación</p>
        <p className="mt-1">{preview.message}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900 shadow-sm">
        <p className="text-base font-semibold">¡Bienvenido a La Cayetana!</p>
        <p className="mt-2">
          Tu alta se ha completado correctamente.
          {done.membershipId ? (
            <>
              {" "}
              Tu número de socio es{" "}
              <span className="font-mono font-semibold">
                {done.membershipId}
              </span>
              .
            </>
          ) : null}
        </p>
        <p className="mt-3">
          Ya puedes{" "}
          <a href="/login" className="font-semibold text-emerald-900 underline">
            iniciar sesión
          </a>{" "}
          con el email <strong>{preview.email}</strong> y la contraseña que
          acabas de elegir.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm"
    >
      <div className="rounded-xl border border-brand/30 bg-brand/5 p-3 text-xs text-muted">
        Has sido invitado al alta como socio. El alta es gratuita y no requiere
        pago. Tu email es{" "}
        <span className="font-semibold text-foreground">{preview.email}</span>.
      </div>
      <div>
        <label
          className="mb-1 block text-sm font-semibold text-foreground"
          htmlFor="name"
        >
          Nombre completo
        </label>
        <input
          id="name"
          name="name"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none ring-brand focus:ring-2"
        />
      </div>
      <div>
        <label
          className="mb-1 block text-sm font-semibold text-foreground"
          htmlFor="phone"
        >
          Teléfono
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          minLength={6}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none ring-brand focus:ring-2"
        />
      </div>
      <div>
        <label
          className="mb-1 block text-sm font-semibold text-foreground"
          htmlFor="sex"
        >
          Sexo
        </label>
        <select
          id="sex"
          name="sex"
          required
          value={sex}
          onChange={(e) =>
            setSex(
              e.target.value as "" | "male" | "female" | "prefer_not_to_say",
            )
          }
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none ring-brand focus:ring-2"
        >
          <option value="" disabled>
            Selecciona una opción…
          </option>
          {SEX_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label
          className="mb-1 block text-sm font-semibold text-foreground"
          htmlFor="birthYear"
        >
          Año de nacimiento
        </label>
        <select
          id="birthYear"
          name="birthYear"
          required
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none ring-brand focus:ring-2"
        >
          <option value="" disabled>
            Selecciona el año…
          </option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">Debes ser mayor de 18 años.</p>
      </div>
      <div>
        <label
          className="mb-1 block text-sm font-semibold text-foreground"
          htmlFor="password"
        >
          Contraseña (mín. 8 caracteres)
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-12 text-[15px] outline-none ring-brand focus:ring-2"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={
              showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
            }
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-zinc-400 transition hover:text-zinc-600"
            tabIndex={-1}
          >
            <EyeIcon open={showPassword} />
          </button>
        </div>
      </div>
      <div>
        <label
          className="mb-1 block text-sm font-semibold text-foreground"
          htmlFor="confirmPassword"
        >
          Confirmar contraseña
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={passwordsMismatch || undefined}
            aria-describedby={
              passwordsMismatch ? "confirmPassword-error" : undefined
            }
            className={`w-full rounded-xl border bg-background px-4 py-3 pr-12 text-[15px] outline-none focus:ring-2 ${
              passwordsMismatch
                ? "border-red-300 ring-red-300"
                : "border-border ring-brand"
            }`}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((v) => !v)}
            aria-label={
              showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"
            }
            aria-pressed={showConfirmPassword}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-zinc-400 transition hover:text-zinc-600"
            tabIndex={-1}
          >
            <EyeIcon open={showConfirmPassword} />
          </button>
        </div>
        {passwordsMismatch ? (
          <p
            id="confirmPassword-error"
            role="alert"
            className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            Las contraseñas no coinciden.
          </p>
        ) : null}
      </div>
      <div className="flex items-start gap-2 text-sm text-muted">
        <input
          id="invite-accept-terms"
          type="checkbox"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          required
          className="mt-1 h-4 w-4 shrink-0 accent-brand"
        />
        <p className="min-w-0 leading-snug">
          <label htmlFor="invite-accept-terms" className="cursor-pointer">
            He leído y acepto las condiciones de uso y la{" "}
          </label>
          <button
            type="button"
            className="inline p-0 text-left font-inherit text-brand underline underline-offset-2 hover:text-brand-hover focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setPrivacyOpen(true);
            }}
          >
            política de privacidad
          </button>
          .
        </p>
      </div>
      <PrivacyPolicyModal
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
      />

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
        {loading ? "Completando alta…" : "Completar alta"}
      </button>
    </form>
  );
}
