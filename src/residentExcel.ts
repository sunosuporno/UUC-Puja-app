import type { SheetData } from "write-excel-file/universal";
import {
  residentColumnsForStatus,
  type ResidentReport,
} from "./residentReport";

export function residentExcelFilename(report: ResidentReport) {
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
  return `${report.status}-contacts-tower-${tower}-${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}${p.second}-IST.xlsx`;
}

export async function createResidentExcel(
  report: ResidentReport,
): Promise<Blob> {
  const { default: writeExcelFile } =
    await import("write-excel-file/universal");
  const residentColumns = residentColumnsForStatus(report.status);
  const data: SheetData = [
    residentColumns.map((column) => ({
      value: column.label,
      type: String,
      fontWeight: "bold",
      backgroundColor: "#7C1D19",
      color: "#FFFFFF",
      wrap: true,
    })),
    ...report.contacts.map((contact, index) =>
      residentColumns.map((column) => ({
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
    sheet: `${report.status[0].toUpperCase()}${report.status.slice(1)} contacts`,
    stickyRowsCount: 1,
    stickyColumnsCount: 2,
    columns: residentColumns.map((column) => ({
      width: Math.ceil(column.width / 7),
    })),
    orientation: "landscape",
  }).toBlob();
}

export async function downloadResidentExcel(
  report: ResidentReport,
): Promise<void> {
  const blob = await createResidentExcel(report);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = residentExcelFilename(report);
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Give the browser time to start reading the download before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
