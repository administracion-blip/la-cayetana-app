"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatReservationShort,
} from "@/components/reservations/formatters";
import { NewReservationWizard } from "@/components/reservations/NewReservationWizard";
import { ReservationStatusBadge } from "@/components/reservations/ReservationStatusBadge";
import {
  cancelReservation,
  fetchMyReservations,
  requestGuestOtp,
  verifyGuestOtp,
  type MyReservationsResponse,
  type ReservationsApiError,
} from "@/lib/reservations/client";
import {
  clearStoredGuestToken,
  getStoredGuestEmail,
  getStoredGuestToken,
  setStoredGuestEmail,
  setStoredGuestToken,
} from "@/lib/reservations/guest-token-store";
import type {
  ReservationConfigDto,
  ReservationDto,
} from "@/lib/serialization/reservations";

interface Props {
  config: ReservationConfigDto;
  viewer: {
    isLoggedIn: boolean;
    name: string;
    email: string;
    phone: string;
  };
}

type Mode = "loading" | "decision" | "wizard" | "guest_landing";

/** Mismas reglas que en `ReservationDetailView`: solo se puede anular si sigue activa. */
const CAN_DELETE_RESERVATION = new Set([
  "pending",
  "awaiting_customer",
  "awaiting_prepayment",
  "confirmed",
]);

