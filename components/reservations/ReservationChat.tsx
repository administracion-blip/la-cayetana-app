"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatRelativeTimestamp } from "@/components/reservations/formatters";
import type { ReservationMessageDto } from "@/lib/serialization/reservations";

interface Props {
  messages: ReservationMessageDto[];
  onSend: (body: string) => Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
}

export function ReservationChat({
  messages,
  onSend,
  disabled,
  disabledReason,
}: Props) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar");
    } finally {
      setSending(false);
    }
  }, [draft, sending, disabled, onSend]);

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-xl border border-border bg-muted/20 p-3">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">
            Aún no hay mensajes. Si tienes dudas, escribe al equipo.
          </p>
        ) : (
          messages.map((m) => (
            <ChatBubble key={m.messageId} message={m} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
      {disabled ? (
        <p className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted">
          {disabledReason ?? "Chat no disponible."}
        </p>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-xl border border-border px-3 py-2 text-sm"
            placeholder="Escribe un mensaje"
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
      )}
      {error ? (
        <p className="text-xs text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ChatBubble({ message }: { message: ReservationMessageDto }) {
  const isMine = message.authorType === "customer";
  const isSystem = message.authorType === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <p className="max-w-[80%] rounded-full bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground">
          {message.body}
        </p>
      </div>
    );
  }

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          isMine
            ? "rounded-br-sm bg-brand text-white"
            : "rounded-bl-sm bg-white"
        }`}
      >
        {!isMine ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">
            {message.authorDisplayName}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap">{message.body}</p>
        <p
          className={`mt-1 text-[10px] ${
            isMine ? "text-white/70" : "text-muted"
          }`}
        >
          {formatRelativeTimestamp(message.createdAt)}
        </p>
      </div>
    </div>
  );
}
