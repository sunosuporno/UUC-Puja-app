import type { SheetData } from "write-excel-file/universal";

export type Receipt = {
  receiptNumber: string; tower: string | null; apartment: string | null; name: string | null;
  amount: number | null; paymentReference: string | null; paidDate: string | null; phone: string | null;
};
export type ReceiptReport = { fromReceipt: string; toReceipt: string; count: number; totalAmount: number; rows: Receipt[] };
export const receiptColumns = [["Receipt number", 140], ["Tower", 90], ["Apartment", 110], ["Name", 260], ["Contact number", 180], ["Amount", 150], ["Paid date", 140], ["Transaction / cheque number", 240]] as const;

export async function createSubscriptionReceiptExcel(report: ReceiptReport): Promise<Blob> {
  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const data: SheetData = [
    receiptColumns.map(([label]) => ({
      value: label, type: String, fontWeight: "bold", backgroundColor: "#7C1D19", color: "#FFFFFF", wrap: true,
    })),
    ...report.rows.map((row, index) =>
      [row.receiptNumber, row.tower, row.apartment, row.name, row.phone, row.amount, row.paidDate, row.paymentReference]
        .map((value, column) => ({
          value: value ?? undefined,
          type: column === 5 ? Number : String,
          format: column === 5 ? '#,##0.00' : '@',
          wrap: true,
          backgroundColor: index % 2 ? "#FFF8EC" : "#FFFFFF",
        })),
    ),
  ];
  return writeExcelFile(data, {
    sheet: "Subscription receipts",
    stickyRowsCount: 1,
    columns: receiptColumns.map(([, width]) => ({ width: Math.ceil(width / 7) })),
    orientation: "landscape",
  }).toBlob();
}

export async function downloadSubscriptionReceiptExcel(report: ReceiptReport) {
  const blob = await createSubscriptionReceiptExcel(report);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = `subscription-receipts-${report.fromReceipt}-${report.toReceipt}.xlsx`;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
