import type { SheetData } from "write-excel-file/universal";
import { unpaidColumns, type UnpaidReport } from "./unpaidReport";

export function unpaidExcelFilename(report: UnpaidReport) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(report.generatedAt));
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const tower = report.towerNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `unpaid-contacts-tower-${tower}-${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}${p.second}-IST.xlsx`;
}

export async function createUnpaidExcel(report: UnpaidReport): Promise<Blob> {
  const { default: writeExcelFile } =
    await import("write-excel-file/universal");
  const data: SheetData = [
    unpaidColumns.map((column) => ({
      value: column.label,
      type: String,
      fontWeight: "bold",
      backgroundColor: "#7C1D19",
      color: "#FFFFFF",
      wrap: true,
    })),
    ...report.contacts.map((contact, index) =>
      unpaidColumns.map((column) => ({
        // Explicit text preserves phone prefixes/leading zeros and prevents formulas.
        value: contact[column.key]?.trim() || "",
        type: String,
        format: "@",
        wrap: true,
        backgroundColor: index % 2 ? "#FFF8EC" : "#FFFFFF",
      })),
    ),
  ];
  return writeExcelFile(data, {
    sheet: "Unpaid contacts",
    stickyRowsCount: 1,
    stickyColumnsCount: 2,
    columns: unpaidColumns.map((column) => ({
      width: Math.ceil(column.width / 7),
    })),
    orientation: "landscape",
  }).toBlob();
}

export async function downloadUnpaidExcel(report: UnpaidReport): Promise<void> {
  const blob = await createUnpaidExcel(report);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = unpaidExcelFilename(report);
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Give the browser time to start reading the download before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
