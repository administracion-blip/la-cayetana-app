"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  formatAmountEuros,
  formatRelativeTimestamp,
} from "@/components/reservations/formatters";
import { AdminReservationMenuEditor } from "@/components/admin/reservations/AdminReservationMenuEditor";
import {
  MenuLinesInlineEditor,
  type MenuLinesEditorState,
} from "@/components/admin/reservations/MenuLinesInlineEditor";
import { ReservationStatusBadge } from "@/components/reservations/ReservationStatusBadge";
import {
  adminAddNote,
  adminAppendPrepaymentProofs,
  adminFetchReservation,
  adminMarkPrepaymentReceived,
  adminRemovePrepaymentProof,
  adminSendMessage,
  adminUpdatePrepayment,
  adminUpdateReservationDetails,
  adminUpdateStatus,
  type AdminApiError,
} from "@/lib/admin-reservations/client";
import type { ReservationStaffPermissions } from "@/lib/auth/reservation-admin";
import type {
  AdminReservationDto,
  ReservationEventDto,
  ReservationMessageDto,
  ReservationNoteDto,
} from "@/lib/serialization/reservations";
import type { ReservationStatus } from "@/types/models";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string; status?: number }
  | {
      kind: "ok";
      reservation: AdminReservationDto;
      messages: ReservationMessageDto[];
      events: ReservationEventDto[];
      notes: ReservationNoteDto[];
      permissions: ReservationStaffPermissions;
    };

const STATUS_OPTIONS: { value: ReservationStatus; label: string }[] = [
  { value: "pending", label: "Pendiente de revisar" },
  { value: "awaiting_customer", label: "Esperando al cliente" },
  { value: "awaiting_prepayment", label: "Pendiente de señal" },
  { value: "confirmed", label: "Confirmada" },
  { value: "cancelled_by_customer", label: "Cancelada (por el cliente)" },
  { value: "cancelled_by_staff", label: "Cancelada (por el local)" },
  { value: "no_show", label: "No presentada" },
  { value: "completed", label: "Completada / atendida" },
];

/** Reservas que aún se pueden anular desde gestión. */
const CAN_ANULAR_DESDE_GESTION: ReadonlySet<ReservationStatus> = new Set([
  "pending",
  "awaiting_customer",
  "awaiting_prepayment",
  "confirmed",
]);

/** Misma cadencia que en `ReservationDetailView` (cliente) para alinear criterios. */
const ADMIN_RESERVATION_POLL_MS = 15_000;

/**
 * Plegable; abierto al cargar si la reserva ya incluye menús, y al guardar
 * el primer reparto pasa a abrirse (por `menuLineCount`).
 */
function MenuRepartoDetails({
  partySize,
  menuLineCount,
  children,
}: {
  partySize: number;
  menuLineCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => menuLineCount > 0);
  useEffect(() => {
    if (menuLineCount > 0) setOpen(true);
  }, [menuLineCount]);
  return (
    <details
      className="group rounded-2xl border border-border bg-white shadow-sm"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
        <span>Reparto de menús</span>
        <span className="text-xs font-normal text-muted">
          Editar cantidades · {partySize} comensales
        </span>
      </summary>
      <div className="border-t border-border">{children}</div>
    </details>
  );
}

export function AdminReservationDetail({
  reservationId,
}: {
  reservationId: string;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await adminFetchReservation(reservationId);
      setState({
        kind: "ok",
        reservation: data.reservation,
        messages: data.messages,
        events: data.events,
        notes: data.notes,
        permissions: data.permissions,
      });
    } catch (err) {
      const apiErr = err as AdminApiError;
      setState({
        kind: "error",
        message: apiErr?.message ?? "Error al cargar",
        status: apiErr?.status,
      });
    }
  }, [reservationId]);

  /** Recarga en segundo plano: no vuelve a `loading` (evita parpadeo en el chat). */
  const refreshSilently = useCallback(async () => {
    try {
      const data = await adminFetchReservation(reservationId);
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        return {
          kind: "ok",
          reservation: data.reservation,
          messages: data.messages,
          events: data.events,
          notes: data.notes,
          permissions: data.permissions,
        };
      });
    } catch {
      /* silencio: seguimos en el último estado conocido */
    }
  }, [reservationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (state.kind !== "ok") return;
    const id = setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      void refreshSilently();
    }, ADMIN_RESERVATION_POLL_MS);
    return () => clearInterval(id);
  }, [state.kind, refreshSilently]);

  if (state.kind === "loading") {
    return <p className="text-center text-sm text-muted">Cargando reserva…</p>;
  }

  if (state.kind === "error") {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        {state.message}
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

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,_1fr)_300px] lg:items-start">
      <div className="min-w-0 space-y-3">
        <Summary
          reservation={state.reservation}
          canEdit={state.permissions.canManage}
          onSaved={load}
        />
        <MenuRepartoDetails
          key={state.reservation.reservationId}
          partySize={state.reservation.partySize}
          menuLineCount={state.reservation.menuLineItems?.length ?? 0}
        >
          <AdminReservationMenuEditor
            embed
            reservation={state.reservation}
            canEdit={state.permissions.canManage}
            onUpdated={(r) =>
              setState((prev) =>
                prev.kind === "ok" ? { ...prev, reservation: r } : prev,
              )
            }
          />
        </MenuRepartoDetails>
        <ChatPanel
          reservation={state.reservation}
          messages={state.messages}
          canReplyChat={state.permissions.canReplyChat}
          onSent={(msg) =>
            setState((prev) =>
              prev.kind === "ok"
                ? { ...prev, messages: [...prev.messages, msg] }
                : prev,
            )
          }
        />
        <TimelinePanel events={state.events} />
      </div>
      <aside className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:z-10 lg:max-h-[calc(100vh-4.5rem)] lg:overflow-y-auto lg:overflow-x-hidden lg:pr-0.5">
        <ActionsPanel
          reservation={state.reservation}
          permissions={state.permissions}
          reload={load}
        />
        <NotesPanel
          reservationId={state.reservation.reservationId}
          notes={state.notes}
          canWriteNotes={state.permissions.canWriteNotes}
          onAdded={(note) =>
            setState((prev) =>
              prev.kind === "ok"
                ? { ...prev, notes: [...prev.notes, note] }
                : prev,
            )
          }
        />
      </aside>
    </div>
  );
}

