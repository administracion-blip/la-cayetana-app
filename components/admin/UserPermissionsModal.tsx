"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserRecord } from "@/types/models";

type SafeUser = Omit<UserRecord, "passwordHash">;

export type UserPermissionsPayload = {
  isAdmin: boolean;
  canValidatePrizes: boolean;
  canManageReservations: boolean;
  canReplyReservationChats: boolean;
  canEditReservationConfig: boolean;
  canManageReservationDocuments: boolean;
  canWriteReservationNotes: boolean;
};

const ALL_OFF: UserPermissionsPayload = {
  isAdmin: false,
  canValidatePrizes: false,
  canManageReservations: false,
  canReplyReservationChats: false,
  canEditReservationConfig: false,
  canManageReservationDocuments: false,
  canWriteReservationNotes: false,
};

export function userToPermissionsPayload(u: SafeUser): UserPermissionsPayload {
  return {
    isAdmin: u.isAdmin === true,
    canValidatePrizes: u.canValidatePrizes === true,
    canManageReservations: u.canManageReservations === true,
    canReplyReservationChats: u.canReplyReservationChats === true,
    canEditReservationConfig: u.canEditReservationConfig === true,
    canManageReservationDocuments: u.canManageReservationDocuments === true,
    canWriteReservationNotes: u.canWriteReservationNotes === true,
  };
}

const ROW_META: Record<
  keyof UserPermissionsPayload,
  { label: string; hint: string; needsActive?: boolean }
> = {
  isAdmin: {
    label: "Acceso al panel de administración",
    hint: "Socios, registro, reservas (según el resto de permisos), etc.",
  },
  canValidatePrizes: {
    label: "Validador de canjes (taquilla)",
    hint: "Muestra el carnet para validar un premio de la ruleta.",
    needsActive: true,
  },
  canManageReservations: {
    label: "Gestionar reservas",
    hint: "Tablero, estados, reprogramar, anular.",
  },
  canReplyReservationChats: {
    label: "Responder en chats de reservas",
    hint: "Escribir al cliente y adjuntar documentos.",
  },
  canEditReservationConfig: {
    label: "Editar configuración de reservas",
    hint: "Horarios, slots, plantilla de prepago.",
  },
  canManageReservationDocuments: {
    label: "Gestionar documentos (menús, PDFs)",
    hint: "Subir o sustituir cartas y documentos.",
  },
  canWriteReservationNotes: {
    label: "Notas internas en reservas",
    hint: "Solo visibles para el equipo.",
  },
};

const PERMISSION_SECTIONS: {
  id: string;
  title: string;
  subtitle?: string;
  keys: (keyof UserPermissionsPayload)[];
}[] = [
  { id: "general", title: "General", keys: ["isAdmin"] },
  {
    id: "ruleta",
    title: "Ruleta",
    subtitle: "Validación de premios en caseta",
    keys: ["canValidatePrizes"],
  },
  {
    id: "reservas",
    title: "Reservas",
    subtitle: "Módulo de mesas y menús",
    keys: [
      "canManageReservations",
      "canReplyReservationChats",
      "canEditReservationConfig",
      "canManageReservationDocuments",
      "canWriteReservationNotes",
    ],
  },
];

type Props = {
  user: SafeUser;
  onClose: () => void;
  onSaved: (u: SafeUser) => void;
};

