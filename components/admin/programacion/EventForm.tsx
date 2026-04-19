"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EventRecord } from "@/types/models";

type Props = {
  /** Si se pasa, el formulario edita ese evento (PATCH). Si no, crea (POST). */
  initial?: EventRecord;
};

/**
 * Convierte un ISO UTC (el que tenemos en Dynamo) a valor compatible con
 * `<input type="datetime-local">` en zona local del navegador.
 */
function isoToLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventForm({ initial }: Props) {
  const router = useRouter();
  const isEdit = !!initial;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [startAt, setStartAt] = useState<string>(
    isoToLocalInput(initial?.startAt),
  );
  const [published, setPublished] = useState<boolean>(
    initial?.published ?? false,
  );
  const [showAsPopup, setShowAsPopup] = useState<boolean>(
    initial?.showAsPopup ?? false,
  );
  const [imageKey, setImageKey] = useState<string>(initial?.imageKey ?? "");
  const [imageContentType, setImageContentType] = useState<string>(
    initial?.imageContentType ?? "",
  );
  const [previewUrl, setPreviewUrl] = useState<string>(
    initial?.imageKey
      ? `/api/programacion/image?key=${encodeURIComponent(initial.imageKey)}`
      : "",
  );

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/admin/programacion/upload", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; key?: string; contentType?: string; error?: string }
        | null;
      if (!res.ok || !data?.ok || !data.key) {
        setError(data?.error ?? "No se pudo subir la imagen");
        return;
      }
      setImageKey(data.key);
      setImageContentType(data.contentType ?? "");
      setPreviewUrl(
        `/api/programacion/image?key=${encodeURIComponent(data.key)}&t=${Date.now()}`,
      );
    } catch (err) {
      console.error(err);
      setError("Error de red al subir la imagen");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!imageKey) {
      setError("Sube una imagen antes de guardar");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim(),
        // El input `datetime-local` da "YYYY-MM-DDTHH:mm"; al pasarlo a new Date
        // se interpreta como hora local y luego se convierte a ISO UTC.
        startAt: new Date(startAt).toISOString(),
        imageKey,
        imageContentType: imageContentType || undefined,
        published,
        showAsPopup,
      };
      const res = await fetch(
        isEdit
          ? `/api/admin/programacion/${encodeURIComponent(initial!.id)}`
          : "/api/admin/programacion",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "No se pudo guardar");
        return;
      }
      router.push("/admin/programacion");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!initial) return;
    if (!window.confirm(`¿Eliminar el evento "${initial.title}"?`)) return;
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/programacion/${encodeURIComponent(initial.id)}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "No se pudo eliminar");
        return;
      }
      router.push("/admin/programacion");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Error de red al eliminar");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <div>
        <label className="mb-1.5 block text-sm font-semibold" htmlFor="title">
          Título
        </label>
        <input
          id="title"
          type="text"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-[15px] outline-none ring-brand focus:ring-2"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold" htmlFor="startAt">
          Fecha y hora
        </label>
        <input
          id="startAt"
          type="datetime-local"
          required
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-[15px] outline-none ring-brand focus:ring-2"
        />
        <p className="mt-1 text-xs text-muted">
          Se guarda en hora local del navegador y se convierte a UTC en el
          servidor.
        </p>
      </div>

      <div>
        <label
          className="mb-1.5 block text-sm font-semibold"
          htmlFor="description"
        >
          Descripción
        </label>
        <textarea
          id="description"
          required
          maxLength={2000}
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full resize-y rounded-xl border border-border bg-background px-4 py-2.5 text-[15px] outline-none ring-brand focus:ring-2"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold">Imagen</label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex h-40 w-full max-w-[240px] items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-zinc-50">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Vista previa"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs text-muted">Sin imagen</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-border bg-white px-5 py-2 text-sm font-medium hover:bg-zinc-50">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={onFile}
                disabled={uploading}
              />
              {uploading
                ? "Subiendo…"
                : imageKey
                  ? "Reemplazar imagen"
                  : "Subir imagen"}
            </label>
            <p className="text-xs text-muted">
              JPG, PNG, WEBP o GIF. Máximo 5 MB.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="inline-flex select-none items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          <span>Publicar en el feed</span>
        </label>
        <label className="inline-flex select-none items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={showAsPopup}
            onChange={(e) => setShowAsPopup(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand"
          />
          <span>
            Pop up
            <span className="ml-1 text-xs text-muted">
              (aparece como aviso en la pantalla principal del socio; requiere
              estar publicado).
            </span>
          </span>
        </label>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving || uploading}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-6 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear evento"}
        </button>
        {isEdit ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-red-300 bg-white px-6 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {deleting ? "Eliminando…" : "Eliminar"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
