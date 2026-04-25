"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatAmountEuros,
  formatReservationDateLong,
} from "@/components/reservations/formatters";
import { ReservationChat } from "@/components/reservations/ReservationChat";
import { ReservationStatusBadge } from "@/components/reservations/ReservationStatusBadge";
import {
  acceptReservation,
  cancelReservation,
  fetchReservationDetail,
  markReservationRead,
  sendReservationMessage,
  type ReservationsApiError,
} from "@/lib/reservations/client";
import type {
  ReservationDto,
  ReservationEventDto,
  ReservationMessageDto,
} from "@/lib/serialization/reservations";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string; status?: number }
  | {
      kind: "ok";
      reservation: ReservationDto;
      messages: ReservationMessageDto[];
      events: ReservationEventDto[];
    };

const ACTIVE_FOR_CHAT = new Set([
  "pending",
  "awaiting_customer",
  "awaiting_prepayment",
  "confirmed",
]);

export function ReservationDetailView({
  reservationId,
}: {
  reservationId: string;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<
    "cancel" | "accept" | null
  >(null);
  const hasMarkedRead = useRef(false);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await fetchReservationDetail(reservationId);
      setState({
        kind: "ok",
        reservation: data.reservation,
        messages: data.messages,
        events: data.events,
      });
    } catch (err) {
      const apiErr = err as ReservationsApiError;
      setState({
        kind: "error",
        message: apiErr?.message ?? "Error al cargar",
        status: apiErr?.status,
      });
    }
  }, [reservationId]);

  useEffect(() => {
    load();
  }, [load]);

  // Marcar como leído una vez cargado con éxito.
  useEffect(() => {
    if (state.kind !== "ok") return;
    if (hasMarkedRead.current) return;
    if (state.reservation.unreadForCustomer === 0) return;
    hasMarkedRead.current = true;
    markReservationRead(reservationId).catch(() => {
      hasMarkedRead.current = false;
    });
  }, [state, reservationId]);

  // Refresco periódico mientras se está viendo la pantalla (simple polling).
  useEffect(() => {
    if (state.kind !== "ok") return;
    if (!ACTIVE_FOR_CHAT.has(state.reservation.status)) return;
    const id = setInterval(() => {
      fetchReservationDetail(reservationId)
        .then((data) => {
          setState((prev) =>
            prev.kind === "ok"
              ? {
                  kind: "ok",
                  reservation: data.reservation,
                  messages: data.messages,
                  events: data.events,
                }
              : prev,
          );
        })
        .catch(() => {
          /* silencio; seguimos intentando */
        });
    }, 15_000);
    return () => clearInterval(id);
  }, [state, reservationId]);

  const handleSendMessage = useCallback(
    async (body: string) => {
      const res = await sendReservationMessage(reservationId, body);
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        return {
          ...prev,
          messages: [...prev.messages, res.message],
        };
      });
    },
    [reservationId],
  );

  const handleCancel = useCallback(async () => {
    setSubmittingAction("cancel");
    setActionError(null);
    try {
      const res = await cancelReservation(reservationId);
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        return { ...prev, reservation: res.reservation };
      });
      setConfirmCancel(false);
      // Recargamos para traer el mensaje de sistema añadido.
      load();
    } catch (err) {
      const apiErr = err as ReservationsApiError;
      setActionError(apiErr?.message ?? "No se pudo eliminar la reserva");
    } finally {
      setSubmittingAction(null);
    }
  }, [reservationId, load]);

  const handleAccept = useCallback(async () => {
    setSubmittingAction("accept");
    setActionError(null);
    try {
      const res = await acceptReservation(reservationId);
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        return { ...prev, reservation: res.reservation };
      });
      load();
    } catch (err) {
      const apiErr = err as ReservationsApiError;
      setActionError(apiErr?.message ?? "No se pudo confirmar");
    } finally {
      setSubmittingAction(null);
    }
  }, [reservationId, load]);

  if (state.kind === "loading") {
    return <p className="text-center text-sm text-muted">Cargando reserva…</p>;
  }

  if (state.kind === "error") {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        {state.status === 401
          ? "Tu enlace ha caducado. Pide uno nuevo desde la pantalla de reservas."
          : state.status === 403
          ? "No tienes acceso a esta reserva."
          : state.status === 404
          ? "Esta reserva no existe o ha sido eliminada."
          : state.message}
        <button
          type="button"
          onClick={load}
          className="mt-2 block text-xs underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const { reservation, messages } = state;
  const isActiveForChat = ACTIVE_FOR_CHAT.has(reservation.status);
  const canAccept = reservation.status === "awaiting_customer";
  const canCancel = isActiveForChat;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {formatReservationDateLong(reservation.reservationDate)}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {reservation.reservationTime} h · {reservation.partySize}{" "}
              {reservation.partySize === 1 ? "persona" : "personas"}
            </p>
          </div>
          <ReservationStatusBadge status={reservation.status} />
        </div>

        {reservation.menuLineItems && reservation.menuLineItems.length > 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Menús
            </p>
            <ul className="mt-2 space-y-2">
              {reservation.menuLineItems.map((line) => (
                <li key={line.offerId}>
                  <span className="font-medium">
                    {line.nameSnapshot} × {line.quantity}
                  </span>
                  {line.mainCoursesSnapshot.length > 0 ? (
                    <span className="block text-xs text-muted">
                      Principales: {line.mainCoursesSnapshot.join(" · ")}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted">
                    {formatAmountEuros(line.priceCents * line.quantity)} (
                    {formatAmountEuros(line.priceCents)} / u.)
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Suma referencia:{" "}
              {formatAmountEuros(
                reservation.menuLineItems.reduce(
                  (s, l) => s + l.priceCents * l.quantity,
                  0,
                ),
              )}
            </p>
            <p className="mt-1 text-xs text-muted">
              Para modificar el reparto, escribe al local por el chat.
            </p>
          </div>
        ) : null}

        {reservation.notes ? (
          <p className="mt-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Nota
            </span>
            <br />
            {reservation.notes}
          </p>
        ) : null}

        {(reservation.prepaymentStatus === "awaiting_transfer" ||
          reservation.prepaymentStatus === "pending_instructions") &&
        reservation.prepaymentInstructions ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="mb-1 font-semibold">Señal pendiente</p>
            <pre className="whitespace-pre-wrap font-sans text-sm">
              {reservation.prepaymentInstructions}
            </pre>
          </div>
        ) : null}

        {isActiveForChat ? (
          <p className="mt-4 rounded-xl border border-brand/25 bg-brand/5 px-3 py-2.5 text-sm leading-relaxed text-foreground">
            En caso de que necesites <strong>modificar tu reserva</strong>, utiliza
            el <strong>chat</strong> para hablar con el equipo.
          </p>
        ) : null}
        <div
          className={`flex flex-wrap gap-2 ${isActiveForChat ? "mt-3" : "mt-4"}`}
        >
          {canAccept ? (
            <button
              type="button"
              onClick={handleAccept}
              disabled={submittingAction === "accept"}
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {submittingAction === "accept" ? "Confirmando…" : "Confirmar"}
            </button>
          ) : null}
          {canCancel ? (
            confirmCancel ? (
              <>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={submittingAction === "cancel"}
                  className="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {submittingAction === "cancel"
                    ? "Eliminando…"
                    : "Sí, eliminar reserva"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="text-sm text-muted underline"
                >
                  No, mantener
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="rounded-full border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                Eliminar reserva
              </button>
            )
          ) : null}
          {actionError ? (
            <p className="w-full text-sm text-rose-700" role="alert">
              {actionError}
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">Chat con el equipo</h3>
        <ReservationChat
          messages={messages}
          disabled={!isActiveForChat}
          disabledReason={
            !isActiveForChat
              ? "Esta reserva ya no está activa, el chat está cerrado."
              : undefined
          }
          onSend={handleSendMessage}
        />
      </section>
    </div>
  );
}
