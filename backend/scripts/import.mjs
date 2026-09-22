import { readFile } from "node:fs/promises";
import pg from "pg";
const path = process.argv[2];
if (!path)
  throw new Error(
    "Usage: npm run db:import -- data/snapshot.local.json [--apply]",
  );
const snapshot = JSON.parse(await readFile(path, "utf8"));
const apply = process.argv.includes("--apply");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const columns = {
  Bookings: [
    "Sl No",
    "Booking Reference",
    "Created At",
    "Apt. No.",
    "Payment Method",
    "Payable Amount",
    "UPI Txn Id/cheque number",
    "Booking Details",
    "Phone Number",
    "SMS Status",
    "SMS Request ID",
    "SMS Sent At",
  ],
  "Booking Items": [
    "Booking Reference",
    "Created At",
    "Apt. No.",
    "Day Name",
    "Meal Type",
    "Food Type",
    "Service Type",
    "Quantity",
    "Unit Price",
    "Line Total",
    "Source",
    "Day Date",
  ],
  "Food Menu": [
    "Day",
    "Meal Time",
    "Menu Veg",
    "Menu Non-Veg",
    "Veg Takeaway Price",
    "Veg Dine-In Price",
    "Non-veg Takeaway Price",
    "Non-Veg Dine-In Price",
    "Date",
  ],
  Donations: [
    "Recipt No.",
    "TWR",
    "Apt. No.",
    "NAME",
    "Amount",
    "Transction ID",
    "Date",
    "Ph #",
  ],
  "Resident Master": [
    "Block",
    "Unit No",
    "Name",
    "Intercom",
    "Membership Status",
    "Primary Contact",
    "Lives Here",
    "Joined On",
    "Has Logged to Adda",
    "Email id",
    "Contact number",
    "Paid",
  ],
};
const number = (v) => {
  const n = Number(String(v ?? "").replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(n)) throw new Error("Invalid number");
  return n;
};
function date(v) {
  if (!v) return null;
  const text = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match)
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  throw new Error(
    "Ambiguous date; convert the source date to YYYY-MM-DD before importing.",
  );
}
function timestamp(v) {
  if (!v) return null;
  const text = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text))
    return text.replace(" ", "T") + "+05:30";
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return text;
  throw new Error("Ambiguous timestamp");
}
const counts = {};
let current = "";
try {
  await c.query("BEGIN");
  await c.query("SELECT pg_advisory_xact_lock(hashtext('uuc-import'))");
  for (const table of Object.keys(columns)) {
    if (!Array.isArray(snapshot.sheets[table]))
      throw new Error(`Missing ${table}`);
    if (
      Number(
        (await c.query(`SELECT count(*) FROM "${table}"`)).rows[0].count,
      ) !== 0
    )
      throw new Error(
        `${table} is not empty; refusing to overwrite or duplicate data.`,
      );
  }
  for (const [table, cols] of Object.entries(columns)) {
    const rows = snapshot.sheets[table];
    const headerIndex = rows.findIndex((r) =>
      r?.includes(table === "Bookings" ? "Booking Reference" : cols[0]),
    );
    if (headerIndex < 0) throw new Error(`Missing headers in ${table}`);
    const headers = rows[headerIndex];
    const oldNames = {
      "Phone Number": "WhatsApp Number",
      "SMS Status": "WhatsApp Status",
      "SMS Request ID": "WhatsApp Message ID",
      "SMS Sent At": "WhatsApp Sent At",
    };
    const positions = cols.map((k) =>
      headers.indexOf(table === "Bookings" ? oldNames[k] || k : k),
    );
    if (positions.some((p) => p < 0))
      throw new Error(`Headers do not match ${table}`);
    counts[table] = 0;
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r?.some((v) => v !== null && v !== "")) continue;
      current = `${table} row ${i + 1}`;
      const values = positions.map((p) => r[p] ?? "");
      if (table === "Donations") {
        values[0] = number(values[0]);
        values[4] = values[4] === "" ? null : number(values[4]);
        values[6] = date(values[6]);
        values[1] = String(values[1]).trim().toUpperCase();
        values[2] = String(values[2]).trim().toUpperCase();
        if (!values[0])
          throw new Error("Donation has a missing receipt number");
      }
      if (table === "Food Menu") {
        for (const i of [4, 5, 6, 7])
          values[i] = values[i] === "" ? null : number(values[i]);
        values[8] = date(values[8]);
      }
      if (table === "Bookings") {
        values[0] = number(values[0]);
        values[2] = timestamp(values[2]);
        values[5] = number(values[5]);
        values[8] = String(values[8]).replace(/\D/g, "");
        values[9] = JSON.stringify({
          state: "legacy",
          legacyWhatsAppStatus: values[9],
          legacyWhatsAppMessageId: values[10],
          legacyWhatsAppSentAt: values[11],
          attempts: 0,
        });
        values[10] = "";
        values[11] = null;
      }
      if (table === "Booking Items") {
        values[1] = timestamp(values[1]);
        for (const i of [7, 8, 9]) values[i] = number(values[i]);
        values[11] = date(values[11]);
      }
      await c.query(
        `INSERT INTO "${table}" (${cols.map((k) => `"${k}"`).join(",")}) VALUES (${values.map((_, i) => "$" + (i + 1)).join(",")})`,
        values,
      );
      counts[table]++;
    }
  }
  if (apply)
    for (const [table, col] of [
      ["Bookings", "Sl No"],
      ["Donations", "Recipt No."],
    ])
      await c.query(
        `SELECT setval(pg_get_serial_sequence('"${table}"',$1),coalesce(max("${col}"),1),count(*)>0) FROM "${table}"`,
        [col],
      );
  const report = {
    source: snapshot.spreadsheetId,
    counts,
    donationTotal: (
      await c.query('SELECT sum("Amount")::text AS total FROM "Donations"')
    ).rows[0].total,
    bookingTotal: (
      await c.query(
        'SELECT sum("Payable Amount")::text AS total FROM "Bookings"',
      )
    ).rows[0].total,
  };
  await c.query(apply ? "COMMIT" : "ROLLBACK");
  console.log(
    JSON.stringify(
      { mode: apply ? "imported" : "validated; rolled back", ...report },
      null,
      2,
    ),
  );
} catch (error) {
  await c.query("ROLLBACK");
  console.error(
    "Import failed at",
    current || "preflight",
    "— no rows imported.",
  );
  throw error;
} finally {
  await c.end();
}
