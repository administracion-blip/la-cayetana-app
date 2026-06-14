"use client";

import { useEffect, useState } from "react";
import type { RrhhPosition } from "@/lib/rrhh/positions";
import { PositionSelect } from "./rrhh/PositionSelect";
import type { SafeUser } from "./AdminUsersClient";

type Props = {
  user: SafeUser;
  onClose: () => void;
  onConverted: (userId: string) => void;
};

type ProfileFields = {
  dni: string;
  socialSecurityNumber: string;
  iban: string;
  address: string;
  city: string;
  postalCode: string;
  position: string;
};

const EMPTY: ProfileFields = {
  dni: "",
  socialSecurityNumber: "",
  iban: "",
  address: "",
  city: "",
  postalCode: "",
  position: "",
};

const INPUT_CLASS =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2";

/**
 * Crea o edita la ficha laboral de un socio marcado como trabajador.
 * Si ya existe perfil, carga los datos guardados y actualiza con PUT.
 */
export function ConvertToWorkerModal({ user, onClose, onConverted }: Props) {
  const [fields, setFields] = useState<ProfileFields>(EMPTY);
  const [positions, setPositions] = useState<RrhhPosition[]>([]);
  const [hasProfile, setHasProfile] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingProfile(true);
    setError(null);
    setFields(EMPTY);
    setHasProfile(false);

    (async () => {
      try {
        const [posRes, profileRes] = await Promise.all([
          fetch("/api/admin/rrhh/positions", { cache: "no-store" }),
          fetch(`/api/admin/rrhh/workers/${encodeURIComponent(user.id)}`, {
            cache: "no-store",
          }),
        ]);
        if (cancelled) return;

        const posData = (await posRes.json().catch(() => null)) as
          | { positions?: RrhhPosition[] }
          | null;
        if (posData?.positions) setPositions(posData.positions);

        const profileData = (await profileRes.json().catch(() => null)) as
          | { profile?: ProfileFields | null; error?: string }
          | null;

        if (!profileRes.ok) {
          setError(profileData?.error ?? "No se pudo cargar la ficha");
          return;
        }

        if (profileData?.profile) {
          setHasProfile(true);
          setFields(profileData.profile);
        }
      } catch {
        if (!cancelled) setError("Error de red al cargar la ficha");
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user.id]);

  function setField<K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const body = {
      dni: fields.dni,
      socialSecurityNumber: fields.socialSecurityNumber,
      iban: fields.iban,
      address: fields.address,
      city: fields.city,
      postalCode: fields.postalCode,
      position: fields.position,
    };
    try {
      const res = hasProfile
        ? await fetch(
            `/api/admin/rrhh/workers/${encodeURIComponent(user.id)}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          )
        : await fetch("/api/admin/rrhh/workers/convert", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id, ...body }),
          });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setError(
          data?.error ??
            (hasProfile
              ? "No se pudo guardar la ficha"
              : "No se pudo convertir al socio en trabajador"),
        );
        return;
      }
      onConverted(user.id);
    } catch {
      setError("Error de red al guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="convert-worker-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[min(90dvh,820px)] w-full max-w-md flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <div>
          <h2
            id="convert-worker-title"
            className="text-lg font-semibold text-foreground"
          >
            {hasProfile ? "Ficha de trabajador" : "Convertir en trabajador"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            <strong className="text-foreground">{user.name}</strong> ·{" "}
            <span className="font-mono">{user.email}</span>. Datos
            confidenciales para la ficha laboral.
          </p>
        </div>
        {loadingProfile ? (
          <p className="py-8 text-center text-sm text-muted">Cargando ficha…</p>
        ) : (
          <form
            onSubmit={onSubmit}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
          >
            <div>
              <label
                className="mb-1 block text-sm font-medium text-foreground"
                htmlFor="conv-dni"
              >
                DNI / NIE
              </label>
              <input
                id="conv-dni"
                type="text"
                required
                value={fields.dni}
                onChange={(e) => setField("dni", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-sm font-medium text-foreground"
                htmlFor="conv-nss"
              >
                Nº Seguridad Social
              </label>
              <input
                id="conv-nss"
                type="text"
                required
                value={fields.socialSecurityNumber}
                onChange={(e) => setField("socialSecurityNumber", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-sm font-medium text-foreground"
                htmlFor="conv-iban"
              >
                IBAN
              </label>
              <input
                id="conv-iban"
                type="text"
                required
                value={fields.iban}
                onChange={(e) => setField("iban", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-sm font-medium text-foreground"
                htmlFor="conv-address"
              >
                Dirección
              </label>
              <input
                id="conv-address"
                type="text"
                required
                value={fields.address}
                onChange={(e) => setField("address", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  className="mb-1 block text-sm font-medium text-foreground"
                  htmlFor="conv-city"
                >
                  Ciudad
                </label>
                <input
                  id="conv-city"
                  type="text"
                  required
                  value={fields.city}
                  onChange={(e) => setField("city", e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-sm font-medium text-foreground"
                  htmlFor="conv-postal"
                >
                  Código postal
                </label>
                <input
                  id="conv-postal"
                  type="text"
                  required
                  value={fields.postalCode}
                  onChange={(e) => setField("postalCode", e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
            <div>
              <label
                className="mb-1 block text-sm font-medium text-foreground"
                htmlFor="conv-position"
              >
                Puesto (opcional)
              </label>
              <PositionSelect
                id="conv-position"
                value={fields.position}
                onChange={(v) => setField("position", v)}
                positions={positions}
                onPositionsChange={setPositions}
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
                {loading
                  ? "Guardando…"
                  : hasProfile
                    ? "Guardar ficha"
                    : "Convertir en trabajador"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
