"use client";

import { useCallback, useEffect, useId } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Modal con el texto informativo de política de privacidad (RGPD).
 * Revisión legal recomendada antes de producción.
 */
export function PrivacyPolicyModal({ open, onClose }: Props) {
  const titleId = useId();

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={handleClose}
    >
      <div
        className="flex max-h-[min(90dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
          <h2
            id={titleId}
            className="text-base font-semibold text-foreground sm:text-lg"
          >
            Política de privacidad
          </h2>
          <p className="mt-1 text-xs text-muted">
            Información sobre el tratamiento de datos personales en el carnet
            digital de La Cayetana (Granada).
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm leading-relaxed text-foreground sm:px-5">
          <div className="space-y-4 text-muted [&_strong]:text-foreground">
            <section>
              <h3 className="mb-1 font-semibold text-foreground">
                1. Responsable del tratamiento
              </h3>
              <p>
                El responsable del tratamiento de los datos personales es la
                entidad que gestiona La Cayetana Granada en relación con el
                servicio de carnet digital y fidelización de socios. Para
                ejercer sus derechos o realizar consultas sobre privacidad,
                puede utilizarse el canal de contacto indicado en la web o en
                la caseta del club.
              </p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-foreground">
                2. Finalidad y base legal
              </h3>
              <p>
                Los datos se tratan para gestionar el alta y la condición de
                socio, el carnet digital con identificación (incluido código
                QR), la comunicación operativa del servicio, el cumplimiento de
                obligaciones legales y, en su caso, la gestión de pagos a través
                de proveedores autorizados (por ejemplo, procesadores de pago).
                La base jurídica puede ser la ejecución de la relación
                contractual con el socio, el consentimiento cuando resulte
                aplicable y el cumplimiento de obligaciones legales.
              </p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-foreground">
                3. Categorías de datos
              </h3>
              <p>
                Entre otros, pueden tratarse identificativos (nombre, email,
                teléfono), datos del carnet (número de socio), datos de
                nacimiento o sexo si se solicitan con fines estadísticos o de
                gestión del club, e información técnica necesaria para el
                funcionamiento seguro de la aplicación (sesiones, registros
                mínimos de seguridad).
              </p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-foreground">
                4. Conservación
              </h3>
              <p>
                Los datos se conservan el tiempo necesario para cumplir las
                finalidades indicadas y las obligaciones legales aplicables.
                Transcurrido ese plazo, podrán ser suprimidos o anonimizados
                conforme a la normativa.
              </p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-foreground">
                5. Destinatarios y encargados
              </h3>
              <p>
                No se cederán datos a terceros salvo obligación legal o cuando
                sea preciso para la prestación del servicio (por ejemplo,
                proveedores de alojamiento, infraestructura en la nube o pasarela
                de pago), en cuyo caso se formalizarán las garantías exigidas por
                la normativa de protección de datos.
              </p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-foreground">
                6. Derechos del interesado
              </h3>
              <p>
                Puede ejercer los derechos de acceso, rectificación,
                supresión, limitación del tratamiento, portabilidad y oposición
                cuando corresponda, así como retirar el consentimiento en su
                caso, dirigiendo una solicitud al responsable. Tiene derecho a
                reclamar ante la Agencia Española de Protección de Datos (
                <a
                  href="https://www.aepd.es"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand underline underline-offset-2"
                >
                  www.aepd.es
                </a>
                ).
              </p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-foreground">
                7. Seguridad
              </h3>
              <p>
                Se aplican medidas técnicas y organizativas apropiadas para
                proteger los datos frente a accesos no autorizados, pérdida o
                tratamiento indebido.
              </p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-foreground">
                8. Actualizaciones
              </h3>
              <p>
                Esta información puede actualizarse para adaptarse a cambios
                normativos o del servicio. Se recomienda revisarla periódicamente.
              </p>
            </section>
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={handleClose}
            className="w-full rounded-xl bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
