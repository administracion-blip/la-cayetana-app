"use client";

import { useLayoutEffect, useRef, useState } from "react";

type Props = {
  text: string;
  className?: string;
};

const MAX_H_T =
  "max-height 0.28s cubic-bezier(0.33, 1, 0.68, 1)";

type SizeMode = "measure" | "short" | "tall";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-brand transition-transform duration-200 ease-out ${
        open ? "-rotate-180" : "rotate-0"
      }`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 011.06 0L10 11.44l3.72-3.22a.75.75 0 111.04 1.1l-4.25 3.65a.75.75 0 01-1.01 0L5.22 9.28a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const P_CLASS =
  "whitespace-pre-line text-[14px] leading-relaxed text-muted";

/**
 * Descripción: ~2 líneas; «Sigue leyendo» centrado (rojo) con chevron;
 * el despliegue anima `max-height` (rápido, fluido).
 */
export function ExpandableEventDescription({ text, className }: Props) {
  const pRef = useRef<HTMLParagraphElement>(null);
  const [mode, setMode] = useState<SizeMode>("measure");
  const [expanded, setExpanded] = useState(false);
  const [capPx, setCapPx] = useState(48);
  const [fullPx, setFullPx] = useState(0);

  useLayoutEffect(() => {
    const el = pRef.current;
    if (!el || !text.trim()) {
      setMode("short");
      return;
    }
    if (mode === "short") return;

    const lh = parseFloat(getComputedStyle(el).lineHeight) || 22.5;
    const cap = Math.ceil(lh * 2);

    if (mode === "measure") {
      const full = el.scrollHeight;
      if (full > cap + 1) {
        setCapPx(cap);
        setFullPx(full);
        setMode("tall");
      } else {
        setMode("short");
      }
      return;
    }

    if (mode === "tall") {
      setCapPx(cap);
      setFullPx(el.scrollHeight);
    }
  }, [text, mode]);

  if (!text.trim()) return null;

  if (mode === "measure") {
    return (
      <div className={className ?? "mt-2"}>
        <p ref={pRef} className={`line-clamp-2 ${P_CLASS}`}>
          {text}
        </p>
      </div>
    );
  }

  if (mode === "short") {
    return (
      <div className={className ?? "mt-2"}>
        <p ref={pRef} className={P_CLASS}>
          {text}
        </p>
      </div>
    );
  }

  // mode === "tall"
  return (
    <div className={className ?? "mt-2"}>
      <div
        className="overflow-hidden will-change-[max-height]"
        style={{
          maxHeight: expanded ? fullPx : capPx,
          transition: MAX_H_T,
        }}
      >
        <p ref={pRef} className={P_CLASS}>
          {text}
        </p>
      </div>
      <div className="mt-1.5 flex w-full justify-center">
        <button
          type="button"
          className="inline-flex flex-col items-center gap-0.5 text-sm font-medium text-brand hover:opacity-90"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          <ChevronIcon open={expanded} />
          <span>{expanded ? "Mostrar menos" : "Sigue leyendo"}</span>
        </button>
      </div>
    </div>
  );
}
