"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type DocItem = {
  docId: string;
  side: "front" | "back";
  contentType: string;
  uploadedAt: string;
  source: "onboarding" | "staff";
};

type Props = {
  userId: string;
  initialDocuments: DocItem[];
};

const SIDE_LABEL: Record<DocItem["side"], string> = {
  front: "Anverso",
  back: "Reverso",
};

export function WorkerDocumentsManager({ userId, initialDocuments }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [side, setSide] = useState<"front" | "back">("front");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const base = `/api/admin/rrhh/workers/${userId}/documents`;

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Selecciona un archivo");
      return;
    }
    const fd = new FormData();
    fd.append("side", side);
    fd.append("file", file);

    setBusy(true);
    try {
      const res = await fetch(base, { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "No se pudo subir el documento");
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(docId: string) {
    setError(null);
    setDeletingId(docId);
    try {
      const res = await fetch(`${base}/${docId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "No se pudo borrar el documento");
        return;
      }
      router.refresh();
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="mb-1 text-base font-semibold">Documentos (DNI)</h2>
      <p className="mb-4 text-xs text-muted">
        Solo visible para gestores de RRHH. Cada visualización queda
        registrada.
      </p>

      {initialDocuments.length === 0 ? (
        <p className="mb-4 text-sm text-muted">
          No hay documentos subidos todavía.
        </p>
      ) : (
        <ul className="mb-4 grid gap-4 sm:grid-cols-2">
          {initialDocuments.map((d) => {
            const url = `${base}/${d.docId}`;
            const isImage = d.contentType.startsWith("image/");
            return (
              <li
                key={d.docId}
                className="flex flex-col gap-2 rounded-xl border border-border p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {SIDE_LABEL[d.side]}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDelete(d.docId)}
                    disabled={deletingId === d.docId}
                    className="text-xs text-red-600 hover:underline disabled:opacity-60"
                  >
                    {deletingId === d.docId ? "Borrando…" : "Borrar"}
                  </button>
                </div>
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={`DNI ${SIDE_LABEL[d.side]}`}
                    className="max-h-48 w-full rounded-lg border border-border object-contain"
                  />
                ) : (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-brand underline"
                  >
                    Abrir documento
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={onUpload}
        className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end"
      >
        <div>
          <label htmlFor="doc-side" className="mb-1 block text-sm font-medium">
            Cara
          </label>
          <select
            id="doc-side"
            value={side}
            onChange={(e) => setSide(e.target.value as "front" | "back")}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
          >
            <option value="front">Anverso</option>
            <option value="back">Reverso</option>
          </select>
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="doc-file" className="mb-1 block text-sm font-medium">
            Archivo (JPG/PNG/WEBP/PDF, máx. 8 MB)
          </label>
          <input
            id="doc-file"
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-brand file:px-4 file:py-2 file:text-white"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {busy ? "Subiendo…" : "Subir"}
        </button>
      </form>

      {error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
