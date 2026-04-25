"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PinToHomeScreenModal } from "@/components/app/PinToHomeScreenModal";
import { Bars3Icon } from "@/components/icons/Bars3Icon";

type Props = {
  showAdminLink: boolean;
};

export function AppHeaderMenu({ showAdminLink }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
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
            className="fixed inset-0 z-[100] bg-black/20"
            aria-hidden
            onClick={close}
          />
          <div
            ref={panelRef}
            id={panelId}
            role="menu"
            className="absolute left-0 top-[calc(100%+0.25rem)] z-[110] min-w-[12rem] rounded-xl border border-border bg-card py-1 shadow-lg"
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
            {showAdminLink ? (
              <Link
                href="/admin"
                role="menuitem"
                className="block px-4 py-2.5 text-sm font-medium text-brand hover:bg-muted/50"
                onClick={close}
              >
                Admin
              </Link>
            ) : null}
            <div className="px-2 pb-1.5 pt-1" role="presentation">
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-lg border border-amber-200/90 bg-amber-100 px-3 py-2.5 text-left text-sm font-medium text-foreground shadow-sm transition hover:bg-amber-200/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                onClick={() => {
                  close();
                  setPinOpen(true);
                }}
              >
                Anclar a pantalla principal
              </button>
            </div>
          </div>
        </>
      ) : null}
      <PinToHomeScreenModal open={pinOpen} onClose={() => setPinOpen(false)} />
    </div>
  );
}
