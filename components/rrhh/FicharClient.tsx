"use client";

import { useCallback, useEffect, useState } from "react";

type Props = { token: string; workerName: string };

type StatusState =
  | { phase: "loading" }
  | {
      phase: "ready";
      tokenValid: boolean;
      open: boolean;
      lastClockInAt: string | null;
    }
  | { phase: "error"; message: string };

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDuration(fromIso: string): string {
  const mins = Math.max(
    0,
    Math.floor((Date.now() - new Date(fromIso).getTime()) / 60000),
  );
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}

export function FicharClient({ token, workerName }: Props) {
  const [status, setStatus] = useState<StatusState>({ phase: "loading" });
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ action: "in" | "out"; at: string } | null>(
    null,
  );

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/rrhh/clock/status?t=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            tokenValid?: boolean;
            open?: boolean;
            lastClockInAt?: string | null;
            error?: string;
          }
        | null;
      if (!res.ok || !data?.ok) {
        setStatus({
          phase: "error",
          message: data?.error ?? "No se pudo comprobar tu estado de fichaje.",
        });
        return;
      }
      setStatus({
        phase: "ready",
        tokenValid: Boolean(data.tokenValid),
        open: Boolean(data.open),
        lastClockInAt: data.lastClockInAt ?? null,
      });
    } catch {
      setStatus({
        phase: "error",
        message: "Error de red al comprobar tu estado.",
      });
    }
  }, [token]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function submit() {
    if (status.phase !== "ready") return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/rrhh/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          comment: status.open ? comment.trim() || undefined : undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; action?: "in" | "out"; at?: string; error?: string }
        | null;
      if (!res.ok || !data?.ok || !data.action || !data.at) {
        setError(data?.error ?? "No se pudo registrar el fichaje");
        return;
      }
      setDone({ action: data.action, at: data.at });
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center text-sm text-emerald-900 shadow-sm">
        <p className="text-lg font-semibold">
          {done.action === "in" ? "Entrada registrada" : "Salida registrada"}
        </p>
        <p className="mt-1">{workerName}</p>
        <p className="mt-1 text-2xl font-semibold">{fmtTime(done.at)}</p>
      </div>
    );
  }

  if (status.phase === "loading") {
    return (
      <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted shadow-sm">
        Comprobando tu estado…
      </div>
    );
  }

  if (status.phase === "error") {
    return (
      <div className="mx-auto w-full max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm">
        {status.message}
      </div>
    );
  }

  if (!token || !status.tokenValid) {
    return (
      <div className="mx-auto w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900 shadow-sm">
        <p className="font-semibold">Escanea el QR del terminal</p>
        <p className="mt-1">
          {token
            ? "El código ha caducado. Vuelve a escanear el QR de la pantalla."
            : "Abre este enlace escaneando el QR del terminal de fichaje."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="text-center">
        <p className="text-sm text-muted">Hola,</p>
        <p className="text-lg font-semibold">{workerName}</p>
      </div>

      {status.open ? (
        <>
          <div className="rounded-xl border border-brand/30 bg-brand/5 p-3 text-center text-sm">
            Tienes un turno abierto
            {status.lastClockInAt ? (
              <>
                {" "}desde las {fmtTime(status.lastClockInAt)}. Llevas{" "}
                <span className="font-semibold">
                  {fmtDuration(status.lastClockInAt)}
                </span>
              </>
            ) : null}
            .
          </div>
          <div>
            <label
              htmlFor="incident"
              className="mb-1 block text-sm font-semibold text-foreground"
            >
              Incidencia (opcional)
            </label>
            <textarea
              id="incident"
              rows={3}
              maxLength={300}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Anota aquí cualquier incidencia del turno…"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none ring-brand focus:ring-2"
            />
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-background p-3 text-center text-sm text-muted">
          No tienes ningún turno abierto.
        </div>
      )}

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="rounded-full bg-brand py-3 text-[15px] font-medium text-white hover:bg-brand-hover disabled:opacity-60"
      >
        {submitting
          ? "Registrando…"
          : status.open
            ? "Fichar salida"
            : "Fichar entrada"}
      </button>
    </div>
  );
}
