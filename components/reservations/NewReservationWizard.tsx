"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { maxIsoDateStr, minIsoDateStr } from "@/lib/datetime";
import {
  expandMainCourseCountsToPicks,
  mainCoursesForClientDisplay,
} from "@/lib/reservation-menus-helpers";
import { formatAmountEuros } from "@/components/reservations/formatters";
import {
  createReservation,
  fetchSlotsForDate,
  type ReservationsApiError,
} from "@/lib/reservations/client";
import type {
  PublicReservationMenuOfferDto,
  ReservationConfigDto,
  SlotDayDto,
} from "@/lib/serialization/reservations";

/**
 * Datos pre-cargados del socio logueado. Cuando el wizard corre en modo
 * guest, todos vienen `null` / vacíos y se piden en el último paso.
 */
export interface WizardViewer {
  isLoggedIn: boolean;
  name: string;
  email: string;
  phone: string;
}

interface Props {
  config: ReservationConfigDto;
  viewer: WizardViewer;
  /** Si se pasa, se llama al terminar en vez de navegar. */
  onCreated?: (reservationId: string) => void;
  /** Texto opcional para el botón de cancelar. */
  onCancel?: () => void;
}

type Step = "date" | "time" | "party" | "contact" | "notes" | "review";

const STEPS_ORDER: Step[] = [
  "date",
  "time",
  "party",
  "contact",
  "notes",
  "review",
];