function Summary({
  reservation,
  canEdit,
  onSaved,
}: {
  reservation: AdminReservationDto;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [prepayMsgOpen, setPrepayMsgOpen] = useState(false);
  const [prepayMsgCopied, setPrepayMsgCopied] = useState(false);
  const [name, setName] = useState(reservation.contact.name);
  const [email, setEmail] = useState(reservation.contact.email);
  const [phone, setPhone] = useState(reservation.contact.phone);
  const [reservationDate, setReservationDate] = useState(
    reservation.reservationDate,
  );
  const [reservationTime, setReservationTime] = useState(
    reservation.reservationTime,
  );
  const [partySize, setPartySize] = useState(String(reservation.partySize));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // El editor inline de menús reporta su estado/payload al modal cuando
  // la reserva ya tiene reparto guardado. Si no lo tiene, se queda en
  // `null` y el modal sigue funcionando como antes (sin tocar menús).
  const [menuState, setMenuState] = useState<MenuLinesEditorState | null>(
    null,
  );

  const hasMenuLines = (reservation.menuLineItems?.length ?? 0) > 0;

  useEffect(() => {
    if (editOpen) return;
    setName(reservation.contact.name);
    setEmail(reservation.contact.email);
    setPhone(reservation.contact.phone);
    setReservationDate(reservation.reservationDate);
    setReservationTime(reservation.reservationTime);
    setPartySize(String(reservation.partySize));
    setMenuState(null);
  }, [
    reservation.reservationId,
    reservation.version,
    reservation.contact,
    reservation.reservationDate,
    reservation.reservationTime,
    reservation.partySize,
    editOpen,
  ]);

  const openEdit = () => {
    setName(reservation.contact.name);
    setEmail(reservation.contact.email);
    setPhone(reservation.contact.phone);
    setReservationDate(reservation.reservationDate);
    setReservationTime(reservation.reservationTime);
    setPartySize(String(reservation.partySize));
    setMenuState(null);
    setFormError(null);
    setEditOpen(true);
  };

  const partySizeNum = Number(partySize);
  const partySizeNumValid =
    Number.isFinite(partySizeNum) && partySizeNum >= 1;
  const partySizeChanged =
    partySizeNumValid && partySizeNum !== reservation.partySize;
  // El reparto solo viaja en el payload cuando hay menús guardados
  // y han cambiado los comensales o el propio reparto. Mientras el
  // catálogo está cargando, bloqueamos el guardado para no enviar un
  // payload incompleto.
  const menuStateBlocked =
    hasMenuLines &&
    partySizeChanged &&
    (menuState == null ||
      menuState.kind !== "ready" ||
      !menuState.isValid);

  const saveEdit = async () => {
    if (!partySizeNumValid) {
      setFormError("Número de comensales no válido.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await adminUpdateReservationDetails(reservation.reservationId, {
        contact: { name: name.trim(), email: email.trim(), phone: phone.trim() },
        partySize: partySizeNum,
        reservationDate: reservationDate.trim(),
        reservationTime: reservationTime.trim(),
        expectedVersion: reservation.version,
        menuLines:
          hasMenuLines && partySizeChanged && menuState?.kind === "ready"
            ? menuState.menuLines
            : undefined,
      });
      setEditOpen(false);
      onSaved();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo guardar",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-base font-semibold sm:text-lg">
            {reservation.contact.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {formatDateLong(reservation.reservationDate)} ·{" "}
            {reservation.reservationTime} h · {reservation.partySize}{" "}
            {reservation.partySize === 1 ? "persona" : "personas"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {reservation.contact.email} · {reservation.contact.phone}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <ReservationStatusBadge status={reservation.status} />
          {reservation.prepaymentStatus === "received" &&
          reservation.prepaymentTotalReceivedCents > 0 ? (
            <p className="text-center text-sm font-semibold text-emerald-700 sm:max-w-[12rem] sm:text-right">
              Total Prepagos:{" "}
              {formatAmountEuros(reservation.prepaymentTotalReceivedCents)}
            </p>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              onClick={openEdit}
              className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted/40"
            >
              Editar datos de la reserva
            </button>
          ) : null}
          {reservation.prepaymentInstructions ? (
            <button
              type="button"
              onClick={() => {
                setPrepayMsgCopied(false);
                setPrepayMsgOpen(true);
              }}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm hover:bg-emerald-100"
            >
              Volver a solicitar prepago
            </button>
          ) : null}
        </div>
      </div>
      {prepayMsgOpen ? (
        <PrepaymentMessageDialog
          reservationId={reservation.reservationId}
          message={reservation.prepaymentInstructions ?? ""}
          phone={reservation.contact.phone}
          email={reservation.contact.email}
          copied={prepayMsgCopied}
          onCopied={() => setPrepayMsgCopied(true)}
          onClose={() => setPrepayMsgOpen(false)}
        />
      ) : null}
      {editOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-reservation-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditOpen(false);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="edit-reservation-title"
              className="text-sm font-semibold"
            >
              Editar datos de la reserva
            </h2>
            <div className="mt-3 space-y-2">
              <label className="block text-xs text-muted">
                Nombre
                <input
                  className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                />
              </label>
              <label className="block text-xs text-muted">
                Email
                <input
                  type="email"
                  className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block text-xs text-muted">
                Teléfono
                <input
                  className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-muted">
                  Fecha
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-border px-2 py-2 text-sm"
                    value={reservationDate}
                    onChange={(e) => setReservationDate(e.target.value)}
                  />
                </label>
                <label className="block text-xs text-muted">
                  Hora
                  <input
                    type="time"
                    className="mt-1 w-full rounded-xl border border-border px-2 py-2 text-sm"
                    value={reservationTime}
                    onChange={(e) => setReservationTime(e.target.value)}
                  />
                </label>
              </div>
              <label className="block text-xs text-muted">
                Comensales
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
                  value={partySize}
                  onChange={(e) => setPartySize(e.target.value)}
                />
              </label>
            </div>
            {hasMenuLines && partySizeChanged ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                <p className="text-xs font-semibold text-amber-900">
                  Ajusta el reparto de menús al nuevo nº de comensales
                </p>
                <p className="mt-0.5 text-[11px] text-amber-900/80">
                  Antes: {reservation.partySize} → Ahora: {partySizeNum}.
                  El reparto se guardará junto con el resto.
                </p>
                <div className="mt-2">
                  <MenuLinesInlineEditor
                    initialMenuLineItems={reservation.menuLineItems}
                    targetPartySize={partySizeNum}
                    disabled={saving}
                    onStateChange={setMenuState}
                  />
                </div>
                {menuState?.kind === "ready" && menuState.problem ? (
                  <p
                    className="mt-2 text-[11px] font-medium text-rose-700"
                    role="status"
                  >
                    {menuState.problem}
                  </p>
                ) : null}
              </div>
            ) : null}
            {formError ? (
              <p className="mt-2 text-xs text-rose-700" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-full border border-border px-4 py-2 text-sm"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={saving || menuStateBlocked}
                className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
        <span className="rounded-full bg-muted/40 px-2 py-0.5">
          ID: {reservation.reservationId.slice(0, 8)}
        </span>
        <span className="rounded-full bg-muted/40 px-2 py-0.5">
          Canal: {reservation.createdVia}
        </span>
        {reservation.isGuest ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
            Guest
          </span>
        ) : null}
        <span className="rounded-full bg-muted/40 px-2 py-0.5">
          v{reservation.version}
        </span>
      </div>
      {reservation.menuLineItems && reservation.menuLineItems.length > 0 ? (
        <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Menús (reserva)
          </span>
          <ul className="mt-2 list-inside list-disc space-y-2">
            {reservation.menuLineItems.map((line) => {
              const counts = new Map<string, { display: string; n: number }>();
              for (const raw of line.mainCoursesSnapshot ?? []) {
                const t = String(raw).trim();
                if (!t) continue;
                const key = t.toLowerCase();
                const prev = counts.get(key);
                if (prev) prev.n += 1;
                else counts.set(key, { display: t, n: 1 });
              }
              const mainRows = Array.from(counts.values())
                .filter((x) => x.n > 0)
                .sort(
                  (a, b) =>
                    b.n - a.n || a.display.localeCompare(b.display, "es"),
                );
              return (
                <li key={line.offerId}>
                  <span className="font-medium">
                    {line.nameSnapshot} × {line.quantity}
                  </span>
                  <span className="text-xs text-muted">
                    {" "}
                    · {formatAmountEuros(line.priceCents * line.quantity)}
                  </span>
                  {mainRows.length > 0 ? (
                    <p className="mt-1 pl-5 text-xs leading-snug text-muted-foreground">
                      Principales:{" "}
                      {mainRows
                        .map((x) => `${x.display} × ${x.n}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {reservation.notes ? (
        <p className="mt-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Nota del cliente
          </span>
          <br />
          {reservation.notes}
        </p>
      ) : null}
      {reservation.prepaymentAmountCents ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">
            Señal:{" "}
            {formatAmountEuros(reservation.prepaymentAmountCents)} ·{" "}
            {reservation.prepaymentStatus}
          </p>
          {reservation.prepaymentDeadlineAt ? (
            <p className="text-xs text-amber-900/80">
              Plazo:{" "}
              {new Date(reservation.prepaymentDeadlineAt).toLocaleString(
                "es-ES",
              )}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ChatPanel({
  reservation,
  messages,
  canReplyChat,
  onSent,
}: {
  reservation: AdminReservationDto;
  messages: ReservationMessageDto[];
  canReplyChat: boolean;
  onSent: (m: ReservationMessageDto) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const res = await adminSendMessage(reservation.reservationId, { body });
      onSent(res.message);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold">Chat con el cliente</h3>
      <div className="max-h-[min(42vh,18rem)] space-y-2 overflow-y-auto rounded-xl border border-border bg-muted/20 p-3 sm:max-h-[min(45vh,20rem)]">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">
            Sin mensajes todavía.
          </p>
        ) : (
          messages.map((m) => <AdminBubble key={m.messageId} message={m} />)
        )}
        <div ref={bottomRef} />
      </div>
      {canReplyChat ? (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-xl border border-border px-3 py-2 text-sm"
            placeholder="Responder al cliente"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            maxLength={2000}
            disabled={sending}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !draft.trim()}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
          >
            {sending ? "…" : "Enviar"}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">
          No tienes permiso para responder en este chat.
        </p>
      )}
      {error ? (
        <p className="mt-2 text-xs text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function AdminBubble({ message }: { message: ReservationMessageDto }) {
  if (message.authorType === "system") {
    return (
      <div className="flex justify-center">
        <p className="max-w-[80%] rounded-full bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground">
          {message.body}
        </p>
      </div>
    );
  }
  const isStaff = message.authorType === "staff";
  return (
    <div className={`flex ${isStaff ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          isStaff
            ? "rounded-br-sm bg-brand text-white"
            : "rounded-bl-sm bg-white"
        }`}
      >
        <p
          className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${
            isStaff ? "text-white/80" : "opacity-70"
          }`}
        >
          {message.authorDisplayName}
        </p>
        <p className="whitespace-pre-wrap">{message.body}</p>
        <p
          className={`mt-1 text-[10px] ${
            isStaff ? "text-white/70" : "text-muted"
          }`}
        >
          {formatRelativeTimestamp(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

function TimelinePanel({ events }: { events: ReservationEventDto[] }) {
  if (events.length === 0) return null;
  return (
    <details className="rounded-2xl border border-border bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-baseline gap-2">
          Historial
          <span className="text-xs font-normal text-muted">
            {events.length} {events.length === 1 ? "evento" : "eventos"}
          </span>
        </span>
      </summary>
      <ul className="max-h-48 space-y-2 overflow-y-auto border-t border-border px-4 pb-4 pt-3 text-sm">
        {events
          .slice()
          .reverse()
          .map((e) => (
            <li key={e.eventId} className="border-l-2 border-border pl-3">
              <p className="text-xs text-muted">
                {new Date(e.createdAt).toLocaleString("es-ES")}
              </p>
              <p>
                <span className="font-medium">{prettyEventKind(e.kind)}</span>
                {renderEventMeta(e)}
              </p>
            </li>
          ))}
      </ul>
    </details>
  );
}

function prettyEventKind(kind: string): string {
  const map: Record<string, string> = {
    created: "Reserva creada",
    status_changed: "Cambio de estado",
    schedule_changed: "Cambio de fecha/hora",
    details_changed: "Datos de la reserva actualizados",
    prepayment_received: "Señal recibida",
    note_added: "Nota interna",
  };
  return map[kind] ?? kind;
}

function renderEventMeta(e: ReservationEventDto) {
  if (!e.meta) return null;
  if (e.kind === "status_changed") {
    return (
      <span className="text-muted">
        {" "}
        · {String(e.meta.from)} → {String(e.meta.to)}
      </span>
    );
  }
  if (e.kind === "schedule_changed") {
    const from = e.meta.from as { date?: string; time?: string } | undefined;
    const to = e.meta.to as { date?: string; time?: string } | undefined;
    return (
      <span className="text-muted">
        {" "}
        · {from?.date} {from?.time} → {to?.date} {to?.time}
      </span>
    );
  }
  return null;
}

/** Convierte importe tecleado a céntimos (formato con coma o punto decimal). */
function parseEurosInputToCents(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "");
  if (!t) return null;
  const normalized = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : t;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0.01) return null;
  return Math.round(n * 100);
}

function ActionsPanel({
  reservation,
  permissions,
  reload,
}: {
  reservation: AdminReservationDto;
  permissions: ReservationStaffPermissions;
  reload: () => void;
}) {
  const [newStatus, setNewStatus] = useState<ReservationStatus>(
    reservation.status,
  );
  const [systemMessage, setSystemMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAnular, setConfirmAnular] = useState(false);
  const [anularMessage, setAnularMessage] = useState("");
  const [prepayRows, setPrepayRows] = useState<
    { file: File | null; amountStr: string }[]
  >([{ file: null, amountStr: "" }]);
  const [appendPrepayRows, setAppendPrepayRows] = useState<
    { file: File | null; amountStr: string }[]
  >([{ file: null, amountStr: "" }]);

  const canMarkPrepaymentReceived =
    reservation.prepaymentStatus !== "received" &&
    reservation.prepaymentStatus !== "refunded";
  const canEditPrepayProofs =
    permissions.canManage && reservation.prepaymentStatus === "received";

  useEffect(() => {
    setNewStatus(reservation.status);
    setConfirmAnular(false);
    setAnularMessage("");
    setPrepayRows([{ file: null, amountStr: "" }]);
    setAppendPrepayRows([{ file: null, amountStr: "" }]);
  }, [
    reservation.reservationId,
    reservation.status,
    reservation.version,
  ]);

  const canAnularDesdeAqui = CAN_ANULAR_DESDE_GESTION.has(reservation.status);

  const handleStatus = async () => {
    setWorking(true);
    setError(null);
    try {
      await adminUpdateStatus(reservation.reservationId, {
        newStatus,
        expectedVersion: reservation.version,
        systemMessage: systemMessage || undefined,
      });
      setSystemMessage("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setWorking(false);
    }
  };

  const handleAnularReserva = async () => {
    setWorking(true);
    setError(null);
    try {
      await adminUpdateStatus(reservation.reservationId, {
        newStatus: "cancelled_by_staff",
        expectedVersion: reservation.version,
        systemMessage:
          anularMessage.trim() ||
          "La reserva ha sido anulada por el restaurante.",
      });
      setConfirmAnular(false);
      setAnularMessage("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setWorking(false);
    }
  };

  const handlePrepayment = async (
    action: "mark_received" | "mark_refunded",
  ) => {
    if (action === "mark_refunded") {
      setWorking(true);
      setError(null);
      try {
        await adminUpdatePrepayment(reservation.reservationId, {
          action: "mark_refunded",
          expectedVersion: reservation.version,
        });
        reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
      } finally {
        setWorking(false);
      }
      return;
    }

    const lines: { file: File; amountCents: number }[] = [];
    for (const row of prepayRows) {
      const hasFile = row.file != null;
      const hasAmount = row.amountStr.trim() !== "";
      if (!hasFile && !hasAmount) continue;
      if (!hasFile || !hasAmount) {
        setError(
          "Cada comprobante necesita archivo e importe (€), o deja la fila en blanco.",
        );
        return;
      }
      const c = parseEurosInputToCents(row.amountStr);
      if (c == null) {
        setError("Revisa el importe en € (mín. 0,01 €) en cada comprobante.");
        return;
      }
      lines.push({ file: row.file!, amountCents: c });
    }
    if (lines.length === 0) {
      setError("Añade al menos un comprobante con su importe.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await adminMarkPrepaymentReceived(reservation.reservationId, {
        expectedVersion: reservation.version,
        lines,
      });
      setPrepayRows([{ file: null, amountStr: "" }]);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setWorking(false);
    }
  };

  const handleAppendPrepayment = async () => {
    const lines: { file: File; amountCents: number }[] = [];
    for (const row of appendPrepayRows) {
      const hasFile = row.file != null;
      const hasAmount = row.amountStr.trim() !== "";
      if (!hasFile && !hasAmount) continue;
      if (!hasFile || !hasAmount) {
        setError(
          "Cada comprobante necesita archivo e importe, o deja la fila vacía.",
        );
        return;
      }
      const c = parseEurosInputToCents(row.amountStr);
      if (c == null) {
        setError("Revisa el importe en € (mín. 0,01 €) en cada comprobante.");
        return;
      }
      lines.push({ file: row.file!, amountCents: c });
    }
    if (lines.length === 0) {
      setError("Añade al menos un comprobante con su importe.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await adminAppendPrepaymentProofs(reservation.reservationId, {
        expectedVersion: reservation.version,
        lines,
      });
      setAppendPrepayRows([{ file: null, amountStr: "" }]);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setWorking(false);
    }
  };

  const handleRemovePrepayProof = async (proofId: string) => {
    if (!canEditPrepayProofs) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("¿Quitar este comprobante? El archivo se eliminará.")
    ) {
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await adminRemovePrepaymentProof(reservation.reservationId, {
        expectedVersion: reservation.version,
        proofId,
      });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setWorking(false);
    }
  };

  if (!permissions.canManage) {
    return (
      <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <p className="text-sm text-muted">
          No tienes permiso para gestionar esta reserva.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold">Gestión</h3>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted">Estado</label>
        <select
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value as ReservationStatus)}
          className="w-full rounded-xl border border-border px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <textarea
          placeholder="Mensaje opcional al cliente"
          rows={2}
          value={systemMessage}
          onChange={(e) => setSystemMessage(e.target.value)}
          className="w-full rounded-xl border border-border px-3 py-2 text-xs"
          maxLength={2000}
        />
        <button
          type="button"
          onClick={handleStatus}
          disabled={working || newStatus === reservation.status}
          className="w-full rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {working ? "Aplicando…" : "Aplicar estado"}
        </button>
      </div>

      {canAnularDesdeAqui ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/50 p-3">
          <p className="text-xs font-medium text-rose-900">Anular reserva</p>
          <p className="mt-1 text-[11px] text-rose-800/90">
            Marca la reserva como cancelada por el local y, si aplica, notifica
            al cliente. Es lo mismo que elegir &quot;Cancelada (por el
            local)&quot; arriba, pero en un solo paso.
          </p>
          {confirmAnular ? (
            <div className="mt-2 space-y-2">
              <textarea
                placeholder="Mensaje para el cliente (opcional)"
                rows={2}
                value={anularMessage}
                onChange={(e) => setAnularMessage(e.target.value)}
                className="w-full rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs"
                maxLength={2000}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleAnularReserva}
                  disabled={working}
                  className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {working ? "Anulando…" : "Sí, anular reserva"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmAnular(false);
                    setAnularMessage("");
                  }}
                  className="text-xs text-rose-800 underline"
                >
                  Volver
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmAnular(true)}
              className="mt-2 w-full rounded-full border border-rose-400 bg-white px-3 py-2 text-xs font-medium text-rose-800 hover:bg-rose-100"
            >
              Anular esta reserva…
            </button>
          )}
        </div>
      ) : null}

      {reservation.prepaymentAmountCents ? (
        <div className="mt-4 border-t border-border/80 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Prepago
          </p>
          {reservation.prepaymentProofItems.length > 0 ? (
            <ul className="mt-1.5 list-none space-y-1 text-[11px] text-muted">
              {reservation.prepaymentProofItems.map((p) => {
                const href = `/api/admin/reservations/${encodeURIComponent(
                  reservation.reservationId,
                )}/prepayment/proof${
                  p.proofId
                    ? `?proofId=${encodeURIComponent(p.proofId)}`
                    : ""
                }`;
                return (
                  <li
                    key={p.proofId}
                    className="flex max-w-full items-center justify-between gap-2"
                  >
                    <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                      <a
                        href={href}
                        className="min-w-0 max-w-[min(100%,11rem)] truncate font-medium text-brand underline"
                        target="_blank"
                        rel="noopener noreferrer"
                        title={p.fileName}
                      >
                        {p.fileName}
                      </a>
                      {p.amountCents > 0 ? (
                        <span className="shrink-0 text-foreground tabular-nums">
                          {formatAmountEuros(p.amountCents)}
                        </span>
                      ) : (
                        <span className="shrink-0 text-muted">—</span>
                      )}
                    </div>
                    {canEditPrepayProofs ? (
                      <button
                        type="button"
                        onClick={() => void handleRemovePrepayProof(p.proofId)}
                        disabled={working}
                        className="shrink-0 rounded-md border border-rose-200/90 bg-rose-50/90 px-1.5 py-0.5
                          text-[10px] font-medium text-rose-800 hover:bg-rose-100
                          disabled:opacity-50"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {canMarkPrepaymentReceived ? (
            <div className="mt-2 space-y-1.5">
              <p className="text-[10px] leading-snug text-muted">
                Mín. 1 comprobante + importe (€) · PDF/JPG/PNG/WebP, máx. 10 MB
              </p>
              {prepayRows.map((row, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border/80 bg-zinc-50/80 p-2"
                >
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_4.25rem] sm:items-end sm:gap-2">
                    <div className="min-w-0">
                      <label
                        className="text-[10px] font-medium text-muted"
                        htmlFor={`prepay-file-${i}-${reservation.reservationId}`}
                      >
                        Archivo
                      </label>
                      <input
                        id={`prepay-file-${i}-${reservation.reservationId}`}
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        className="mt-0.5 block w-full min-w-0 text-[10px] file:me-1.5
                          file:rounded-md file:border file:border-sky-200/90 file:bg-sky-100
                          file:px-2 file:py-1 file:text-[10px] file:font-medium file:text-sky-900
                          file:shadow-sm hover:file:bg-sky-200"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setPrepayRows((prev) => {
                            const n = [...prev];
                            n[i] = { ...n[i]!, file: f };
                            return n;
                          });
                        }}
                      />
                    </div>
                    <div className="w-full min-w-0 sm:w-full">
                      <label
                        className="text-[10px] font-medium text-muted"
                        htmlFor={`prepay-amt-${i}-${reservation.reservationId}`}
                      >
                        €
                      </label>
                      <input
                        id={`prepay-amt-${i}-${reservation.reservationId}`}
                        type="text"
                        inputMode="decimal"
                        className="mt-0.5 w-full rounded-md border border-border/90 bg-white px-1.5 py-1
                          text-center text-xs tabular-nums"
                        placeholder="0,00"
                        value={row.amountStr}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPrepayRows((prev) => {
                            const n = [...prev];
                            n[i] = { ...n[i]!, amountStr: v };
                            return n;
                          });
                        }}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  {prepayRows.length > 1 ? (
                    <button
                      type="button"
                      className="mt-1 text-[10px] text-rose-600 underline decoration-rose-300/80
                        underline-offset-2"
                      onClick={() => {
                        setPrepayRows((prev) => prev.filter((_, j) => j !== i));
                      }}
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
              ))}
              <div className="flex flex-col gap-1.5 pt-0.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-[11px] font-medium text-brand hover:underline"
                    onClick={() =>
                      setPrepayRows((p) => [
                        ...p,
                        { file: null, amountStr: "" },
                      ])
                    }
                  >
                    + Añadir comprobante
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void handlePrepayment("mark_received")}
                  disabled={working}
                  className="w-full rounded-lg bg-emerald-600 py-1.5 text-xs font-medium text-white
                    shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {working ? "Guardando…" : "Marcar recibido (→ confirmada)"}
                </button>
              </div>
            </div>
          ) : null}
          {canEditPrepayProofs ? (
            <div className="mt-2 space-y-1.5">
              <p className="text-[10px] font-medium text-muted">
                Añadir más comprobantes
              </p>
              <p className="text-[10px] leading-snug text-muted">
                PDF/JPG/PNG/WebP, máx. 10 MB · importe mín. 0,01 €
              </p>
              {appendPrepayRows.map((row, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border/80 bg-zinc-50/80 p-2"
                >
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_4.25rem] sm:items-end sm:gap-2">
                    <div className="min-w-0">
                      <label
                        className="text-[10px] font-medium text-muted"
                        htmlFor={`append-prepay-file-${i}-${reservation.reservationId}`}
                      >
                        Archivo
                      </label>
                      <input
                        id={`append-prepay-file-${i}-${reservation.reservationId}`}
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        className="mt-0.5 block w-full min-w-0 text-[10px] file:me-1.5
                          file:rounded-md file:border file:border-sky-200/90 file:bg-sky-100
                          file:px-2 file:py-1 file:text-[10px] file:font-medium file:text-sky-900
                          file:shadow-sm hover:file:bg-sky-200"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setAppendPrepayRows((prev) => {
                            const n = [...prev];
                            n[i] = { ...n[i]!, file: f };
                            return n;
                          });
                        }}
                      />
                    </div>
                    <div className="w-full min-w-0 sm:w-full">
                      <label
                        className="text-[10px] font-medium text-muted"
                        htmlFor={`append-prepay-amt-${i}-${reservation.reservationId}`}
                      >
                        €
                      </label>
                      <input
                        id={`append-prepay-amt-${i}-${reservation.reservationId}`}
                        type="text"
                        inputMode="decimal"
                        className="mt-0.5 w-full rounded-md border border-border/90 bg-white px-1.5
                          py-1 text-center text-xs tabular-nums"
                        placeholder="0,00"
                        value={row.amountStr}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAppendPrepayRows((prev) => {
                            const n = [...prev];
                            n[i] = { ...n[i]!, amountStr: v };
                            return n;
                          });
                        }}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  {appendPrepayRows.length > 1 ? (
                    <button
                      type="button"
                      className="mt-1 text-[10px] text-rose-600 underline
                        decoration-rose-300/80 underline-offset-2"
                      onClick={() => {
                        setAppendPrepayRows((prev) =>
                          prev.filter((_, j) => j !== i),
                        );
                      }}
                    >
                      Quitar fila
                    </button>
                  ) : null}
                </div>
              ))}
              <div className="flex flex-col gap-1.5 pt-0.5">
                <button
                  type="button"
                  className="w-fit text-[11px] font-medium text-brand hover:underline"
                  onClick={() =>
                    setAppendPrepayRows((p) => [
                      ...p,
                      { file: null, amountStr: "" },
                    ])
                  }
                >
                  + Otra fila
                </button>
                <button
                  type="button"
                  onClick={() => void handleAppendPrepayment()}
                  disabled={working}
                  className="w-full rounded-lg border border-dashed border-emerald-300/80 bg-emerald-50/60
                    py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100/60
                    disabled:opacity-50"
                >
                  {working
                    ? "Añadiendo…"
                    : "Añadir a la señal"}
                </button>
              </div>
            </div>
          ) : null}
          {reservation.prepaymentProofItems.length > 0 &&
          reservation.prepaymentStatus !== "refunded" ? (
            <button
              type="button"
              onClick={() => void handlePrepayment("mark_refunded")}
              disabled={working}
              className="mt-1.5 w-full rounded-lg border border-rose-200/90 bg-rose-100/80 py-1.5
                text-center text-xs font-medium text-rose-900/90
                shadow-sm transition hover:bg-rose-200/50 disabled:opacity-50"
            >
              Marcar devuelto
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-xs text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function NotesPanel({
  reservationId,
  notes,
  canWriteNotes,
  onAdded,
}: {
  reservationId: string;
  notes: ReservationNoteDto[];
  canWriteNotes: boolean;
  onAdded: (n: ReservationNoteDto) => void;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    setError(null);
    try {
      const res = await adminAddNote(reservationId, { body });
      onAdded(res.note);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold">Notas internas</h3>
      <ul className="max-h-40 space-y-2 overflow-y-auto pr-0.5">
        {notes.length === 0 ? (
          <li className="text-xs text-muted">Sin notas.</li>
        ) : (
          notes
            .slice()
            .reverse()
            .map((n) => (
              <li
                key={n.noteId}
                className="rounded-xl border border-border bg-muted/30 p-3 text-sm"
              >
                <p className="whitespace-pre-wrap">{n.body}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {n.createdByDisplayName} ·{" "}
                  {formatRelativeTimestamp(n.createdAt)}
                </p>
              </li>
            ))
        )}
      </ul>
      {canWriteNotes ? (
        <div className="mt-3 space-y-2">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Añadir una nota privada"
            maxLength={2000}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || !draft.trim()}
            className="w-full rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted/30 disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Añadir nota"}
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function formatDateLong(iso: string): string {
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

/**
 * Normaliza un teléfono a dígitos para construir el enlace de WhatsApp.
 * Si empieza por "+" lo quitamos; si no tiene prefijo internacional usamos 34
 * por defecto (España) cuando se detecten 9 dígitos locales.
 */
function toWhatsAppNumber(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return "";
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D+/g, "");
  if (!digits) return "";
  if (hasPlus) return digits;
  if (digits.length === 9) return `34${digits}`;
  return digits;
}

function PrepaymentMessageDialog({
  reservationId,
  message,
  phone,
  email,
  copied,
  onCopied,
  onClose,
}: {
  reservationId: string;
  message: string;
  phone: string;
  email: string;
  copied: boolean;
  onCopied: () => void;
  onClose: () => void;
}) {
  const waNumber = toWhatsAppNumber(phone);
  const waUrl = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`
    : "";

  const [emailStatus, setEmailStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [emailError, setEmailError] = useState<string | null>(null);

  const trimmedEmail = email.trim();

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        const ta = document.createElement("textarea");
        ta.value = message;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      onCopied();
    } catch (err) {
      console.warn("[prepayment-dialog] copy failed", err);
    }
  };

  const handleSendEmail = async () => {
    if (!trimmedEmail || emailStatus === "sending") return;
    setEmailStatus("sending");
    setEmailError(null);
    try {
      const res = await fetch(
        `/api/admin/reservations/${reservationId}/prepayment/remind-email`,
        { method: "POST" },
      );
      if (!res.ok) {
        let msg = "No se pudo enviar el correo.";
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) msg = data.error;
        } catch {
          // ignore body parse errors
        }
        setEmailError(msg);
        setEmailStatus("error");
        return;
      }
      setEmailStatus("sent");
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Error de red");
      setEmailStatus("error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prepay-msg-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="prepay-msg-title" className="text-sm font-semibold">
            Volver a solicitar prepago
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-2 py-0.5 text-xs text-muted hover:bg-muted/40"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          Mensaje predeterminado con los datos de esta reserva. Puedes copiarlo,
          reenviarlo por WhatsApp o enviarlo por correo al cliente.
        </p>
        <textarea
          readOnly
          value={message}
          className="mt-3 h-56 w-full resize-y rounded-xl border border-border bg-muted/20 p-3 text-sm leading-relaxed"
          onFocus={(e) => e.currentTarget.select()}
        />
        {emailStatus === "sent" ? (
          <p
            className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
            role="status"
          >
            Correo enviado a {trimmedEmail}.
          </p>
        ) : null}
        {emailStatus === "error" && emailError ? (
          <p
            className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
            role="alert"
          >
            {emailError}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted/40"
          >
            {copied ? "Copiado ✓" : "Copiar"}
          </button>
          {trimmedEmail ? (
            <button
              type="button"
              onClick={() => void handleSendEmail()}
              disabled={emailStatus === "sending"}
              className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 shadow-sm hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {emailStatus === "sending"
                ? "Enviando…"
                : emailStatus === "sent"
                ? "Reenviar por mail"
                : "Enviar por mail"}
            </button>
          ) : (
            <span className="text-xs text-muted">Sin email para enviar</span>
          )}
          {waUrl ? (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm hover:bg-emerald-100"
            >
              Enviar por WhatsApp
            </a>
          ) : (
            <span className="text-xs text-muted">
              Sin teléfono para WhatsApp
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
