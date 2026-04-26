"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserRecord } from "@/types/models";

type SafeUser = Omit<UserRecord, "passwordHash">;

export type UserPermissionsPayload = {
  canValidatePrizes: boolean;
  canEditRouletteConfig: boolean;
  canViewRouletteOps: boolean;
  canManageReservations: boolean;
  canReplyReservationChats: boolean;
  canEditReservationConfig: boolean;
  canManageReservationDocuments: boolean;
  canWriteReservationNotes: boolean;
  canEditUserPermissions: boolean;
  canAccessAdmin: boolean;
  canAccessAdminSocios: boolean;
  canManageSociosActions: boolean;
  canInviteSocios: boolean;
  canEditSociosProfile: boolean;
  canDeactivateSocios: boolean;
  canAccessAdminReservas: boolean;
  canAccessAdminProgramacion: boolean;
};

const ALL_OFF: UserPermissionsPayload = {
  canValidatePrizes: false,
  canEditRouletteConfig: false,
  canViewRouletteOps: false,
  canManageReservations: false,
  canReplyReservationChats: false,
  canEditReservationConfig: false,
  canManageReservationDocuments: false,
  canWriteReservationNotes: false,
  canEditUserPermissions: false,
  canAccessAdmin: false,
  canAccessAdminSocios: false,
  canManageSociosActions: false,
  canInviteSocios: false,
  canEditSociosProfile: false,
  canDeactivateSocios: false,
  canAccessAdminReservas: false,
  canAccessAdminProgramacion: false,
};

export function userToPermissionsPayload(u: SafeUser): UserPermissionsPayload {
  return {
    canValidatePrizes: u.canValidatePrizes === true,
    canEditRouletteConfig: u.canEditRouletteConfig === true,
    canViewRouletteOps: u.canViewRouletteOps === true,
    canManageReservations: u.canManageReservations === true,
    canReplyReservationChats: u.canReplyReservationChats === true,
    canEditReservationConfig: u.canEditReservationConfig === true,
    canManageReservationDocuments: u.canManageReservationDocuments === true,
    canWriteReservationNotes: u.canWriteReservationNotes === true,
    canEditUserPermissions: u.canEditUserPermissions === true,
    canAccessAdmin: u.canAccessAdmin === true,
    canAccessAdminSocios: u.canAccessAdminSocios === true,
    canManageSociosActions: u.canManageSociosActions === true,
    canInviteSocios: u.canInviteSocios === true,
    canEditSociosProfile: u.canEditSociosProfile === true,
    canDeactivateSocios: u.canDeactivateSocios === true,
    canAccessAdminReservas: u.canAccessAdminReservas === true,
    canAccessAdminProgramacion: u.canAccessAdminProgramacion === true,
  };
}

const ROW_META: Record<
  keyof UserPermissionsPayload,
  { label: string; hint: string; needsActive?: boolean }
