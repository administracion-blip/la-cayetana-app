"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bars3Icon } from "@/components/icons/Bars3Icon";

type Props = {
  isAdmin: boolean;
};

export function AppHeaderMenu({ isAdmin }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  return (
    <div className="relative flex shrink-0 justify-start">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-foreground shadow-sm transition hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        onClick={() => setOpen((v) => !v)}
      >
        <Bars3Icon className="h-6 w-6" />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-[45] bg-black/20"
            aria-hidden
            onClick={close}
          />
          <div
            ref={panelRef}
            id={panelId}
            role="menu"
            className="absolute left-0 top-[calc(100%+0.25rem)] z-50 min-w-[12rem] rounded-xl border border-border bg-card py-1 shadow-lg"
          >
            <Link
              href="/app"
              role="menuitem"
              className="block px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50"
              onClick={close}
            >
              Feed
            </Link>
            <Link
              href="/app/profile"
              role="menuitem"
              className="block px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50"
              onClick={close}
            >
              Perfil
            </Link>
            {isAdmin ? (
              <Link
                href="/admin/users"
                role="menuitem"
                className="block px-4 py-2.5 text-sm font-medium text-brand hover:bg-muted/50"
                onClick={close}
              >
                Admin
              </Link>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