export function NewReservationWizard({
  config,
  viewer,
  onCreated,
  onCancel,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("date");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [partySize, setPartySize] = useState<number>(2);
  const [notes, setNotes] = useState<string>("");
  const [menuPreview, setMenuPreview] =
    useState<PublicReservationMenuOfferDto | null>(null);
  const [menuQuantities, setMenuQuantities] = useState<Record<string, number>>(
    () => ({}),
  );
  /** Unidades de cada plato (índice = `mainCoursesForClientDisplay(offer)`), suma = raciones de ese menú. */
  const [menuPrincipalCounts, setMenuPrincipalCounts] = useState<
    Record<string, number[]>
  >(() => ({}));
  const prevPartySizeRef = useRef<number | null>(null);
  const [contact, setContact] = useState({
    name: viewer.name,
    email: viewer.email,
    phone: viewer.phone,
  });
  const [slotData, setSlotData] = useState<SlotDayDto | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const minDate = useMemo(() => {
    const t = todayIso();
    const from = config.bookableFromDate?.trim() ?? null;
    return from ? maxIsoDateStr(t, from) : t;
  }, [config.bookableFromDate]);

  const maxDate = useMemo(() => {
    const roll = todayIsoPlusDays(config.advanceMaxDays);
    const until = config.bookableUntilDate?.trim() ?? null;
    return until ? minIsoDateStr(roll, until) : roll;
  }, [config.advanceMaxDays, config.bookableUntilDate]);

  const bookableRangeInvalid = useMemo(
    () => minDate > maxDate,
    [minDate, maxDate],
  );
  const prepaymentNeeded =
    config.prepayment.enabled && partySize >= config.prepayment.minPartySize;
  const prepaymentCents = prepaymentNeeded
    ? config.prepayment.amountPerPersonCents * partySize
    : 0;

  /** Puede faltar en respuestas antiguas: sin esto, `.length` en notas provoca error de hidración. */
  const menuOffers = useMemo(
    () => (Array.isArray(config.menuOffers) ? config.menuOffers : []),
    [config.menuOffers],
  );

  // Inicializar claves cuando carga el catálogo o cambia.
  useEffect(() => {
    setMenuQuantities((prev) => {
      const next = { ...prev };
      for (const o of menuOffers) {
        if (next[o.offerId] === undefined) next[o.offerId] = 0;
      }
      return next;
    });
  }, [menuOffers]);

  // Al cambiar comensales, poner a cero (nuevo reparto).
  useEffect(() => {
    if (prevPartySizeRef.current === null) {
      prevPartySizeRef.current = partySize;
      return;
    }
    // Misma cifra: no reset (p. ej. el efecto vuelve a correr al cargar el catálogo).
    if (prevPartySizeRef.current === partySize) return;
    prevPartySizeRef.current = partySize;
    setMenuQuantities(() => {
      const next: Record<string, number> = {};
      for (const o of menuOffers) {
        next[o.offerId] = 0;
      }
      return next;
    });
  }, [partySize, menuOffers]);

  // Sincronizar contadores con raciones: reiniciar si faltan índices o se supera el tope
  useEffect(() => {
    setMenuPrincipalCounts((prev) => {
      const next: Record<string, number[]> = { ...prev };
      for (const o of menuOffers) {
        const mainOptions = mainCoursesForClientDisplay(o.mainCourses);
        if (mainOptions.length === 0) {
          delete next[o.offerId];
          continue;
        }
        const q = menuQuantities[o.offerId] ?? 0;
        if (q === 0) {
          delete next[o.offerId];
          continue;
        }
        const cur = next[o.offerId];
        if (!cur || cur.length !== mainOptions.length) {
          next[o.offerId] = new Array(mainOptions.length).fill(0);
          continue;
        }
        const sum = cur.reduce((a, b) => a + b, 0);
        if (sum > q) {
          next[o.offerId] = new Array(mainOptions.length).fill(0);
        }
      }
      return next;
    });
  }, [menuOffers, menuQuantities]);

  const menuTotalUnits = useMemo(() => {
    return menuOffers.reduce(
      (s, o) => s + (menuQuantities[o.offerId] ?? 0),
      0,
    );
  }, [menuOffers, menuQuantities]);

  const menuSubtotalCents = useMemo(() => {
    return menuOffers.reduce(
      (s, o) =>
        s + (menuQuantities[o.offerId] ?? 0) * o.priceCents,
      0,
    );
  }, [menuOffers, menuQuantities]);

  // Cargar slots cuando se elige fecha.
  useEffect(() => {
    let active = true;
    if (!date) return;
    setLoadingSlots(true);
    setSlotError(null);
    fetchSlotsForDate(date)
      .then((data) => {
        if (!active) return;
        setSlotData(data);
      })
      .catch((err: ReservationsApiError) => {
        if (!active) return;
        setSlotError(err.message);
      })
      .finally(() => {
        if (!active) return;
        setLoadingSlots(false);
      });
    return () => {
      active = false;
    };
  }, [date]);

  const canGoNext = useMemo(() => {
    switch (step) {
      case "date":
        return !!date && !bookableRangeInvalid;
      case "time":
        return !!time;
      case "party":
        return (
          partySize >= config.minPartySize && partySize <= config.maxPartySize
        );
      case "contact":
        return (
          contact.name.trim().length > 0 &&
          /^\S+@\S+\.\S+$/.test(contact.email) &&
          contact.phone.trim().length >= 6
        );
      case "notes":
        if (menuOffers.length === 0) return true;
        if (menuTotalUnits !== partySize) return false;
        for (const o of menuOffers) {
          const mainOptions = mainCoursesForClientDisplay(o.mainCourses);
          const q = menuQuantities[o.offerId] ?? 0;
          if (mainOptions.length > 0 && q > 0) {
            const counts = menuPrincipalCounts[o.offerId] ?? [];
            if (counts.length !== mainOptions.length) return false;
            const sum = counts.reduce((a, b) => a + b, 0);
            if (sum !== q) return false;
          }
        }
        return true;
      case "review":
        return !submitting;
      default:
        return false;
    }
  }, [
    step,
    date,
    time,
    partySize,
    contact,
    submitting,
    config,
    bookableRangeInvalid,
    menuOffers,
    menuTotalUnits,
    menuPrincipalCounts,
    menuQuantities,
  ]);

  const goNext = useCallback(() => {
    const idx = STEPS_ORDER.indexOf(step);
    if (idx >= 0 && idx < STEPS_ORDER.length - 1) {
      const next = STEPS_ORDER[idx + 1];
      // Si el socio está logueado y no necesita editar contacto, saltamos.
      if (next === "contact" && viewer.isLoggedIn) {
        const hasFullContact =
          contact.name.trim() &&
          contact.email.trim() &&
          contact.phone.trim().length >= 6;
        if (hasFullContact) {
          setStep("notes");
          return;
        }
      }
      setStep(next);
    }
  }, [step, viewer.isLoggedIn, contact]);

  const goBack = useCallback(() => {
    const idx = STEPS_ORDER.indexOf(step);
    if (idx > 0) {
      const prev = STEPS_ORDER[idx - 1];
      if (prev === "contact" && viewer.isLoggedIn) {
        setStep("party");
        return;
      }
      setStep(prev);
    }
  }, [step, viewer.isLoggedIn]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        reservationDate: date,
        reservationTime: time,
        partySize,
        menuLines: menuOffers.map((o) => {
          const quantity = menuQuantities[o.offerId] ?? 0;
          const withMains: {
            offerId: string;
            quantity: number;
            mainPicks?: string[];
          } = { offerId: o.offerId, quantity };
          if (quantity > 0) {
            const opts = mainCoursesForClientDisplay(o.mainCourses);
            if (opts.length > 0) {
              const counts = menuPrincipalCounts[o.offerId] ?? [];
              withMains.mainPicks = expandMainCourseCountsToPicks(
                opts,
                counts.length === opts.length
                  ? counts
                  : new Array(opts.length).fill(0),
              );
            }
          }
          return withMains;
        }),
        notes: notes.trim() || undefined,
        contact: viewer.isLoggedIn
          ? undefined
          : {
              name: contact.name.trim(),
              email: contact.email.trim(),
              phone: contact.phone.trim(),
            },
      };
      const res = await createReservation(payload);
      if (onCreated) {
        onCreated(res.reservation.reservationId);
      } else {
        router.push(`/reservas/${res.reservation.reservationId}`);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo crear la reserva";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    date,
    time,
    partySize,
    notes,
    contact,
    viewer.isLoggedIn,
    onCreated,
    router,
    menuOffers,
    menuQuantities,
    menuPrincipalCounts,
  ]);

  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <StepIntro step={step} />

      {step === "date" ? (
        <div className="space-y-3">
          <label htmlFor="res-date" className="text-sm font-medium">
            Fecha
          </label>
          {bookableRangeInvalid ? (
            <p
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
              role="alert"
            >
              Ahora mismo no se aceptan reservas: revisa con el local el rango
              de fechas configurado.
            </p>
          ) : null}
          <input
            id="res-date"
            type="date"
            className="w-full rounded-xl border border-border px-3 py-2"
            min={minDate}
            max={maxDate}
            value={date}
            disabled={bookableRangeInvalid}
            onChange={(e) => {
              setDate(e.target.value);
              setTime("");
            }}
          />
          {date ? (
            <p
              className="rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-sm font-medium text-brand"
              aria-live="polite"
            >
              {capitalize(formatDateReadable(date))}
            </p>
          ) : null}
          <p className="text-xs text-muted">
            Puedes reservar hasta con {config.advanceMaxDays} días de
            antelación.
          </p>
        </div>
      ) : null}

      {step === "time" ? (
        <div className="space-y-3">
          {loadingSlots ? (
            <p className="text-sm text-muted">Buscando horas disponibles…</p>
          ) : slotError ? (
            <p className="text-sm text-rose-700">{slotError}</p>
          ) : slotData?.outOfWindow ? (
            <p className="text-sm text-rose-700">
              Esa fecha está fuera del rango de reservas. Cambia de día.
            </p>
          ) : slotData?.closedDay ? (
            <p className="text-sm text-rose-700">
              Ese día no aceptamos reservas. Elige otro.
            </p>
          ) : slotData && slotData.slots.length === 0 ? (
            <p className="text-sm text-rose-700">
              No quedan horas disponibles ese día.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {slotData?.slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTime(s)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                    time === s
                      ? "border-brand bg-brand text-white"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {step === "party" ? (
        <div className="space-y-3">
          <label htmlFor="res-party" className="text-sm font-medium">
            Número de comensales
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="h-10 w-10 rounded-full border border-border text-lg font-bold"
              onClick={() =>
                setPartySize((v) => Math.max(config.minPartySize, v - 1))
              }
              aria-label="Quitar una persona"
            >
              −
            </button>
            <input
              id="res-party"
              type="number"
              inputMode="numeric"
              className="w-20 rounded-xl border border-border px-3 py-2 text-center text-lg font-semibold"
              min={config.minPartySize}
              max={config.maxPartySize}
              value={partySize}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                setPartySize(
                  Math.max(config.minPartySize, Math.min(config.maxPartySize, n)),
                );
              }}
            />
            <button
              type="button"
              className="h-10 w-10 rounded-full border border-border text-lg font-bold"
              onClick={() =>
                setPartySize((v) => Math.min(config.maxPartySize, v + 1))
              }
              aria-label="Añadir una persona"
            >
              +
            </button>
          </div>
          {prepaymentNeeded ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              A partir de {config.prepayment.minPartySize} personas pedimos
              una señal de{" "}
              {formatAmountEuros(config.prepayment.amountPerPersonCents)} por
              comensal. Para tu reserva serían{" "}
              <strong>{formatAmountEuros(prepaymentCents)}</strong> por
              transferencia. Te daremos los detalles al terminar.
            </p>
          ) : null}
        </div>
      ) : null}

      {step === "contact" ? (
        <div className="space-y-3">
          <label htmlFor="res-name" className="text-sm font-medium">
            Nombre
          </label>
          <input
            id="res-name"
            type="text"
            className="w-full rounded-xl border border-border px-3 py-2"
            value={contact.name}
            onChange={(e) =>
              setContact((c) => ({ ...c, name: e.target.value }))
            }
          />
          <label htmlFor="res-email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="res-email"
            type="email"
            inputMode="email"
            className="w-full rounded-xl border border-border px-3 py-2"
            value={contact.email}
            onChange={(e) =>
              setContact((c) => ({ ...c, email: e.target.value }))
            }
          />
          <label htmlFor="res-phone" className="text-sm font-medium">
            Teléfono
          </label>
          <input
            id="res-phone"
            type="tel"
            inputMode="tel"
            className="w-full rounded-xl border border-border px-3 py-2"
            value={contact.phone}
            onChange={(e) =>
              setContact((c) => ({ ...c, phone: e.target.value }))
            }
          />
          <p className="text-xs text-muted">
            Guardaremos tus datos para poder contactarte sobre esta reserva.
          </p>
        </div>
      ) : null}

      {step === "notes" ? (
        <div className="space-y-4">
          {menuOffers.length === 0 ? (
            <p
              className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              role="status"
            >
              Aún no hay menús en carta, así que no hace falta asignar platos. El
              local puede activarlos luego en configuración. Continúa con las
              notas abajo.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">
                Debes asignar exactamente <strong>{partySize}</strong> menús en
                total (tantas unidades como comensales). Toca &quot;Ver
                carta&quot; para la imagen.
              </p>
              <ul className="space-y-3">
                {menuOffers.map((o) => {
                  const q = menuQuantities[o.offerId] ?? 0;
                  const sub = q * o.priceCents;
                  const mainOptions = mainCoursesForClientDisplay(o.mainCourses);
                  return (
                    <li
                      key={o.offerId}
                      className="rounded-xl border border-border bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{o.name}</p>
                          <p className="text-xs text-muted">
                            {formatAmountEuros(o.priceCents)} / unidad
                          </p>
                          {mainOptions.length > 0 ? (
                            <p className="mt-1 text-xs text-muted">
                              Platos disponibles: {mainOptions.join(" · ")}
                            </p>
                          ) : null}
                        </div>
                        {o.imageUrl ? (
                          <button
                            type="button"
                            onClick={() => setMenuPreview(o)}
                            className="shrink-0 text-xs font-medium text-brand underline"
                          >
                            Ver carta
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="h-8 w-8 rounded-lg border border-border text-sm"
                            onClick={() =>
                              setMenuQuantities((m) => ({
                                ...m,
                                [o.offerId]: Math.max(0, (m[o.offerId] ?? 0) - 1),
                              }))
                            }
                            aria-label={`Menos ${o.name}`}
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-medium">
                            {q}
                          </span>
                          <button
                            type="button"
                            className="h-8 w-8 rounded-lg border border-border text-sm"
                            onClick={() =>
                              setMenuQuantities((m) => {
                                const sum = menuOffers.reduce(
                                  (s, x) => s + (m[x.offerId] ?? 0),
                                  0,
                                );
                                if (sum >= partySize) return m;
                                const cur = m[o.offerId] ?? 0;
                                return { ...m, [o.offerId]: cur + 1 };
                              })
                            }
                            disabled={menuTotalUnits >= partySize}
                            aria-label={`Más ${o.name}`}
                          >
                            +
                          </button>
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          {q > 0
                            ? `${formatAmountEuros(sub)} (×${q})`
                            : "—"}
                        </span>
                      </div>
                      {q > 0 && mainOptions.length > 0
                        ? (() => {
                            const counts = menuPrincipalCounts[o.offerId] ?? [];
                            const row =
                              counts.length === mainOptions.length
                                ? counts
                                : new Array(mainOptions.length).fill(0);
                            const totalPlatos = row.reduce(
                              (a, b) => a + b,
                              0,
                            );
                            return (
                              <div className="mt-3 space-y-3 border-t border-border/80 pt-3">
                                <p className="text-xs font-medium text-foreground">
                                  Raciones por plato (deben sumar {q}):
                                </p>
                                <ul className="space-y-2">
                                  {mainOptions.map((dish, idx) => {
                                    const c = row[idx] ?? 0;
                                    return (
                                      <li
                                        key={dish}
                                        className="flex flex-wrap items-center justify-between gap-2"
                                      >
                                        <span className="min-w-0 flex-1 text-sm">
                                          {dish}
                                        </span>
                                        <div className="flex shrink-0 items-center gap-1.5">
                                          <button
                                            type="button"
                                            className="h-9 w-9 rounded-lg border border-border text-base leading-none"
                                            onClick={() => {
                                              if (c <= 0) return;
                                              setMenuPrincipalCounts(
                                                (m) => {
                                                  const cur = [
                                                    ...(
                                                      m[o.offerId] ??
                                                      new Array(
                                                        mainOptions.length,
                                                      ).fill(0)
                                                    ),
                                                  ];
                                                  if (cur.length !== mainOptions.length)
                                                    return m;
                                                  cur[idx] = Math.max(
                                                    0,
                                                    (cur[idx] ?? 0) - 1,
                                                  );
                                                  return {
                                                    ...m,
                                                    [o.offerId]: cur,
                                                  };
                                                },
                                              );
                                            }}
                                            disabled={c <= 0}
                                            aria-label={`Menos raciones de ${dish}`}
                                          >
                                            −
                                          </button>
                                          <span
                                            className="w-7 text-center text-sm font-semibold tabular-nums"
                                            aria-live="polite"
                                          >
                                            {c}
                                          </span>
                                          <button
                                            type="button"
                                            className="h-9 w-9 rounded-lg border border-border text-base leading-none"
                                            onClick={() => {
                                              if (totalPlatos >= q) return;
                                              setMenuPrincipalCounts(
                                                (m) => {
                                                  const cur = [
                                                    ...(
                                                      m[o.offerId] ??
                                                      new Array(
                                                        mainOptions.length,
                                                      ).fill(0)
                                                    ),
                                                  ];
                                                  if (cur.length !== mainOptions.length)
                                                    return m;
                                                  const s = cur.reduce(
                                                    (a, b) => a + b,
                                                    0,
                                                  );
                                                  if (s >= q) return m;
                                                  cur[idx] =
                                                    (cur[idx] ?? 0) + 1;
                                                  return {
                                                    ...m,
                                                    [o.offerId]: cur,
                                                  };
                                                },
                                              );
                                            }}
                                            disabled={totalPlatos >= q}
                                            aria-label={`Más raciones de ${dish}`}
                                          >
                                            +
                                          </button>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                                <p
                                  className={`text-sm font-medium ${
                                    totalPlatos === q
                                      ? "text-emerald-800"
                                      : "text-amber-800"
                                  }`}
                                >
                                  Total platos: {totalPlatos} / {q}
                                  {totalPlatos !== q
                                    ? " — ajusta hasta completar el menú."
                                    : " ✓"}
                                </p>
                              </div>
                            );
                          })()
                        : null}
                    </li>
                  );
                })}
              </ul>
              <p
                className={`text-sm font-medium ${
                  menuTotalUnits === partySize
                    ? "text-emerald-800"
                    : "text-rose-700"
                }`}
                aria-live="polite"
              >
                Reparto: {menuTotalUnits} / {partySize} comensales
                {menuTotalUnits !== partySize
                  ? " — ajusta las cantidades."
                  : " ✓"}
              </p>
              {menuSubtotalCents > 0 ? (
                <p className="text-sm text-muted">
                  Referencia menús:{" "}
                  <span className="font-semibold text-foreground">
                    {formatAmountEuros(menuSubtotalCents)}
                  </span>{" "}
                  (informativo)
                </p>
              ) : null}
            </>
          )}

          <div className="space-y-2">
            <label htmlFor="res-notes" className="text-sm font-medium">
              ¿Algo que debamos saber? (opcional)
            </label>
            <textarea
              id="res-notes"
              rows={3}
              className="w-full rounded-xl border border-border px-3 py-2"
              placeholder="Cumpleaños, alergias, decoración..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
            />
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="space-y-3">
          <ReviewRow label="Fecha" value={formatDateReadable(date)} />
          <ReviewRow label="Hora" value={`${time} h`} />
          <ReviewRow
            label="Comensales"
            value={`${partySize} ${partySize === 1 ? "persona" : "personas"}`}
          />
          <div className="flex flex-col gap-1 rounded-xl border border-border p-3">
            <span className="text-xs uppercase tracking-wide text-muted">
              Menús
            </span>
            {menuOffers
              .map((o) => ({
                o,
                q: menuQuantities[o.offerId] ?? 0,
              }))
              .filter(({ q }) => q > 0)
              .map(({ o, q }) => {
                const opts = mainCoursesForClientDisplay(o.mainCourses);
                const row = menuPrincipalCounts[o.offerId] ?? [];
                const labelMains =
                  opts.length > 0 && row.length === opts.length
                    ? opts
                        .map(
                          (n, i) =>
                            (row[i] ?? 0) > 0
                              ? `${n} × ${row[i]}`
                              : null,
                        )
                        .filter(Boolean)
                        .join(" · ")
                    : "";
                return (
                  <div key={o.offerId} className="text-sm">
                    <p className="font-medium">
                      {o.name} × {q} · {formatAmountEuros(q * o.priceCents)}
                    </p>
                    {labelMains ? (
                      <p className="text-muted">Principales: {labelMains}</p>
                    ) : null}
                  </div>
                );
              })}
            <p className="text-sm text-muted">
              Total referencia: {formatAmountEuros(menuSubtotalCents)}
            </p>
          </div>
          <ReviewRow
            label="Contacto"
            value={`${contact.name} · ${contact.email} · ${contact.phone}`}
          />
          {notes ? <ReviewRow label="Notas" value={notes} /> : null}
          {prepaymentNeeded ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Al crear la reserva te daremos los datos para la transferencia de{" "}
              <strong>{formatAmountEuros(prepaymentCents)}</strong>. La reserva
              queda pendiente hasta que recibamos la señal.
            </div>
          ) : null}
          {submitError ? (
            <p className="text-sm text-rose-700" role="alert">
              {submitError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        {step === "date" ? (
          onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-muted underline"
            >
              Cancelar
            </button>
          ) : (
            <span />
          )
        ) : (
          <button
            type="button"
            onClick={goBack}
            className="text-sm text-muted underline"
          >
            ← Atrás
          </button>
        )}
        {step === "review" ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canGoNext || submitting}
            className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
          >
            {submitting ? "Creando…" : "Crear reserva"}
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext}
            className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
          >
            Siguiente →
          </button>
        )}
      </div>

      {menuPreview?.imageUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal
          aria-label={menuPreview.name}
        >
          <div className="max-h-[90vh] max-w-2xl overflow-auto rounded-2xl bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{menuPreview.name}</p>
              <button
                type="button"
                onClick={() => setMenuPreview(null)}
                className="rounded-lg border border-border px-3 py-1 text-sm"
              >
                Cerrar
              </button>
            </div>
            <img
              src={menuPreview.imageUrl}
              alt=""
              className="max-h-[min(80vh,800px)] w-full object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StepIntro({ step }: { step: Step }) {
  const copy: Record<Step, { title: string; subtitle: string }> = {
    date: {
      title: "¡Hola! ¿Qué día quieres reservar?",
      subtitle: "Elige una fecha y buscamos huecos.",
    },
    time: {
      title: "¿A qué hora te viene bien?",
      subtitle: "Te mostramos las horas disponibles ese día.",
    },
    party: {
      title: "¿Cuántos vais a ser?",
      subtitle: "Dinos el número total de comensales.",
    },
    contact: {
      title: "¿Cómo te contactamos?",
      subtitle: "Necesitamos un email y un teléfono por si acaso.",
    },
    notes: {
      title: "¿Algo especial?",
      subtitle:
        "Elige los menús para cada comensal (unidad por persona) y, si quieres, añade detalles.",
    },
    review: {
      title: "Revisa antes de enviar",
      subtitle: "Si algo no cuadra puedes volver atrás.",
    },
  };
  const c = copy[step];
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold">{c.title}</h2>
      <p className="text-sm text-muted">{c.subtitle}</p>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border p-3">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function todayIsoPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDateReadable(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  try {
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Madrid",
    }).format(dt);
  } catch {
    return iso;
  }
}
