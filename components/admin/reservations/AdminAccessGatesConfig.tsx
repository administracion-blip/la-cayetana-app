"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adminGetAccessGatesConfig,
  adminPutAccessGatesConfig,
  type AdminApiError,
} from "@/lib/admin-reservations/client";
import type { AdminAccessGatesConfigDto } from "@/lib/serialization/reservations";

type GateKey = "carnet" | "table" | "login";

const ROWS: { key: GateKey; label: string; hint: string }[] = [
  { key: "carnet", label: "Carnet", hint: "Bloquea nuevas altas/compra de carnet." },
  { key: "table", label: "Reservas", hint: "Bloquea crear nuevas reservas de mesa." },
  { key: "login", label: "Login", hint: "Bloquea el login público (staff tiene bypass)." },
];

function isoToDatetimeLocalValue(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function localInputToIsoOrUndefined(v: string): string | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

type RowState = Record<GateKey, string>;

function dtoToRowState(c: AdminAccessGatesConfigDto): RowState {
  return {
    carnet: isoToDatetimeLocalValue(c.carnetPurchaseDeadlineIso),
    table: isoToDatetimeLocalValue(c.tableReservationDeadlineIso),
    login: isoToDatetimeLocalValue(c.loginDeadlineIso),
  };
}

export function AdminAccessGatesConfig({ canEdit }: { canEdit: boolean }) {
  const [config, setConfig] = useState<AdminAccessGatesConfigDto | null>(null);
  const [values, setValues] = useState<RowState>({ carnet: "", table: "", login: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!statusMsg) return;
    const t = setTimeout(() => setStatusMsg(null), 3000);
    return () => clearTimeout(t);
  }, [statusMsg]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { config: c } = await adminGetAccessGatesConfig();
      setConfig(c);
      setValues(dtoToRowState(c));
    } catch (err) {
      const apiErr = err as AdminApiError;
      setError(apiErr?.message ?? "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!config) return;
    const isoByKey: Record<GateKey, string | undefined> = {
      carnet: localInputToIsoOrUndefined(values.carnet),
      table: localInputToIsoOrUndefined(values.table),
      login: localInputToIsoOrUndefined(values.login),
    };
    for (const key of Object.keys(values) as GateKey[]) {
      if (values[key].trim() !== "" && !isoByKey[key]) {
        setError(`Fecha/hora no válida en "${rowLabel(key)}".`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const { config: next } = await adminPutAccessGatesConfig({
        carnetPurchaseDeadlineIso: isoByKey.carnet,
        tableReservationDeadlineIso: isoByKey.table,
        loginDeadlineIso: isoByKey.login,
      });
      setConfig(next);
      setValues(dtoToRowState(next));
      setStatusMsg("Cierres guardados");
    } catch (err) {
      const apiErr = err as AdminApiError;
      setError(apiErr?.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Cierres / bloqueos</h2>
        <p className="mt-2 text-sm text-muted">Cargando…</p>
      </section>
    );
  }

  if (!config) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
        {error ?? "No se pudo cargar la configuración."}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      {statusMsg ? (
        <div
          role="status"
          className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-lg"
        >
          <span>{statusMsg}</span>
        </div>
      ) : null}

      <h2 className="text-lg font-semibold">Cierres / bloqueos</h2>
      <p className="mt-1 text-sm text-muted">
        Tras la fecha/hora indicada se desactiva la acción en la web. Vacío =
        sin cierre.
      </p>
      {error ? (
        <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-2 text-sm text-rose-900">
          {error}
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        {ROWS.map((row) => (
          <div
            key={row.key}
            className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/10 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
          >
            <div className="flex items-center gap-2 sm:w-32 sm:shrink-0">
              <span className="text-sm font-semibold">{row.label}</span>
            </div>
            <input
              type="datetime-local"
              value={values[row.key]}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [row.key]: e.target.value }))
              }
              disabled={!canEdit}
              aria-label={`${row.label}: cierre`}
              title={row.hint}
              className="w-full rounded-lg border border-border px-2 py-1.5 text-sm disabled:opacity-60 sm:w-56"
            />
            {canEdit ? (
              <button
                type="button"
                onClick={() =>
                  setValues((prev) => ({ ...prev, [row.key]: "" }))
                }
                disabled={saving}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted/30 disabled:opacity-60"
                title="Vaciar este cierre"
              >
                Vaciar
              </button>
            ) : null}
            <p className="text-[11px] text-muted sm:ml-auto sm:text-right">
              {row.hint}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {canEdit ? (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        ) : null}
        <span className="text-xs text-muted">
          Última modificación:{" "}
          {new Date(config.updatedAt).toLocaleString("es-ES", {
            timeZone: "Europe/Madrid",
          })}
        </span>
      </div>

      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer">Notas</summary>
        <ul className="mt-2 list-inside list-disc space-y-0.5">
          <li>
            El admin sigue pudiendo entrar al backoffice aunque el login esté
            cerrado para el público.
          </li>
          <li>
            Para <strong>Carnet</strong>, la variable de entorno{" "}
            <code className="rounded bg-muted/40 px-1">
              FECHA_LIMITE_COMPRA_CARNET
            </code>{" "}
            (Amplify) tiene prioridad si está definida.
          </li>
          <li>Los cambios se aplican en unos segundos tras guardar.</li>
        </ul>
      </details>
    </section>
  );
}

function rowLabel(k: GateKey): string {
  return ROWS.find((r) => r.key === k)?.label ?? k;
}
