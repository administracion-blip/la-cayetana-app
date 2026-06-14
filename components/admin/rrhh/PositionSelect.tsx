"use client";

import { useState } from "react";
import {
  POSITION_COLORS,
  POSITION_SWATCH_CLASS,
  type PositionColor,
  type RrhhPosition,
} from "@/lib/rrhh/positions";
import { PositionBadge } from "./PositionBadge";

type Props = {
  id?: string;
  value: string;
  onChange: (name: string) => void;
  positions: RrhhPosition[];
  onPositionsChange: (next: RrhhPosition[]) => void;
};

const ADD_VALUE = "__add__";

const SELECT_CLASS =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2";

/**
 * Selector de puesto: desplegable con el catálogo (orden alfabético) y opción
 * para añadir uno nuevo (con su color pastel). El alta requiere permiso de
 * gestión, validado en el endpoint.
 */
export function PositionSelect({
  id,
  value,
  onChange,
  positions,
  onPositionsChange,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<PositionColor>(POSITION_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = positions.find((p) => p.name === value);

  function onSelectChange(next: string) {
    if (next === ADD_VALUE) {
      setError(null);
      setNewName("");
      setAdding(true);
      return;
    }
    onChange(next);
  }

  async function addPosition() {
    const name = newName.trim();
    if (name.length < 2) {
      setError("Escribe un nombre de al menos 2 caracteres");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/rrhh/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: newColor }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; positions?: RrhhPosition[] }
        | null;
      if (!res.ok || !data?.ok || !data.positions) {
        setError(data?.error ?? "No se pudo crear el puesto");
        return;
      }
      onPositionsChange(data.positions);
      const created =
        data.positions.find(
          (p) => p.name.toLowerCase() === name.toLowerCase(),
        ) ?? null;
      onChange(created?.name ?? name);
      setAdding(false);
      setNewName("");
    } catch {
      setError("Error de red al crear el puesto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        id={id}
        value={value}
        onChange={(e) => onSelectChange(e.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">— Sin asignar —</option>
        {positions.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
          </option>
        ))}
        <option value={ADD_VALUE}>➕ Añadir puesto…</option>
      </select>

      {!adding && selected ? <PositionBadge name={selected.name} color={selected.color} /> : null}

      {adding ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre del puesto"
            maxLength={40}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
          />
          <div className="flex flex-wrap gap-1.5">
            {POSITION_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                aria-label={`Color ${c}`}
                className={`h-6 w-6 rounded-full ${POSITION_SWATCH_CLASS[c]} ${
                  newColor === c
                    ? "ring-2 ring-foreground ring-offset-1"
                    : "ring-1 ring-inset ring-black/10"
                }`}
              />
            ))}
          </div>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              disabled={saving}
              className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={addPosition}
              disabled={saving}
              className="rounded-full bg-brand px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {saving ? "Añadiendo…" : "Añadir puesto"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
