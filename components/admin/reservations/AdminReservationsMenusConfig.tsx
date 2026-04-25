"use client";

import { useCallback, useEffect, useState } from "react";
import { formatAmountEuros } from "@/components/reservations/formatters";
import {
  MENU_MAIN_COURSE_SLOT_COUNT,
  padMainCourseSlots,
} from "@/lib/reservation-menus-helpers";
import {
  type AdminApiError,
} from "@/lib/admin-reservations/client";
import type { AdminMenusConfigDto } from "@/lib/serialization/reservations";
import type { ReservationMenuOffer } from "@/types/models";

type DraftOffer = ReservationMenuOffer;

async function getMenusConfig(): Promise<{ config: AdminMenusConfigDto }> {
  const res = await fetch("/api/admin/reservations/config/menus", {
    method: "GET",
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(
      typeof body.error === "string" ? body.error : "Error",
    ) as AdminApiError;
    err.status = res.status;
    throw err;
  }
  return body as { config: AdminMenusConfigDto };
}

async function putMenusConfig(
  offers: ReservationMenuOffer[],
): Promise<{ config: AdminMenusConfigDto }> {
  const res = await fetch("/api/admin/reservations/config/menus", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offers }),
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(
      typeof body.error === "string" ? body.error : "Error",
    ) as AdminApiError;
    err.status = res.status;
    throw err;
  }
  return body as { config: AdminMenusConfigDto };
}

function newDraft(): DraftOffer {
  return {
    offerId: crypto.randomUUID(),
    name: "Nuevo menú",
    priceCents: 2500,
    mainCourses: ["", "", "", ""],
    active: true,
    sortOrder: 0,
  };
}

