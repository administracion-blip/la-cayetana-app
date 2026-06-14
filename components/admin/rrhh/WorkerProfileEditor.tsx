"use client";

import { useEffect, useState } from "react";
import type { RrhhPosition } from "@/lib/rrhh/positions";
import { PositionBadge } from "./PositionBadge";
import { PositionSelect } from "./PositionSelect";

type ProfileFields = {
  dni: string;
  socialSecurityNumber: string;
  iban: string;
  address: string;
  city: string;
  postalCode: string;
  position: string;
};

type Props = {
  userId: string;
  email: string;
  initial: ProfileFields;
};

const INPUT_CLASS =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2";

type TextFieldKey = Exclude<keyof ProfileFields, "position">;

const FIELD_LABELS: { key: TextFieldKey; label: string }[] = [
  { key: "dni", label: "DNI / NIE" },
  { key: "socialSecurityNumber", label: "Nº Seguridad Social" },
  { key: "iban", label: "IBAN" },
  { key: "address", label: "Dirección" },
  { key: "city", label: "Ciudad" },
  { key: "postalCode", label: "Código postal" },
];

/**
 * Ficha laboral del trabajador: vista de solo lectura con opción de edición
 * de los datos sensibles (gestores). El nombre y el email se gestionan desde
 * el perfil del socio.
 */
export function WorkerProfileEditor({ userId, email, initial }: Props) {
  const [values, setValues] = useState<ProfileFields>(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileFields>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<RrhhPosition[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/rrhh/positions", {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => null)) as
          | { positions?: RrhhPosition[] }
          | null;
        if (!cancelled && data?.positions) setPositions(data.positions);
      } catch {
        /* el badge usará color neutro si no carga el catálogo */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentColor =
    positions.find((p) => p.name === values.position)?.color ?? null;

  function startEdit() {
    setDraft(values);
    setError(null);
    setEditing(true);
  }

  function setField(key: TextFieldKey, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/rrhh/workers/${encodeURIComponent(userId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "No se pudo guardar la ficha");
        return;
      }
      setValues({ ...draft });
      setEditing(false);
    } catch {
      setError("Error de red al guardar la ficha");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Datos laborales</h2>
        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="rounded-full border border-border px-4 py-1.5 text-sm font-medium hover:bg-background"
          >
            Editar
          </button>
        ) : null}
      </div>

      {!editing ? (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-muted">Email</dt>
            <dd className="mt-0.5 break-words text-sm font-medium">{email}</dd>
          </div>
          {FIELD_LABELS.map((f) => (
            <div key={f.key}>
              <dt className="text-xs uppercase text-muted">{f.label}</dt>
              <dd className="mt-0.5 break-words text-sm font-medium">
                {values[f.key] || "—"}
              </dd>
            </div>
          ))}
          <div>
            <dt className="text-xs uppercase text-muted">Puesto</dt>
            <dd className="mt-1">
              {values.position ? (
                <PositionBadge name={values.position} color={currentColor} />
              ) : (
                <span className="text-sm font-medium">—</span>
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELD_LABELS.map((f) => (
              <div
                key={f.key}
                className={f.key === "address" ? "sm:col-span-2" : undefined}
              >
                <label
                  htmlFor={`wp-${f.key}`}
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  {f.label}
                </label>
                <input
                  id={`wp-${f.key}`}
                  type="text"
                  required
                  value={draft[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label
                htmlFor="wp-position"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Puesto (opcional)
              </label>
              <PositionSelect
                id="wp-position"
                value={draft.position}
                onChange={(name) =>
                  setDraft((prev) => ({ ...prev, position: name }))
                }
                positions={positions}
                onPositionsChange={setPositions}
              />
            </div>
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-zinc-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
