"use client";

import { useMemo, useState } from "react";
import type { SafeUser } from "./AdminUsersClient";
import { MAX_BIRTH_YEAR, MIN_BIRTH_YEAR } from "@/lib/validation";

type Props = {
  user: SafeUser;
  onClose: () => void;
  onSaved: (updated: {
    id: string;
    name: string;
    phone: string | null;
    sex: SafeUser["sex"] | null;
    birthYear: number | null;
    paidAmount: number | null;
    paidAt: string | null;
  }) => void;
};

/** Pasa un ISO 8601 a `YYYY-MM-DD` para `<input type="date">` (zona local). */
function isoToDateInputValue(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Modal para editar la ficha de un socio (nombre, teléfono, sexo, año).
 * El email y los permisos se editan por flujos separados.
 */
export function EditUserProfileModal({ user, onClose, onSaved }: Props) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [sex, setSex] = useState<"" | "male" | "female" | "prefer_not_to_say">(
    (user.sex as "" | "male" | "female" | "prefer_not_to_say") ?? "",
  );
  const [birthYear, setBirthYear] = useState<string>(
    user.birthYear ? String(user.birthYear) : "",
  );
  const [paidAmount, setPaidAmount] = useState<string>(
    typeof user.paidAmount === "number" ? String(user.paidAmount) : "",
  );
  const [paidAtDate, setPaidAtDate] = useState<string>(
    isoToDateInputValue(user.paidAt),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = useMemo(
    () =>
      Array.from(
        { length: MAX_BIRTH_YEAR - MIN_BIRTH_YEAR + 1 },
        (_, i) => MAX_BIRTH_YEAR - i,
      ),
    [],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = { name: name.trim() };
      const trimmedPhone = phone.trim();
      if ((user.phone ?? "") !== trimmedPhone) {
        body.phone = trimmedPhone === "" ? null : trimmedPhone;
      }
      if ((user.sex ?? "") !== sex) {
        body.sex = sex === "" ? null : sex;
      }
      const newYear = birthYear ? Number(birthYear) : null;
      if ((user.birthYear ?? null) !== newYear) {
        body.birthYear = newYear;
      }
      const trimmedPaidAmount = paidAmount.trim().replace(",", ".");
      let nextPaidAmount: number | null;
      if (trimmedPaidAmount === "") {
        nextPaidAmount = null;
      } else {
        const parsed = Number(trimmedPaidAmount);
        if (!Number.isFinite(parsed) || parsed < 0) {
          setError("Importe pagado no válido");
          setLoading(false);
          return;
        }
        // Redondeo a céntimos para no propagar artefactos de coma flotante.
        nextPaidAmount = Math.round(parsed * 100) / 100;
      }
      const currentPaidAmount =
        typeof user.paidAmount === "number" ? user.paidAmount : null;
      if (currentPaidAmount !== nextPaidAmount) {
        body.paidAmountEuros = nextPaidAmount;
      }
      const currentPaidAtDate = isoToDateInputValue(user.paidAt);
      if (currentPaidAtDate !== paidAtDate) {
        body.paidAt = paidAtDate === "" ? null : paidAtDate;
      }
      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(user.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            user?: {
              id: string;
              name: string;
              phone: string | null;
              sex: SafeUser["sex"] | null;
              birthYear: number | null;
              paidAmount: number | null;
              paidAt: string | null;
            };
          }
        | null;
      if (!res.ok || !data?.ok || !data.user) {
        setError(data?.error ?? "No se pudo guardar la ficha");
        return;
      }
      onSaved(data.user);
    } catch {
      setError("Error de red al guardar la ficha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-user-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <div>
          <h2
            id="edit-user-title"
            className="text-lg font-semibold text-foreground"
          >
            Editar ficha de {user.name}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Email <span className="font-mono">{user.email}</span>. El email y la
            contraseña se cambian por flujos separados.
          </p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <label
              className="mb-1 block text-sm font-medium text-foreground"
              htmlFor="edit-name"
            >
              Nombre completo
            </label>
            <input
              id="edit-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
            />
          </div>
          <div>
            <label
              className="mb-1 block text-sm font-medium text-foreground"
              htmlFor="edit-phone"
            >
              Teléfono
            </label>
            <input
              id="edit-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
            />
            <p className="mt-1 text-xs text-muted">
              Déjalo vacío para borrar el teléfono.
            </p>
          </div>
          <div>
            <label
              className="mb-1 block text-sm font-medium text-foreground"
              htmlFor="edit-sex"
            >
              Sexo
            </label>
            <select
              id="edit-sex"
              value={sex}
              onChange={(e) =>
                setSex(
                  e.target.value as
                    | ""
                    | "male"
                    | "female"
                    | "prefer_not_to_say",
                )
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
            >
              <option value="">— Sin especificar —</option>
              <option value="male">Hombre</option>
              <option value="female">Mujer</option>
              <option value="prefer_not_to_say">Prefiere no decirlo</option>
            </select>
          </div>
          <div>
            <label
              className="mb-1 block text-sm font-medium text-foreground"
              htmlFor="edit-birth-year"
            >
              Año de nacimiento
            </label>
            <select
              id="edit-birth-year"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
            >
              <option value="">— Sin especificar —</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                className="mb-1 block text-sm font-medium text-foreground"
                htmlFor="edit-paid-amount"
              >
                Importe pagado (€)
              </label>
              <input
                id="edit-paid-amount"
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
              />
              <p className="mt-1 text-xs text-muted">
                Vacío para borrar el importe.
              </p>
            </div>
            <div>
              <label
                className="mb-1 block text-sm font-medium text-foreground"
                htmlFor="edit-paid-at"
              >
                Fecha de pago
              </label>
              <input
                id="edit-paid-at"
                type="date"
                value={paidAtDate}
                onChange={(e) => setPaidAtDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
              />
              <p className="mt-1 text-xs text-muted">
                Vacío para borrar la fecha.
              </p>
            </div>
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {loading ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