export function ReservationsHome({ config, viewer }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("loading");
  const [active, setActive] = useState<ReservationDto[]>([]);
  const [past, setPast] = useState<ReservationDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState<
    "email" | "code" | "verifying" | "success"
  >("email");
  const [otpSending, setOtpSending] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  /** Reserva cuyo botón "Eliminar" mostró el paso de confirmación. */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listActionError, setListActionError] = useState<string | null>(null);

  useEffect(() => {
    const remembered = getStoredGuestEmail();
    if (remembered) setOtpEmail(remembered);
  }, []);

  // Si viene `?gt=<token>` en la URL, lo guardamos y limpiamos la URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const gt = searchParams?.get("gt");
    if (!gt) return;
    setStoredGuestToken(gt);
    const url = new URL(window.location.href);
    url.searchParams.delete("gt");
    window.history.replaceState({}, "", url.toString());
    // Forzamos re-fetch tras guardar.
    loadMine();
  }, [searchParams]);

  const loadMine = useCallback(async () => {
    setError(null);
    try {
      const data: MyReservationsResponse = await fetchMyReservations();
      setActive(data.active);
      setPast(data.past);
      if (data.anonymous) {
        setMode("guest_landing");
        return;
      }
      setMode(data.active.length > 0 ? "decision" : "wizard");
    } catch (err) {
      const apiErr = err as ReservationsApiError;
      if (apiErr?.status === 401) {
        // Token guest inválido. Borramos y caemos al landing.
        clearStoredGuestToken();
        setMode(viewer.isLoggedIn ? "wizard" : "guest_landing");
        return;
      }
      setError(apiErr?.message ?? "Error al cargar tus reservas");
      setMode(viewer.isLoggedIn ? "wizard" : "guest_landing");
    }
  }, [viewer.isLoggedIn]);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  const hasGuestToken = useMemo(() => {
    if (typeof window === "undefined") return false;
    return !!getStoredGuestToken();
  }, []);

  const handleNewReservation = useCallback(() => {
    setMode("wizard");
  }, []);

  if (mode === "loading") {
    return (
      <p className="text-center text-sm text-muted">Cargando tus reservas…</p>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        {error}
        <button
          type="button"
          onClick={loadMine}
          className="mt-2 block text-xs underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (mode === "guest_landing" && !viewer.isLoggedIn) {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Reserva tu mesa</h2>
          <p className="mt-1 text-sm text-muted">
            No hace falta estar registrado. Pide tu reserva en un minuto; te
            guardamos tus datos para que puedas consultarla después.
          </p>
          <button
            type="button"
            onClick={handleNewReservation}
            className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover"
          >
            Hacer una reserva
          </button>
          {hasGuestToken ? (
            <button
              type="button"
              onClick={loadMine}
              className="ml-3 text-sm text-brand underline"
            >
              Ver mis reservas
            </button>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold">¿Ya has hecho una reserva?</h3>
          <p className="mt-1 text-xs text-muted">
            Te enviaremos un código al email con el que reservaste. Con él
            entras al instante.
          </p>
          {otpStep === "email" || otpStep === "verifying" ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="tuemail@ejemplo.com"
                className="flex-1 rounded-xl border border-border px-3 py-2 text-sm"
                value={otpEmail}
                onChange={(e) => setOtpEmail(e.target.value)}
              />
              <button
                type="button"
                onClick={async () => {
                  if (!otpEmail) return;
                  setOtpSending(true);
                  setOtpError(null);
                  try {
                    await requestGuestOtp(otpEmail);
                    setStoredGuestEmail(otpEmail.trim().toLowerCase());
                    setOtpStep("code");
                    setOtpCode("");
                  } catch (err) {
                    const apiErr = err as ReservationsApiError;
                    setOtpError(apiErr?.message ?? "No se pudo enviar el código");
                  } finally {
                    setOtpSending(false);
                  }
                }}
                disabled={otpSending || !otpEmail}
                className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
              >
                {otpSending ? "Enviando…" : "Enviar código"}
              </button>
            </div>
          ) : null}

          {otpStep === "code" ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted">
                Si hay reservas con <strong>{otpEmail}</strong>, te hemos
                enviado un código de 6 dígitos. Si no llega, revisa la
                carpeta de spam.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="flex-1 rounded-xl border border-border px-3 py-2 text-center text-lg tracking-[0.5em]"
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (otpCode.length !== 6) return;
                    setOtpStep("verifying");
                    setOtpError(null);
                    try {
                      const res = await verifyGuestOtp(otpEmail, otpCode);
                      setStoredGuestToken(res.guestToken);
                      setStoredGuestEmail(res.email);
                      setOtpStep("success");
                      await loadMine();
                    } catch (err) {
                      const apiErr = err as ReservationsApiError;
                      setOtpError(
                        apiErr?.message ?? "No se pudo verificar el código",
                      );
                      setOtpStep("code");
                    }
                  }}
                  disabled={otpCode.length !== 6}
                  className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
                >
                  Verificar
                </button>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setOtpStep("email");
                    setOtpCode("");
                    setOtpError(null);
                  }}
                  className="text-muted underline"
                >
                  Cambiar email
                </button>
                <span className="text-muted">·</span>
                <button
                  type="button"
                  disabled={otpSending}
                  onClick={async () => {
                    setOtpSending(true);
                    setOtpError(null);
                    try {
                      await requestGuestOtp(otpEmail);
                      setOtpCode("");
                    } catch (err) {
                      const apiErr = err as ReservationsApiError;
                      setOtpError(
                        apiErr?.message ?? "No se pudo reenviar el código",
                      );
                    } finally {
                      setOtpSending(false);
                    }
                  }}
                  className="text-brand underline disabled:opacity-60"
                >
                  Reenviar código
                </button>
              </div>
            </div>
          ) : null}

          {otpError ? (
            <p className="mt-2 text-xs text-rose-700" role="alert">
              {otpError}
            </p>
          ) : null}
        </section>
      </div>
    );
  }

  if (mode === "wizard") {
    return (
      <NewReservationWizard
        config={config}
        viewer={viewer}
        onCancel={
          active.length > 0 ? () => setMode("decision") : undefined
        }
      />
    );
  }

  // mode === "decision"
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Hola{viewer.name ? `, ${viewer.name.split(" ")[0]}` : ""}</h2>
        <p className="mt-1 text-sm text-muted">
          Tienes {active.length}{" "}
          {active.length === 1 ? "reserva activa" : "reservas activas"}.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              if (active.length === 1) {
                router.push(`/reservas/${active[0].reservationId}`);
                return;
              }
              const el = document.getElementById("mis-reservas-activas");
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="flex flex-col items-start rounded-xl border border-brand bg-white p-4 text-left transition hover:bg-brand/5"
          >
            <span className="text-sm font-semibold text-brand">
              {active.length === 1
                ? "Gestionar mi reserva"
                : "Ver mis reservas"}
            </span>
            <span className="mt-1 text-xs text-brand/80">
              Ver detalles, eliminar la reserva o hablar con el equipo.
            </span>
          </button>
          <button
            type="button"
            onClick={handleNewReservation}
            className="flex flex-col items-start rounded-xl border border-brand bg-brand p-4 text-left transition hover:bg-brand-hover"
          >
            <span className="text-sm font-semibold text-white">
              Hacer una nueva reserva
            </span>
            <span className="mt-1 text-xs text-white/85">
              Añade una reserva adicional para otro día.
            </span>
          </button>
        </div>
      </section>

      <section
        id="mis-reservas-activas"
        className="rounded-2xl border border-border bg-white p-5 shadow-sm scroll-mt-24"
      >
        <h3 className="text-sm font-semibold">Mis reservas activas</h3>
        {listActionError ? (
          <p className="mb-2 text-sm text-rose-700" role="alert">
            {listActionError}
          </p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {active.map((r) => {
            const canDelete = CAN_DELETE_RESERVATION.has(r.status);
            return (
              <li
                key={r.reservationId}
                className="flex flex-col gap-2 rounded-xl border border-border p-2 sm:flex-row sm:items-stretch"
              >
                <Link
                  href={`/reservas/${r.reservationId}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {formatReservationShort(
                        r.reservationDate,
                        r.reservationTime,
                      )}
                      {r.unreadForCustomer > 0 ? (
                        <span
                          className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-bold leading-none text-white shadow-sm"
                          title="Mensaje del local sin leer"
                          aria-label={`${r.unreadForCustomer} mensaje${
                            r.unreadForCustomer === 1 ? "" : "s"
                          } nuevo${r.unreadForCustomer === 1 ? "" : "s"}`}
                        >
                          {r.unreadForCustomer > 99
                            ? "99+"
                            : r.unreadForCustomer}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {r.partySize}{" "}
                      {r.partySize === 1 ? "persona" : "personas"}
                    </p>
                  </div>
                  <ReservationStatusBadge status={r.status} />
                </Link>
                {canDelete ? (
                  <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border pt-2 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-2">
                    {confirmDeleteId === r.reservationId ? (
                      <>
                        <button
                          type="button"
                          disabled={deletingId === r.reservationId}
                          onClick={async () => {
                            setListActionError(null);
                            setDeletingId(r.reservationId);
                            try {
                              await cancelReservation(r.reservationId);
                              setConfirmDeleteId(null);
                              await loadMine();
                            } catch (err) {
                              const apiErr = err as ReservationsApiError;
                              setListActionError(
                                apiErr?.message ??
                                  "No se pudo eliminar la reserva",
                              );
                            } finally {
                              setDeletingId(null);
                            }
                          }}
                          className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                        >
                          {deletingId === r.reservationId
                            ? "Eliminando…"
                            : "Sí, eliminar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteId(null);
                            setListActionError(null);
                          }}
                          className="text-xs text-muted underline"
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteId(r.reservationId);
                          setListActionError(null);
                        }}
                        className="rounded-full border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Eliminar reserva
                      </button>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {past.length > 0 ? (
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="flex w-full items-center justify-between text-sm font-semibold"
          >
            <span>Reservas anteriores ({past.length})</span>
            <span className="text-xs text-muted">
              {showPast ? "Ocultar" : "Mostrar"}
            </span>
          </button>
          {showPast ? (
            <ul className="mt-3 space-y-2">
              {past.map((r) => (
                <li key={r.reservationId}>
                  <Link
                    href={`/reservas/${r.reservationId}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-3 text-sm transition hover:bg-muted/30"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {formatReservationShort(
                          r.reservationDate,
                          r.reservationTime,
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {r.partySize}{" "}
                        {r.partySize === 1 ? "persona" : "personas"}
                      </p>
                    </div>
                    <ReservationStatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
