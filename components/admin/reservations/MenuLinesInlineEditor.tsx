"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatAmountEuros } from "@/components/reservations/formatters";
import {
  expandMainCourseCountsToPicks,
  mainCoursesForClientDisplay,
  mainPicksToCountsByOptions,
} from "@/lib/reservation-menus-helpers";
import type {
  AdminMenusConfigDto,
  ReservationMenuLineItemDto,
} from "@/lib/serialization/reservations";

export type MenuLinePayload = {
  offerId: string;
  quantity: number;
  mainPicks?: string[];
};

export type MenuLinesEditorState =
  | { kind: "loading" }
  | { kind: "load_error"; message: string }
  | { kind: "ready"; menuLines: MenuLinePayload[]; isValid: boolean; problem: string | null };

type Props = {
  /** Líneas guardadas en BD (snapshot) — se usan para sembrar el reparto inicial. */
  initialMenuLineItems: ReservationMenuLineItemDto[];
  /** Comensales objetivo: la suma de cantidades debe coincidir con este valor. */
  targetPartySize: number;
  /** Cambia con cada edición del usuario o cambio de `targetPartySize`. */
  onStateChange: (state: MenuLinesEditorState) => void;
  disabled?: boolean;
};

/**
 * Editor de reparto de menús **controlado** (semi-controlado): mantiene
 * estado local de cantidades y raciones, pero notifica al padre el
 * payload listo para enviar a la API y la validez. Diseñado para
 * incrustarse dentro del modal "Editar datos de la reserva", donde
 * tanto `partySize` como `menuLines` se guardan en la misma petición.
 *
 * No incluye su propio botón de guardar.
 */
