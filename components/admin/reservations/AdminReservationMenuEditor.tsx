"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatAmountEuros } from "@/components/reservations/formatters";
import {
  expandMainCourseCountsToPicks,
  mainCoursesForClientDisplay,
  mainPicksToCountsByOptions,
} from "@/lib/reservation-menus-helpers";
import { adminUpdateReservationMenus, type AdminApiError } from "@/lib/admin-reservations/client";
import type { AdminReservationDto, AdminMenusConfigDto } from "@/lib/serialization/reservations";

type Props = {
  reservation: AdminReservationDto;
  canEdit: boolean;
  onUpdated: (r: AdminReservationDto) => void;
  /** Sin tarjeta propia: para usar dentro de un `<details>` o panel. */
  embed?: boolean;
};

export function AdminReservationMenuEditor({
  reservation,
  canEdit,
  onUpdated,
  embed = false,
}: Props) {
  const [config, setConfig] = useState<AdminMenusConfigDto | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [principalCounts, setPrincipalCounts] = useState<
    Record<string, number[]>
  >({});
  const menuItemsSnapRef = useRef<string>("");
  const lastResIdForSnap = useRef<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reservations/config/menus", {
        method: "GET",
        cache: "no-store",
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        const errMsg =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : "Error al cargar";
        throw new Error(errMsg);
      }
      if (
        typeof body === "object" &&
        body !== null &&
        "config" in body &&
        typeof (body as { config: AdminMenusConfigDto }).config === "object" &&
        (body as { config: AdminMenusConfigDto }).config !== null
      ) {
        setConfig((body as { config: AdminMenusConfigDto }).config);
      } else {
        throw new Error("Respuesta inesperada");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // Poblar cantidades a partir de la reserva y el catálogo
  useEffect(() => {
    if (!config) return;
    const m: Record<string, number> = {};
    for (const o of config.offers) m[o.offerId] = 0;
    for (const l of reservation.menuLineItems) {
      m[l.offerId] = l.quantity;
    }
    setQuantities(m);
  }, [config, reservation.menuLineItems, reservation.reservationId]);

  // Contadores: recarga al cambiar el snapshot del servidor; si no, ajusta raciones
  useEffect(() => {
    if (!config) return;
    if (lastResIdForSnap.current !== reservation.reservationId) {
      lastResIdForSnap.current = reservation.reservationId;
      menuItemsSnapRef.current = "";
    }
    const snap = JSON.stringify(
      reservation.menuLineItems.map((l) => ({
        o: l.offerId,
        q: l.quantity,
        m: l.mainCoursesSnapshot,
      })),
    );
    const fromServer =
      menuItemsSnapRef.current !== snap || menuItemsSnapRef.current === "";
    if (fromServer) menuItemsSnapRef.current = snap;

    setPrincipalCounts((prev) => {
      const out: Record<string, number[]> = { ...prev };
      for (const o of config.offers) {
        const options = mainCoursesForClientDisplay(o.mainCourses);
        if (options.length === 0) continue;
        const offerId = o.offerId;
        const fromLine = reservation.menuLineItems.find(
          (l) => l.offerId === offerId,
        );
        // En la carga desde servidor, `quantities` todavía puede estar a 0
        // (el `useEffect` anterior no ha corrido): usamos la cantidad del
        // snapshot para inicializar los contadores de principales.
        const q = fromServer
          ? (fromLine?.quantity ?? 0)
          : (quantities[offerId] ?? 0);
        if (q === 0) {
          delete out[offerId];
          continue;
        }
        if (fromServer) {
          const raw = (fromLine?.mainCoursesSnapshot ?? [])
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          let c: number[] = fromLine
            ? mainPicksToCountsByOptions(options, raw)
            : new Array(options.length).fill(0);
          if (c.reduce((a, b) => a + b, 0) > q) {
            c = new Array(options.length).fill(0);
          }
          out[offerId] = c;
          continue;
        }
        let c = out[offerId];
        if (!c || c.length !== options.length) {
          out[offerId] = new Array(options.length).fill(0);
          c = out[offerId]!;
        }
        if (c.reduce((a, b) => a + b, 0) > q) {
          out[offerId] = new Array(options.length).fill(0);
        }
      }
      return out;
    });
  }, [config, quantities, reservation.menuLineItems, reservation.reservationId]);

  const totalUnits = useMemo(
    () => Object.values(quantities).reduce((s, n) => s + n, 0),
    [quantities],
  );

  const nameForOffer = (offerId: string) => {
    const o = config?.offers.find((x) => x.offerId === offerId);
    if (o) return o.name;
    const fromRes = reservation.menuLineItems.find(
      (l) => l.offerId === offerId,
    );
    return fromRes?.nameSnapshot ?? offerId;
  };

  const canSave = useMemo(() => {
    if (totalUnits !== reservation.partySize) return false;
    if (!config) return false;
    for (const o of config.offers) {
      const options = mainCoursesForClientDisplay(o.mainCourses);
      if (options.length === 0) continue;
      const q = quantities[o.offerId] ?? 0;
      if (q <= 0) continue;
      const c = principalCounts[o.offerId] ?? [];
      if (c.length !== options.length) return false;
      const sum = c.reduce((a, b) => a + b, 0);
      if (sum !== q) return false;
    }
    return true;
  }, [config, totalUnits, reservation.partySize, quantities, principalCounts]);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const menuLines = Object.entries(quantities)
        .map(([offerId, quantity]) => {
          if (quantity <= 0) return null;
          const o = config.offers.find((x) => x.offerId === offerId);
          const options = o ? mainCoursesForClientDisplay(o.mainCourses) : [];
          if (options.length > 0) {
            const c = principalCounts[offerId] ?? [];
            const arr =
              c.length === options.length
                ? c
                : new Array(options.length).fill(0);
            const mainPicks = expandMainCourseCountsToPicks(options, arr);
            if (mainPicks.length !== quantity) {
              throw new Error(
                "El reparto de principales no coincide con la cantidad de menús. Ajusta las cantidades o recarga la página.",
              );
            }
            return {
              offerId,
              quantity,
              mainPicks,
            };
          }
          return { offerId, quantity };
        })
        .filter((l): l is NonNullable<typeof l> => l != null);
      const res = await adminUpdateReservationMenus(
        reservation.reservationId,
        {
          expectedVersion: reservation.version,
          menuLines,
        },
      );
      onUpdated(res.reservation);
    } catch (e) {
      const api = e as AdminApiError;
      setError(api?.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-muted">Cargando catálogo de menús…</p>
    );
  }
  if (error && !config) {
    return (
      <p className="text-sm text-rose-700">{error}</p>
    );
  }
  if (!config) return null;

  return (
    <section
      className={
        embed
          ? "p-4 pt-0"
          : "rounded-2xl border border-border bg-white p-5 shadow-sm"
      }
    >
      <h2
        className={
          embed
            ? "text-xs font-semibold uppercase tracking-wide text-muted"
            : "text-sm font-semibold sm:text-base"
        }
      >
        Reparto de menús (equipo)
      </h2>
      <p
        className={
          embed
            ? "mt-0.5 text-sm text-muted"
            : "mt-1 text-sm text-muted"
        }
      >
        La suma de unidades debe ser {reservation.partySize} (comensales). El
        cliente no puede cambiar esto desde su pantalla.
      </p>
      {error ? (
        <p className="mt-2 text-sm text-rose-700">{error}</p>
      ) : null}
      <ul className="mt-3 space-y-2">
        {Object.keys(quantities).map((offerId) => {
          const q = quantities[offerId] ?? 0;
          const o = config.offers.find((x) => x.offerId === offerId);
          const sub = o ? q * o.priceCents : 0;
          return (
            <li
              key={offerId}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border px-3 py-2"
            >
              <div className="min-w-0 rounded-lg border border-rose-200/80 bg-rose-50/80 px-2.5 py-1.5">
                <span className="text-sm font-semibold text-rose-900">
                  {nameForOffer(offerId)}
                </span>
                {o && o.active === false ? (
                  <span className="ml-2 text-xs text-amber-800">
                    (inactivo en carta)
                  </span>
                ) : null}
                {o ? (
                  <span className="ml-1 text-xs font-medium text-rose-800/80">
                    {formatAmountEuros(o.priceCents)} / u.
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {canEdit ? (
                  <input
                    type="number"
                    min={0}
                    className="w-16 rounded border border-border px-2 py-1 text-sm"
                    value={q}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n) || n < 0) return;
                      setQuantities((prev) => ({
                        ...prev,
                        [offerId]: n,
                      }));
                    }}
                  />
                ) : (
                  <span className="text-sm font-medium">{q}</span>
                )}
                {o && q > 0 ? (
                  <span className="text-xs text-muted">
                    {formatAmountEuros(sub)}
                  </span>
                ) : null}
              </div>
              {o &&
              mainCoursesForClientDisplay(o.mainCourses).length > 0 &&
              (quantities[offerId] ?? 0) > 0
                ? (() => {
                    const mainOptions = mainCoursesForClientDisplay(
                      o.mainCourses,
                    );
                    const qn = quantities[offerId] ?? 0;
                    const row = principalCounts[offerId] ?? [];
                    const r =
                      row.length === mainOptions.length
                        ? row
                        : new Array(mainOptions.length).fill(0);
                    const totalPlatos = r.reduce((a, b) => a + b, 0);
                    return (
                      <div className="mt-2 w-full basis-full space-y-2 border-t border-border/80 pt-2">
                        <p className="text-xs text-muted">
                          Raciones por plato (deben sumar {qn}):
                        </p>
                        {mainOptions.map((dish, idx) => {
                          const c = r[idx] ?? 0;
                          return (
                            <div
                              key={`${offerId}-main-${idx}`}
                              className="flex flex-wrap items-center justify-between gap-2"
                            >
                              <span className="min-w-0 flex-1 text-sm">
                                {dish}
                              </span>
                              {canEdit ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    className="h-8 w-8 rounded border border-border text-sm"
                                    onClick={() => {
                                      if (c <= 0) return;
                                      setPrincipalCounts((m) => {
                                        const cur = [
                                          ...(m[offerId] ??
                                            new Array(
                                              mainOptions.length,
                                            ).fill(0)),
                                        ];
                                        if (cur.length !== mainOptions.length)
                                          return m;
                                        cur[idx] = Math.max(
                                          0,
                                          (cur[idx] ?? 0) - 1,
                                        );
                                        return { ...m, [offerId]: cur };
                                      });
                                    }}
                                    disabled={!canEdit || c <= 0}
                                    aria-label="Menos"
                                  >
                                    −
                                  </button>
                                  <span className="w-6 text-center text-sm">
                                    {c}
                                  </span>
                                  <button
                                    type="button"
                                    className="h-8 w-8 rounded border border-border text-sm"
                                    onClick={() => {
                                      if (totalPlatos >= qn) return;
                                      setPrincipalCounts((m) => {
                                        const cur = [
                                          ...(m[offerId] ??
                                            new Array(
                                              mainOptions.length,
                                            ).fill(0)),
                                        ];
                                        if (cur.length !== mainOptions.length)
                                          return m;
                                        const s = cur.reduce(
                                          (a, b) => a + b,
                                          0,
                                        );
                                        if (s >= qn) return m;
                                        cur[idx] = (cur[idx] ?? 0) + 1;
                                        return { ...m, [offerId]: cur };
                                      });
                                    }}
                                    disabled={!canEdit || totalPlatos >= qn}
                                    aria-label="Más"
                                  >
                                    +
                                  </button>
                                </div>
                              ) : (
                                <span className="text-sm text-muted">×{c}</span>
                              )}
                            </div>
                          );
                        })}
                        {canEdit ? (
                          <p
                            className={`text-xs font-medium ${
                              totalPlatos === qn
                                ? "text-emerald-800"
                                : "text-amber-800"
                            }`}
                          >
                            Total: {totalPlatos} / {qn}
                          </p>
                        ) : null}
                      </div>
                    );
                  })()
                : null}
            </li>
          );
        })}
      </ul>
      <p
        className={`mt-2 text-sm ${
          totalUnits === reservation.partySize
            ? "text-emerald-800"
            : "text-rose-700"
        }`}
      >
        Total unidades: {totalUnits} / {reservation.partySize} comensales
      </p>
      {canEdit ? (
        <button
          type="button"
          onClick={save}
          disabled={saving || !canSave}
          className="mt-3 rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar reparto de menús"}
        </button>
      ) : null}
    </section>
  );
}
