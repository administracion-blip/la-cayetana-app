import type { AdminReservationsForecast } from "@/lib/admin-reservations/client";

export type ForecastPdfMeta = {
  longDate: string;
  relTag: string;
  statusScopeLabel: string;
};

/**
 * Genera y descarga un PDF con la previsión de compra del día mostrado
 * en el modal admin. Import dinámico para no cargar jsPDF hasta que haga falta.
 */
export async function downloadForecastPdf(
  data: AdminReservationsForecast,
  meta: ForecastPdfMeta,
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Previsión de compra", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  y += 8;
  doc.text(`${meta.longDate} (${meta.relTag})`, margin, y);

  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Estados incluidos: ${meta.statusScopeLabel}`, margin, y);
  y += 5;
  doc.text("Sin datos personales: solo comensales, menús y platos.", margin, y);
  doc.setTextColor(0, 0, 0);

  y += 8;
  doc.setFontSize(10);
  doc.text(`Reservas: ${data.reservationCount}`, margin, y);
  doc.text(`Comensales: ${data.totalComensales}`, margin + 55, y);
  doc.text(`Tipos de menú: ${data.distinctMenuTypes}`, margin + 110, y);

  if (
    data.reservasSinMenuDetallado > 0 ||
    data.comensalesSinMenuDetallado > 0
  ) {
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(140, 90, 0);
    doc.text(
      `${data.reservasSinMenuDetallado} reserva(s) sin desglose de menú (${data.comensalesSinMenuDetallado} comensales). Revisad el detalle en cada reserva.`,
      margin,
      y,
      { maxWidth: pageWidth - margin * 2 },
    );
    doc.setTextColor(0, 0, 0);
  }

  y += 10;

  if (data.byMenu.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Raciones por tipo de menú", margin, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Menú", "Raciones"]],
      body: data.byMenu.map((row) => [row.name, String(row.quantity)]),
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [240, 240, 240], textColor: [40, 40, 40] },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { halign: "right", cellWidth: 28 },
      },
    });

    y = getAutoTableFinalY(doc) + 8;
  }

  if (data.byPrincipal.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = 18;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Principales pedidos", margin, y);
    y += 2;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(
      "Cada ración con menú y principal elegido cuenta como una unidad.",
      margin,
      y + 4,
    );
    doc.setTextColor(0, 0, 0);
    y += 6;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Plato", "Nº"]],
      body: data.byPrincipal.map((row) => [
        row.displayName,
        String(row.count),
      ]),
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [240, 240, 240], textColor: [40, 40, 40] },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { halign: "right", cellWidth: 28 },
      },
    });
  } else if (data.byMenu.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 18;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(
      "No hay principales anotados en las líneas de menú.",
      margin,
      y,
    );
    doc.setTextColor(0, 0, 0);
  } else if (data.reservationCount === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("No hay reservas activas para este día.", margin, y);
  }

  const generatedAt = new Date().toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const footerY = doc.internal.pageSize.getHeight() - 10;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generado: ${generatedAt}`, margin, footerY);

  doc.save(`prevision-compra-${data.reservationDate}.pdf`);
}

function getAutoTableFinalY(doc: import("jspdf").jsPDF): number {
  const withTable = doc as import("jspdf").jsPDF & {
    lastAutoTable?: { finalY: number };
  };
  return withTable.lastAutoTable?.finalY ?? 0;
}