export function MenuLinesInlineEditor({
  initialMenuLineItems,
  targetPartySize,
  onStateChange,
  disabled = false,
}: Props) {
  const [config, setConfig] = useState<AdminMenusConfigDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [principalCounts, setPrincipalCounts] = useState<
    Record<string, number[]>
  >({});
  const seededRef = useRef(false);
  // El padre puede pasar un `onStateChange` recreado en cada render; el ref
  // evita meterlo en deps del efecto y entrar en un bucle.
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
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
        if (cancelled) return;
        if (
          typeof body === "object" &&
          body !== null &&
          "config" in body &&
          typeof (body as { config: AdminMenusConfigDto }).config === "object"
        ) {
          setConfig((body as { config: AdminMenusConfigDto }).config);
        } else {
          throw new Error("Respuesta inesperada");
        }
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sembrado inicial: cuando llega el catálogo, partimos de las líneas
  // guardadas (cantidades + raciones tal cual están en BD).
  useEffect(() => {
    if (!config) return;
    if (seededRef.current) return;
    seededRef.current = true;
    const q: Record<string, number> = {};
    for (const o of config.offers) q[o.offerId] = 0;
    for (const l of initialMenuLineItems) q[l.offerId] = l.quantity;
    setQuantities(q);

    const pc: Record<string, number[]> = {};
    for (const o of config.offers) {
      const options = mainCoursesForClientDisplay(o.mainCourses);
      if (options.length === 0) continue;
      const fromLine = initialMenuLineItems.find(
        (l) => l.offerId === o.offerId,
      );
      if (!fromLine || fromLine.quantity === 0) continue;
      const raw = (fromLine.mainCoursesSnapshot ?? [])
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      pc[o.offerId] = mainPicksToCountsByOptions(options, raw);
    }
    setPrincipalCounts(pc);
  }, [config, initialMenuLineItems]);

  // Si la cantidad de un menú baja por debajo del total de raciones ya
  // repartidas, **truncamos** las raciones desde el final (no reseteamos
  // a cero): preserva el trabajo del usuario tanto como sea posible.
  useEffect(() => {
    if (!config) return;
    setPrincipalCounts((prev) => {
      let changed = false;
      const out: Record<string, number[]> = { ...prev };
      for (const o of config.offers) {
        const options = mainCoursesForClientDisplay(o.mainCourses);
        if (options.length === 0) continue;
        const offerId = o.offerId;
        const q = quantities[offerId] ?? 0;
        const cur = out[offerId];
        if (q === 0) {
          if (cur) {
            delete out[offerId];
            changed = true;
          }
          continue;
        }
        if (!cur || cur.length !== options.length) {
          out[offerId] = new Array(options.length).fill(0);
          changed = true;
          continue;
        }
        let total = cur.reduce((a, b) => a + b, 0);
        if (total <= q) continue;
        const next = [...cur];
        for (let i = next.length - 1; i >= 0 && total > q; i -= 1) {
          const take = Math.min(next[i] ?? 0, total - q);
          next[i] = (next[i] ?? 0) - take;
          total -= take;
        }
        out[offerId] = next;
        changed = true;
      }
      return changed ? out : prev;
    });
  }, [config, quantities]);

  const totalUnits = useMemo(
    () => Object.values(quantities).reduce((s, n) => s + n, 0),
    [quantities],
  );

  const nameForOffer = useCallback(
    (offerId: string): string => {
      const o = config?.offers.find((x) => x.offerId === offerId);
      if (o) return o.name;
      const fromLine = initialMenuLineItems.find((l) => l.offerId === offerId);
      return fromLine?.nameSnapshot ?? offerId;
    },
    [config, initialMenuLineItems],
  );

  // Construye el payload + valida; notifica al padre en cada cambio.
  useEffect(() => {
    if (loading) {
      onStateChangeRef.current({ kind: "loading" });
      return;
    }
    if (loadError) {
      onStateChangeRef.current({ kind: "load_error", message: loadError });
      return;
    }
    if (!config) return;

    const lines: MenuLinePayload[] = [];
    let problem: string | null = null;

    if (totalUnits !== targetPartySize) {
      problem = `La suma de menús (${totalUnits}) debe coincidir con los comensales (${targetPartySize}).`;
    }

    for (const [offerId, quantity] of Object.entries(quantities)) {
      if (quantity <= 0) continue;
      const o = config.offers.find((x) => x.offerId === offerId);
      const options = o ? mainCoursesForClientDisplay(o.mainCourses) : [];
      if (options.length > 0) {
        const c = principalCounts[offerId] ?? [];
        const arr =
          c.length === options.length
            ? c
            : new Array(options.length).fill(0);
        const sum = arr.reduce((a, b) => a + b, 0);
        if (sum !== quantity) {
          if (!problem) {
            problem = `En “${nameForOffer(offerId)}” las raciones (${sum}) deben sumar ${quantity}.`;
          }
        }
        const mainPicks = expandMainCourseCountsToPicks(options, arr);
        lines.push({ offerId, quantity, mainPicks });
      } else {
        lines.push({ offerId, quantity });
      }
    }

    onStateChangeRef.current({
      kind: "ready",
      menuLines: lines,
      isValid: problem == null,
      problem,
    });
  }, [
    loading,
    loadError,
    config,
    quantities,
    principalCounts,
    targetPartySize,
    totalUnits,
    nameForOffer,
  ]);

  if (loading) {
    return <p className="text-xs text-muted">Cargando catálogo de menús…</p>;
  }
  if (loadError) {
    return <p className="text-xs text-rose-700">{loadError}</p>;
  }
  if (!config) return null;

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {Object.keys(quantities).map((offerId) => {
          const q = quantities[offerId] ?? 0;
          const o = config.offers.find((x) => x.offerId === offerId);
          const sub = o ? q * o.priceCents : 0;
          const mainOptions = o
            ? mainCoursesForClientDisplay(o.mainCourses)
            : [];
          const showPicks = mainOptions.length > 0 && q > 0;
          const row = principalCounts[offerId] ?? [];
          const r =
            row.length === mainOptions.length
              ? row
              : new Array(mainOptions.length).fill(0);
          const totalPlatos = r.reduce((a, b) => a + b, 0);
          return (
            <li
              key={offerId}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border px-3 py-2"
            >
              <div className="min-w-0 rounded-lg border border-rose-200/80 bg-rose-50/80 px-2.5 py-1.5">
                <span className="text-xs font-semibold text-rose-900">
                  {nameForOffer(offerId)}
                </span>
                {o && o.active === false ? (
                  <span className="ml-2 text-[10px] text-amber-800">
                    (inactivo)
                  </span>
                ) : null}
                {o ? (
                  <span className="ml-1 text-[10px] font-medium text-rose-800/80">
                    {formatAmountEuros(o.priceCents)} / u.
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  className="w-16 rounded border border-border px-2 py-1 text-sm"
                  value={q}
                  disabled={disabled}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n) || n < 0) return;
                    setQuantities((prev) => ({ ...prev, [offerId]: n }));
                  }}
                />
                {o && q > 0 ? (
                  <span className="text-[11px] text-muted">
                    {formatAmountEuros(sub)}
                  </span>
                ) : null}
              </div>
              {showPicks ? (
                <div className="mt-2 w-full basis-full space-y-1.5 border-t border-border/80 pt-2">
                  <p className="text-[11px] text-muted">
                    Raciones por plato (deben sumar {q}):
                  </p>
                  {mainOptions.map((dish, idx) => {
                    const c = r[idx] ?? 0;
                    return (
                      <div
                        key={`${offerId}-main-${idx}`}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span className="min-w-0 flex-1 text-sm">{dish}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="h-7 w-7 rounded border border-border text-sm"
                            disabled={disabled || c <= 0}
                            onClick={() => {
                              if (c <= 0) return;
                              setPrincipalCounts((m) => {
                                const cur = [
                                  ...(m[offerId] ??
                                    new Array(mainOptions.length).fill(0)),
                                ];
                                if (cur.length !== mainOptions.length) return m;
                                cur[idx] = Math.max(0, (cur[idx] ?? 0) - 1);
                                return { ...m, [offerId]: cur };
                              });
                            }}
                            aria-label="Menos"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm">{c}</span>
                          <button
                            type="button"
                            className="h-7 w-7 rounded border border-border text-sm"
                            disabled={disabled || totalPlatos >= q}
                            onClick={() => {
                              if (totalPlatos >= q) return;
                              setPrincipalCounts((m) => {
                                const cur = [
                                  ...(m[offerId] ??
                                    new Array(mainOptions.length).fill(0)),
                                ];
                                if (cur.length !== mainOptions.length) return m;
                                const s = cur.reduce((a, b) => a + b, 0);
                                if (s >= q) return m;
                                cur[idx] = (cur[idx] ?? 0) + 1;
                                return { ...m, [offerId]: cur };
                              });
                            }}
                            aria-label="Más"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <p
                    className={`text-[11px] font-medium ${
                      totalPlatos === q ? "text-emerald-800" : "text-amber-800"
                    }`}
                  >
                    Total: {totalPlatos} / {q}
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p
        className={`text-xs ${
          totalUnits === targetPartySize
            ? "text-emerald-800"
            : "text-rose-700"
        }`}
      >
        Total unidades: {totalUnits} / {targetPartySize} comensales
      </p>
    </div>
  );
}