export function UserPermissionsModal({ user, onClose, onSaved }: Props) {
  const [form, setForm] = useState<UserPermissionsPayload>(() =>
    userToPermissionsPayload(user),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setForm(userToPermissionsPayload(user));
    setErr(null);
  }, [user]);

  const active = user.status === "active";

  const allOn = useCallback((): UserPermissionsPayload => {
    return {
      isAdmin: true,
      canValidatePrizes: active,
      canManageReservations: true,
      canReplyReservationChats: true,
      canEditReservationConfig: true,
      canManageReservationDocuments: true,
      canWriteReservationNotes: true,
    };
  }, [active]);

  const setSection = useCallback(
    (keys: (keyof UserPermissionsPayload)[], value: boolean) => {
      setForm((prev) => {
        if (!value && keys.length === 1 && keys[0] === "isAdmin") {
          return { ...ALL_OFF };
        }
        const next: UserPermissionsPayload = { ...prev };
        for (const k of keys) {
          if (k === "canValidatePrizes" && value && !active) {
            continue;
          }
          next[k] = value;
        }
        return next;
      });
    },
    [active],
  );

  const toggle = (key: keyof UserPermissionsPayload) => {
    setForm((prev) => {
      if (key === "isAdmin") {
        if (prev.isAdmin) {
          return { ...ALL_OFF };
        }
        return { ...prev, isAdmin: true };
      }
      return { ...prev, [key]: !prev[key] };
    });
  };

  const handleSave = async () => {
    if (!active && form.canValidatePrizes) {
      setErr("El validador de canjes solo aplica a socios activos.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(user.id)}/permissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; issues?: unknown }
        | null;
      if (!res.ok || !data?.ok) {
        setErr(
          typeof data?.error === "string" ? data.error : "No se pudo guardar",
        );
        return;
      }
      onSaved({
        ...user,
        ...form,
        canValidatePrizes: form.canValidatePrizes ? true : undefined,
        canManageReservations: form.canManageReservations ? true : undefined,
        canReplyReservationChats: form.canReplyReservationChats
          ? true
          : undefined,
        canEditReservationConfig: form.canEditReservationConfig
          ? true
          : undefined,
        canManageReservationDocuments: form.canManageReservationDocuments
          ? true
          : undefined,
        canWriteReservationNotes: form.canWriteReservationNotes
          ? true
          : undefined,
        isAdmin: form.isAdmin ? true : undefined,
      } satisfies SafeUser);
      onClose();
    } catch {
      setErr("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Permisos de ${user.name}`}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[min(90dvh,820px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-card shadow-xl"
      >
        <header className="shrink-0 border-b border-border px-4 py-3">
          <p className="text-[11px] font-medium uppercase text-muted">
            Permisos
          </p>
          <h2 className="text-base font-semibold text-foreground">
            {user.name}
          </h2>
          <p className="mt-0.5 font-mono text-xs text-muted">
            {user.membershipId ?? "—"} · {user.email}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setErr(null);
                setForm(allOn());
              }}
              disabled={saving}
              className="rounded-full border border-border bg-white px-3 py-1 text-[11px] font-medium text-foreground hover:bg-zinc-50 disabled:opacity-50"
            >
              Activar todo
            </button>
            <button
              type="button"
              onClick={() => {
                setErr(null);
                setForm({ ...ALL_OFF });
              }}
              disabled={saving}
              className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50"
            >
              Quitar todo
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="mb-3 text-xs leading-snug text-muted">
            <strong>General</strong> cubre el acceso al panel.{" "}
            <strong>Reservas</strong> aplica si tiene permisos o es admin (según
            la lógica del sistema). El validador de <strong>Ruleta</strong>{" "}
            solo para socios <strong>activos</strong>.
          </p>

          {PERMISSION_SECTIONS.map((section) => {
            return (
              <section key={section.id} className="mb-4 last:mb-0">
                <div className="mb-2 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                      {section.title}
                    </h3>
                    {section.subtitle ? (
                      <p className="text-[11px] text-muted">
                        {section.subtitle}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={saving || (section.id === "ruleta" && !active)}
                      onClick={() => {
                        setErr(null);
                        if (section.id === "ruleta" && !active) return;
                        setSection(section.keys, true);
                      }}
                      className="rounded-md border border-border bg-white px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={
                        section.id === "ruleta" && !active
                          ? "Solo socios activos"
                          : "Marcar todos en esta categoría"
                      }
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setErr(null);
                        setSection(section.keys, false);
                      }}
                      className="rounded-md border border-border bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-zinc-100"
                    >
                      Ninguno
                    </button>
                  </div>
                </div>
                <ul className="space-y-2">
                  {section.keys.map((key) => {
                    const meta = ROW_META[key];
                    const on = form[key];
                    const disabled = meta.needsActive && !active;
                    return (
                      <li
                        key={key}
                        className="rounded-lg border border-border bg-background p-2.5"
                      >
                        <label className="flex cursor-pointer items-start gap-2.5">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-3.5 w-3.5 accent-brand"
                            checked={on}
                            disabled={disabled || saving}
                            onChange={() => {
                              if (!disabled) toggle(key);
                            }}
                          />
                          <span className="min-w-0">
                            <span className="text-xs font-medium text-foreground">
                              {meta.label}
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                              {meta.hint}
                            </span>
                            {disabled ? (
                              <span className="mt-0.5 block text-[10px] text-amber-700">
                                Solo si el socio está <strong>activo</strong>.
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <footer className="shrink-0 border-t border-border bg-zinc-50 px-4 py-3">
          {err ? (
            <p className="mb-2 text-sm text-rose-700" role="alert">
              {err}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar permisos"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
