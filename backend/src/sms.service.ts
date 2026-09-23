import { Inject, Injectable } from "@nestjs/common";
import { Database } from "./database";

@Injectable()
export class SmsService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async sendBooking(reference: string): Promise<string> {
    const row = await this.db.transaction(async (c) => {
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('sms-daily-limit',0))",
      );
      const row = (
        await c.query(
          'SELECT * FROM "Bookings" WHERE "Booking Reference"=$1 FOR UPDATE',
          [reference],
        )
      ).rows[0];
      if (!row || row["SMS Status"].state !== "pending") return null;
      const dailyLimit = Number(process.env.SMS_DAILY_LIMIT || 100);
      const used = (
        await c.query(
          `SELECT count(*)::int AS n FROM "Bookings" WHERE ("SMS Status"->>'claimedAt')::timestamptz >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`,
        )
      ).rows[0].n;
      if (
        !Number.isInteger(dailyLimit) ||
        dailyLimit < 0 ||
        used >= dailyLimit
      ) {
        await c.query(
          `UPDATE "Bookings" SET "SMS Status"="SMS Status" || '{"state":"failed","error":"SMS daily limit reached or invalid."}'::jsonb WHERE "Booking Reference"=$1`,
          [reference],
        );
        return null;
      }
      await c.query(
        `UPDATE "Bookings" SET "SMS Status"="SMS Status" || $1::jsonb WHERE "Booking Reference"=$2`,
        [
          JSON.stringify({
            state: "sending",
            claimedAt: new Date().toISOString(),
            attempts: (row["SMS Status"].attempts || 0) + 1,
          }),
          reference,
        ],
      );
      return row;
    });
    if (!row)
      return (
        (
          await this.db.pool.query(
            `SELECT "SMS Status"->>'state' AS state FROM "Bookings" WHERE "Booking Reference"=$1`,
            [reference],
          )
        ).rows[0]?.state || "unknown"
      );
    const result = await this.send(row);
    await this.db.pool.query(
      `UPDATE "Bookings" SET "SMS Status"="SMS Status" || $1::jsonb,"SMS Request ID"=$2,"SMS Sent At"=$3 WHERE "Booking Reference"=$4`,
      [
        JSON.stringify({ state: result.state, error: result.error || null }),
        result.id || "",
        result.state === "accepted" ? new Date() : null,
        reference,
      ],
    );
    return result.state;
  }
  async send(
    row: any,
  ): Promise<{ state: string; id?: string; error?: string }> {
    if ((process.env.SMS_MODE || "mock") === "mock")
      return { state: "mock", id: "mock-" + row["Booking Reference"] };
    if (process.env.SMS_MODE !== "msg91")
      return { state: "failed", error: "Unknown SMS_MODE" };
    if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_TEMPLATE_ID)
      return { state: "failed", error: "MSG91 configuration missing" };
    let map: Record<string, string>;
    try {
      map = JSON.parse(process.env.MSG91_VARIABLE_MAP || "{}");
      if (!map || Array.isArray(map) || typeof map !== "object") throw 0;
    } catch {
      return { state: "failed", error: "Invalid MSG91_VARIABLE_MAP" };
    }
    const fields: Record<string, string> = {
      bookingReference: row["Booking Reference"],
      apartmentNumber: row["Apt. No."],
      amount: Number(row["Payable Amount"]).toFixed(2),
      customerName: row["SMS Status"].customerName || "Resident",
      bookingDetails: row["Booking Details"],
    };
    const variables: Record<string, string> = {};
    for (const [key, field] of Object.entries(map)) {
      if (!(field in fields) || key === "mobiles")
        return {
          state: "failed",
          error: "Invalid MSG91 template variable mapping",
        };
      variables[key] = fields[field];
    }
    try {
      const response = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: {
          authkey: process.env.MSG91_AUTH_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          template_id: process.env.MSG91_TEMPLATE_ID,
          short_url: "0",
          recipients: [{ mobiles: String(row["Phone Number"]).replace(/^\+/, ""), ...variables }],
        }),
        signal: AbortSignal.timeout(5000),
      });
      const raw = await response.text();
      let body: any;
      try {
        body = JSON.parse(raw);
      } catch {
        body = {};
      }
      if (response.ok && !body.type)
        return {
          state: "unknown",
          error: "MSG91 returned an unreadable success response.",
        };
      if (response.ok && body.type === "success")
        return {
          state: "accepted",
          id: String(body.request_id || body.message || ""),
        };
      return {
        state: "failed",
        error: `MSG91 rejected request (HTTP ${response.status}): ${String(body.message || body.type || "Unknown error").slice(0, 300)}`,
      };
    } catch {
      return {
        state: "unknown",
        error:
          "Provider response unavailable. Check MSG91 before retrying to avoid duplicate SMS.",
      };
    }
  }
  async list() {
    return (
      await this.db.pool.query(
        `SELECT "Booking Reference" AS "bookingReference", "SMS Status"->>'state' AS state,"SMS Status"->>'error' AS error,"SMS Request ID" AS "requestId","SMS Sent At" AS "submittedAt" FROM "Bookings" ORDER BY "Created At" DESC LIMIT 100`,
      )
    ).rows;
  }
}
