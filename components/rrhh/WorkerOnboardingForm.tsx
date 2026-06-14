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

type Props = { token: string };

type PreviewState =
  | { phase: "loading" }
  | { phase: "ready"; email: string; name: string; phone: string }
  | { phase: "error"; message: string };

const inputClass =
  "w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none ring-brand focus:ring-2";
const labelClass = "mb-1 block text-sm font-semibold text-foreground";

export function WorkerOnboardingForm({ token }: Props) {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ phase: "loading" });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sex, setSex] =
    useState<"" | "male" | "female" | "prefer_not_to_say">("");
  const [birthYear, setBirthYear] = useState("");
  const [dni, setDni] = useState("");
  const [ssn, setSsn] = useState("");
  const [iban, setIban] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ membershipId: string | null } | null>(
    null,
  );
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRequired = isCaptchaEnabledOnClient();
  const handleCaptchaToken = useCallback((t: string | null) => {
    setCaptchaToken(t);
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
          `/api/rrhh/onboarding/preview?token=${encodeURIComponent(token)}`,
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
              "El enlace no es válido. Pide a RRHH que te envíe uno nuevo.",
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

    if (!name.trim()) return setError("Introduce tu nombre completo");
    if (!phone.trim()) return setError("Introduce un teléfono de contacto");
    if (!sex) return setError("Selecciona una opción en «Sexo»");
    if (!birthYear) return setError("Selecciona tu año de nacimiento");
    if (!dni.trim()) return setError("Introduce tu DNI/NIE");
    if (!ssn.trim()) return setError("Introduce tu número de la Seguridad Social");
    if (!iban.trim()) return setError("Introduce tu IBAN");
    if (!address.trim()) return setError("Introduce tu dirección");
    if (!city.trim()) return setError("Introduce tu ciudad");
    if (!postalCode.trim()) return setError("Introduce tu código postal");
    if (password.length < 8)
      return setError("La contraseña debe tener al menos 8 caracteres");
    if (password !== confirmPassword) return;
    if (!acceptTerms)
      return setError("Debes aceptar las condiciones para continuar");
    if (captchaRequired && !captchaToken)
      return setError("Completa la verificación anti-bot antes de continuar.");

    setLoading(true);
    try {
      const res = await fetch("/api/rrhh/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name,
          phone,
          sex,
          birthYear: Number(birthYear),
          dni,
          socialSecurityNumber: ssn,
          iban,
          address,
          city,
          postalCode,
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
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900 shadow-sm">
          <p className="text-base font-semibold">¡Alta completada!</p>
          <p className="mt-2">Tu cuenta y tu ficha laboral se han creado.</p>
          <p className="mt-3">
            Ya puedes{" "}
            <a
              href="/login"
              className="font-semibold text-emerald-900 underline"
            >
              iniciar sesión
            </a>{" "}
            con el email <strong>{preview.email}</strong> y la contraseña que
            acabas de elegir.
          </p>
        </div>
        <DniUploadStep token={token} />
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm"
    >
      <div className="rounded-xl border border-brand/30 bg-brand/5 p-3 text-xs text-muted">
        Tu email es{" "}
        <span className="font-semibold text-foreground">{preview.email}</span>.
      </div>

      <div>
        <label className={labelClass} htmlFor="name">
          Nombre completo
        </label>
        <input
          id="name"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="phone">
          Teléfono
        </label>
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          required
          minLength={6}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="sex">
            Sexo
          </label>
          <select
            id="sex"
            required
            value={sex}
            onChange={(e) =>
              setSex(
                e.target.value as "" | "male" | "female" | "prefer_not_to_say",
              )
            }
            className={inputClass}
          >
            <option value="" disabled>
              Selecciona…
            </option>
            {SEX_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="birthYear">
            Año de nacimiento
          </label>
          <select
            id="birthYear"
            required
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Selecciona…
            </option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="dni">
            DNI / NIE
          </label>
          <input
            id="dni"
            required
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="ssn">
            Nº Seguridad Social
          </label>
          <input
            id="ssn"
            required
            value={ssn}
            onChange={(e) => setSsn(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="iban">
          IBAN
        </label>
        <input
          id="iban"
          required
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="address">
          Dirección
        </label>
        <input
          id="address"
          required
          autoComplete="street-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="city">
            Ciudad
          </label>
          <input
            id="city"
            required
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="postalCode">
            Código postal
          </label>
          <input
            id="postalCode"
            required
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="password">
          Contraseña (mín. 8 caracteres)
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="confirmPassword">
          Confirmar contraseña
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={passwordsMismatch || undefined}
          className={`w-full rounded-xl border bg-background px-4 py-3 text-[15px] outline-none focus:ring-2 ${
            passwordsMismatch
              ? "border-red-300 ring-red-300"
              : "border-border ring-brand"
          }`}
        />
        {passwordsMismatch ? (
          <p
            role="alert"
            className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            Las contraseñas no coinciden.
          </p>
        ) : null}
      </div>

      <div className="flex items-start gap-2 text-sm text-muted">
        <input
          id="worker-accept-terms"
          type="checkbox"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          required
          className="mt-1 h-4 w-4 shrink-0 accent-brand"
        />
        <p className="min-w-0 leading-snug">
          <label htmlFor="worker-accept-terms" className="cursor-pointer">
            He leído y acepto las condiciones de uso y la{" "}
          </label>
          <button
            type="button"
            className="inline p-0 text-left font-inherit text-brand underline underline-offset-2 hover:text-brand-hover"
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

function DniUploadStep({ token }: { token: string }) {
  const [uploadingSide, setUploadingSide] = useState<"front" | "back" | null>(
    null,
  );
  const [uploaded, setUploaded] = useState<Record<"front" | "back", boolean>>({
    front: false,
    back: false,
  });
  const [error, setError] = useState<string | null>(null);

  async function upload(side: "front" | "back", file: File) {
    setError(null);
    setUploadingSide(side);
    try {
      const fd = new FormData();
      fd.append("token", token);
      fd.append("side", side);
      fd.append("file", file);
      const res = await fetch("/api/rrhh/onboarding/documents", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "No se pudo subir el documento");
        return;
      }
      setUploaded((u) => ({ ...u, [side]: true }));
    } catch {
      setError("Error de red al subir el documento.");
    } finally {
      setUploadingSide(null);
    }
  }

  const sides: { side: "front" | "back"; label: string }[] = [
    { side: "front", label: "DNI · anverso" },
    { side: "back", label: "DNI · reverso" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-sm shadow-sm">
      <p className="font-semibold">Sube tu DNI (opcional ahora)</p>
      <p className="mt-1 text-muted">
        Adjunta una foto o PDF del anverso y reverso. Puedes hacerlo ahora o
        más tarde desde el mismo enlace.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {sides.map(({ side, label }) => (
          <div key={side} className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              {label}
              {uploaded[side] ? (
                <span className="ml-2 text-emerald-600">✓ subido</span>
              ) : null}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={uploadingSide !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(side, f);
              }}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-brand file:px-4 file:py-2 file:text-white disabled:opacity-60"
            />
          </div>
        ))}
      </div>
      {uploadingSide ? (
        <p className="mt-3 text-muted">Subiendo…</p>
      ) : null}
      {error ? (
        <p className="mt-3 text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