> = {
  canAccessAdmin: {
    label: "Acceso al panel de administración",
    hint: "Permite ver el hub /admin. Las tarjetas que aparezcan dependen del resto de permisos.",
  },
  canEditUserPermissions: {
    label: "Editar permisos de socios",
    hint: "Llave maestra del backoffice: puede entrar a Socios y cambiar cualquier permiso (incluido el suyo) desde este modal.",
  },
  canAccessAdminSocios: {
    label: "Acceso a Administración · Socios",
    hint: "Entra a /admin/users (listado, búsqueda, escaneo). Las acciones (activar, entrega, Excel) requieren además el flag de gestión.",
  },
  canManageSociosActions: {
    label: "Acciones sobre socios",
    hint: "Activar/renovar, marcar como entregado y deshacer entrega, importar y exportar Excel.",
  },
  canInviteSocios: {
    label: "Invitar nuevos socios",
    hint: "Envía invitaciones por email para dar de alta socios sin pasar por Stripe.",
  },
  canEditSociosProfile: {
    label: "Editar ficha de socios",
    hint: "Permite cambiar nombre, teléfono, sexo y año de nacimiento. El email y la contraseña tienen flujos propios.",
  },
  canDeactivateSocios: {
    label: "Dar de baja socios",
    hint: "Cambia el estado del socio a inactivo (baja lógica). El registro se conserva para poder reactivarlo.",
  },
  canAccessAdminReservas: {
    label: "Acceso a Administración · Reservas",
    hint: "Entra al tablero de reservas. Las acciones siguen dependiendo de los permisos del propio módulo.",
  },
  canAccessAdminProgramacion: {
    label: "Acceso a Administración · Programación",
    hint: "Crea y edita los eventos del feed.",
  },
  canValidatePrizes: {
    label: "Validador de canjes (taquilla)",
    hint: "Muestra el carnet para validar un premio de la ruleta.",
    needsActive: true,
  },
  canEditRouletteConfig: {
    label: "Configurar la ruleta",
    hint: "Acceso a /admin/roulette/config: temporada, horarios, stock, probabilidades y consolación.",
  },
  canViewRouletteOps: {
    label: "Ver registro de la ruleta",
    hint: "Solo lectura: tiradas, premios y rascas por jornada en /admin/roulette. No permite editar la configuración ni mutar premios.",
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
  {
    id: "general",
    title: "Acceso al backoffice",
    subtitle: "Puerta del panel y permisos por sección",
    keys: [
      "canAccessAdmin",
      "canEditUserPermissions",
      "canAccessAdminSocios",
      "canManageSociosActions",
      "canInviteSocios",
      "canEditSociosProfile",
      "canDeactivateSocios",
      "canAccessAdminReservas",
      "canAccessAdminProgramacion",
    ],
  },
  {
    id: "ruleta",
    title: "Ruleta",
    subtitle:
      "Validación en caseta, registro de operación y configuración global",
    keys: [
      "canValidatePrizes",
      "canViewRouletteOps",
      "canEditRouletteConfig",
    ],
  },
  {
    id: "reservas",
    title: "Reservas",
    subtitle: "Permisos dentro del módulo de reservas",
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

  const allOn = useCallback(
    (): UserPermissionsPayload => ({
      canValidatePrizes: active,
      canEditRouletteConfig: true,
      canViewRouletteOps: true,
      canManageReservations: true,
      canReplyReservationChats: true,
      canEditReservationConfig: true,
      canManageReservationDocuments: true,
      canWriteReservationNotes: true,
      canEditUserPermissions: true,
      canAccessAdmin: true,
      canAccessAdminSocios: true,
      canManageSociosActions: true,
      canInviteSocios: true,
      canEditSociosProfile: true,
      canDeactivateSocios: true,
      canAccessAdminReservas: true,
      canAccessAdminProgramacion: true,
    }),
    [active],
  );

  const setSection = useCallback(
    (keys: (keyof UserPermissionsPayload)[], value: boolean) => {
      setForm((prev) => {
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
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
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
      const flagOrUndef = (b: boolean) => (b ? true : undefined);
      onSaved({
        ...user,
        canValidatePrizes: flagOrUndef(form.canValidatePrizes),
        canEditRouletteConfig: flagOrUndef(form.canEditRouletteConfig),
        canViewRouletteOps: flagOrUndef(form.canViewRouletteOps),
        canManageReservations: flagOrUndef(form.canManageReservations),
        canReplyReservationChats: flagOrUndef(form.canReplyReservationChats),
        canEditReservationConfig: flagOrUndef(form.canEditReservationConfig),
        canManageReservationDocuments: flagOrUndef(
          form.canManageReservationDocuments,
        ),
        canWriteReservationNotes: flagOrUndef(form.canWriteReservationNotes),
        canEditUserPermissions: flagOrUndef(form.canEditUserPermissions),
        canAccessAdmin: flagOrUndef(form.canAccessAdmin),
        canAccessAdminSocios: flagOrUndef(form.canAccessAdminSocios),
        canManageSociosActions: flagOrUndef(form.canManageSociosActions),
        canInviteSocios: flagOrUndef(form.canInviteSocios),
        canEditSociosProfile: flagOrUndef(form.canEditSociosProfile),
        canDeactivateSocios: flagOrUndef(form.canDeactivateSocios),
        canAccessAdminReservas: flagOrUndef(form.canAccessAdminReservas),
        canAccessAdminProgramacion: flagOrUndef(
          form.canAccessAdminProgramacion,
        ),
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
          {user.isAdmin ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-900">
              Esta cuenta tiene <strong>isAdmin</strong> (legado): equivale a
              tener todos los permisos. Edita los flags concretos abajo y, si
              quieres dejar de depender de <code>isAdmin</code>, retíralo desde
              la base de datos.
            </p>
          ) : null}
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
            Cada permiso es independiente. <strong>Acceso al panel</strong> da
            entrada al hub; los flags por sección abren cada apartado.{" "}
            <strong>Acciones sobre socios</strong> habilita activar, entregas y
            Excel. <strong>Editar permisos</strong> es la llave maestra. En{" "}
            <strong>Ruleta</strong>, el validador solo aplica a socios{" "}
            <strong>activos</strong>; configurar la ruleta es independiente.
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
                      disabled={saving}
                      onClick={() => {
                        setErr(null);
                        setSection(section.keys, true);
                      }}
                      className="rounded-md border border-border bg-white px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Marcar todos en esta categoría"
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