export function AdminReservationsMenusConfig({ canEdit }: { canEdit: boolean }) {
  const [config, setConfig] = useState<AdminMenusConfigDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getMenusConfig();
      setConfig(d.config);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!statusMsg) return;
    const t = setTimeout(() => setStatusMsg(null), 3000);
    return () => clearTimeout(t);
  }, [statusMsg]);

  const updateOffer = (index: number, patch: Partial<DraftOffer>) => {
    setConfig((c) => {
      if (!c) return c;
      const offers = [...c.offers];
      const cur = offers[index]!;
      offers[index] = { ...cur, ...patch } as DraftOffer;
      return { ...c, offers };
    });
  };

  const setMainCourseSlot = (
    offerIndex: number,
    slot: number,
    value: string,
  ) => {
    setConfig((c) => {
      if (!c) return c;
      const offers = [...c.offers];
      const cur = offers[offerIndex]!;
      const p = padMainCourseSlots(cur.mainCourses);
      p[slot] = value;
      offers[offerIndex] = { ...cur, mainCourses: [...p] };
      return { ...c, offers };
    });
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setStatusMsg(null);
    try {
      const d = await putMenusConfig(
        config.offers.map((o, i) => ({ ...o, sortOrder: i })),
      );
      setConfig(d.config);
      setStatusMsg("Menús guardados");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (offerId: string, file: File | null) => {
    if (!file || !canEdit) return;
    setUploadingId(offerId);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("offerId", offerId);
      fd.set("file", file);
      const res = await fetch("/api/admin/reservations/config/menus/image", {
        method: "POST",
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "Error al subir",
        );
      }
      await load();
      setStatusMsg("Imagen actualizada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir");
    } finally {
      setUploadingId(null);
    }
  };

  if (loading) return <p className="text-sm text-muted">Cargando menús…</p>;
  if (error && !config) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
        {error}
      </div>
    );
  }
  if (!config) return null;

  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      {statusMsg ? (
        <p
          className="mb-3 text-sm font-medium text-emerald-800"
          role="status"
        >
          {statusMsg}
        </p>
      ) : null}
      {error ? (
        <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-2 text-sm text-rose-900">
          {error}
        </p>
      ) : null}

      <h2 className="mb-1 text-lg font-semibold">Menús ofertados</h2>
      <p className="mb-4 text-sm text-muted">
        Nombre, importe, hasta cuatro platos principales (los en blanco no se
        muestran al cliente), activo. Guarda la fila antes de subir la
        imagen. Orden: de arriba a abajo.
      </p>

      <ul className="space-y-4">
        {config.offers.map((o, i) => (
          <li
            key={o.offerId}
            className="rounded-xl border border-border p-3"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-xs text-muted">Nombre</span>
                <input
                  className="mt-0.5 w-full rounded-lg border border-border px-2 py-1.5"
                  value={o.name}
                  disabled={!canEdit}
                  onChange={(e) => updateOffer(i, { name: e.target.value })}
                />
              </label>
              <label className="text-sm">
                <span className="text-xs text-muted">Importe (€)</span>
                <input
                  type="number"
                  className="mt-0.5 w-full rounded-lg border border-border px-2 py-1.5"
                  value={(o.priceCents / 100).toFixed(2)}
                  disabled={!canEdit}
                  min={0}
                  step="0.01"
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n) || n < 0) return;
                    updateOffer(i, { priceCents: Math.round(n * 100) });
                  }}
                />
              </label>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {Array.from({ length: MENU_MAIN_COURSE_SLOT_COUNT }, (_, slot) => {
                const p = padMainCourseSlots(o.mainCourses);
                return (
                  <label key={slot} className="text-sm">
                    <span className="text-xs text-muted">
                      Principal {slot + 1} (opcional)
                    </span>
                    <input
                      className="mt-0.5 w-full rounded-lg border border-border px-2 py-1.5"
                      value={p[slot] ?? ""}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setMainCourseSlot(i, slot, e.target.value)
                      }
                      maxLength={200}
                      placeholder="En blanco = no se muestra"
                    />
                  </label>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer"
                  checked={o.active}
                  disabled={!canEdit}
                  onChange={(e) =>
                    updateOffer(i, { active: e.target.checked })
                  }
                />
                Activo
              </label>
              {o.imageS3Key ? (
                <img
                  src={`/api/admin/reservations/config/menu-image/${encodeURIComponent(
                    o.offerId,
                  )}`}
                  alt=""
                  className="h-12 w-12 rounded border border-border object-cover"
                />
              ) : (
                <span className="text-xs text-muted">Sin imagen</span>
              )}
              <div className="flex flex-col gap-0.5">
                <input
                  id={`menu-image-input-${o.offerId}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  tabIndex={-1}
                  disabled={!canEdit || saving || uploadingId !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void onUpload(o.offerId, f);
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    document
                      .getElementById(`menu-image-input-${o.offerId}`)
                      ?.click()
                  }
                  disabled={!canEdit || saving || uploadingId !== null}
                  className="inline-flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-lg border-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploadingId === o.offerId
                    ? "Subiendo…"
                    : o.imageS3Key
                      ? "Cambiar imagen de carta"
                      : "Subir imagen de carta"}
                </button>
                <span className="text-[11px] text-muted">
                  JPG, PNG, WebP o GIF · máx. 5 MB
                </span>
              </div>
            </div>
            {canEdit ? (
              <button
                type="button"
                className="mt-2 text-xs text-rose-600 underline"
                onClick={() => {
                  if (
                    !confirm("¿Quitar este menú del catálogo? (No borra reservas pasadas).")
                  )
                    return;
                  setConfig((c) =>
                    c
                      ? { ...c, offers: c.offers.filter((x) => x.offerId !== o.offerId) }
                      : c,
                  );
                }}
              >
                Quitar fila
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {canEdit ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setConfig((c) =>
                c
                  ? { ...c, offers: [...c.offers, newDraft()] }
                  : c,
            )
            }
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            + Añadir menú
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar menús"}
          </button>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-muted">
        Referencia de importe en pantalla:{" "}
        {config.offers
          .filter((o) => o.active)
          .map(
            (o) =>
              `${o.name} (${formatAmountEuros(o.priceCents)})`,
          )
          .join(" · ") || "Ninguno activo"}
      </p>
    </section>
  );
}
