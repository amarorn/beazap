export type ExportRow = (string | number | null | undefined)[]

export interface ExportSheet {
  name: string
  headers: string[]
  rows: ExportRow[]
}

// ─── CSV ─────────────────────────────────────────────────────────────────────
function escapeCsv(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function downloadCsv(filename: string, sheets: ExportSheet[]) {
  const lines: string[] = []
  for (const sheet of sheets) {
    if (sheets.length > 1) lines.push(`# ${sheet.name}`)
    lines.push(sheet.headers.map(escapeCsv).join(','))
    for (const row of sheet.rows) {
      lines.push(row.map(escapeCsv).join(','))
    }
    if (sheets.length > 1) lines.push('')
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `${filename}.csv`)
}

// ─── XLSX ─────────────────────────────────────────────────────────────────────
export async function downloadXlsx(filename: string, sheets: ExportSheet[]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([s.headers, ...s.rows])
    // Auto column widths
    const colWidths = s.headers.map((h, i) => {
      const maxLen = Math.max(
        h.length,
        ...s.rows.map(r => String(r[i] ?? '').length)
      )
      return { wch: Math.min(maxLen + 2, 40) }
    })
    ws['!cols'] = colWidths
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ─── PDF ─────────────────────────────────────────────────────────────────────
export async function downloadPdf(
  filename: string,
  title: string,
  subtitle: string,
  sheets: ExportSheet[]
) {
  const { jsPDF } = await import('jspdf')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoTable = (await import('jspdf-autotable')).default as any

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = 22

  // Title
  doc.setFontSize(18)
  doc.setTextColor(30, 30, 30)
  doc.text(title, 14, y)
  y += 7

  // Subtitle + date
  doc.setFontSize(9)
  doc.setTextColor(130, 130, 130)
  doc.text(subtitle, 14, y)
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, y + 5)
  y += 13

  // Separator line
  doc.setDrawColor(200, 200, 200)
  doc.line(14, y, 196, y)
  y += 8

  for (const section of sheets) {
    if (section.name) {
      doc.setFontSize(11)
      doc.setTextColor(50, 50, 50)
      doc.text(section.name, 14, y)
      y += 4
    }

    autoTable(doc, {
      head: [section.headers],
      body: section.rows.map(r => r.map(v => (v == null ? '—' : String(v)))),
      startY: y,
      styles: { fontSize: 8, cellPadding: 2.5, textColor: [50, 50, 50] },
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
      tableLineColor: [230, 230, 230],
      tableLineWidth: 0.1,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable?.finalY + 12 || y + 20
    if (y > 270) {
      doc.addPage()
      y = 20
    }
  }

  doc.save(`${filename}.pdf`)
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}
