"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type ImportMode = "admin" | "legacy";

export function AdminExcelActions() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>("admin");

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent | PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setMessage(null);
    setError(null);

    const endpoint =
      mode === "legacy"
        ? "/api/admin/import/legacy/excel"
        : "/api/admin/import/excel";

    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(endpoint, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        updated?: number;
        created?: number;
        errors?: { row: number; message: string }[];
      };

      if (!res.ok) {
        setError(data.error ?? "Error al importar");
        return;
      }

      setMessage(data.message ?? "Importación completada.");
      if (data.errors?.length) {
        setError(
          data.errors
            .slice(0, 8)
            .map((x) => `Fila ${x.row}: ${x.message}`)
            .join("\n") +
            (data.errors.length > 8
              ? `\n…y ${data.errors.length - 8} más`
              : ""),
        );
      }
      router.refresh();
    } catch {
      setError("No se pudo subir el archivo.");
    } finally {
      setBusy(false);
    }
  }

  function startImport(nextMode: ImportMode) {
    setMode(nextMode);
    setOpen(false);
    // Forzamos que el cambio de `mode` esté aplicado antes del click.
    setTimeout(() => inputRef.current?.click(), 0);
  }

  return (
    <div className="flex flex-col gap-3">
      <div ref={containerRef} className="relative inline-flex">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={onFile}
          disabled={busy}
        />
        <button
          type="button"
          disabled={busy}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls="excel-menu"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
        >
          {busy ? "Importando…" : "Excel"}
          <span
            className={`inline-block transition ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            <svg
              className="h-4 w-4 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </span>
        </button>

        {open ? (
          <div
            id="excel-menu"
            role="menu"
            className="absolute right-0 top-full z-30 mt-1 min-w-[13rem] overflow-hidden rounded-xl border border-border bg-white py-1 shadow-lg"
          >
            <a
              href="/api/admin/export/excel"
              role="menuitem"
              download
              className="block px-4 py-2.5 text-sm text-foreground hover:bg-zinc-50"
              onClick={() => setOpen(false)}
            >
              Exportar a Excel
            </a>
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              className="block w-full px-4 py-2.5 text-left text-sm hover:bg-zinc-50 disabled:opacity-60"
              onClick={() => startImport("admin")}
            >
              Importar desde Excel
            </button>
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              className="block w-full px-4 py-2.5 text-left text-sm hover:bg-zinc-50 disabled:opacity-60"
              onClick={() => startImport("legacy")}
              title="Alta masiva de socios anteriores (CY0001–CY0999)"
            >
              Importar socios anteriores (legacy)
            </button>
          </div>
        ) : null}
      </div>

      {message ? (
        <p className="text-sm text-emerald-800" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="whitespace-pre-wrap text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
