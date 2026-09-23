import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { PoolClient } from "pg";
import { z } from "zod";
import { Database } from "./database";
import { SmsService } from "./sms.service";
import {
  Item,
  amount,
  aptNo,
  cents,
  dateSchema,
  details,
  donationSchema,
  fail,
  fingerprint,
  itemFromRow,
  itemKey,
  itemSchema,
  locationSchema,
  menuFromRows,
  parse,
  paymentSchema,
  phoneSchema,
  requestIdSchema,
  today,
  validatePrices,
} from "./domain";

const ITEM_COLUMNS = [
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
];
const MENU_COLUMNS = [
  "Day",
  "Meal Time",
  "Menu Veg",
  "Menu Non-Veg",
  "Veg Takeaway Price",
  "Veg Dine-In Price",
  "Non-veg Takeaway Price",
  "Non-Veg Dine-In Price",
  "Date",
];
const keyColumns = [
  "Booking Reference",
  "Day Date",
  "Day Name",
  "Meal Type",
  "Food Type",
  "Service Type",
  "Source",
  "Unit Price",
];
const keyWhere = keyColumns.map((c, i) => `"${c}"=$${i + 1}`).join(" AND ");
export const menuRowSchema = z.object({
  Day: z.string().trim().min(1).max(100),
  "Meal Time": z.string().trim().min(1).max(100),
  "Menu Veg": z.string().trim().max(4000).default(""),
  "Menu Non-Veg": z.string().trim().max(4000).default(""),
  "Veg Takeaway Price": z.number().positive().max(100000).nullable(),
  "Veg Dine-In Price": z.number().positive().max(100000).nullable(),
  "Non-veg Takeaway Price": z.number().positive().max(100000).nullable(),
  "Non-Veg Dine-In Price": z.number().positive().max(100000).nullable(),
  Date: dateSchema.nullable(),
});
@Injectable()
export class BookingsService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(SmsService) private readonly sms: SmsService,
  ) {}
  async menu() {
    return menuFromRows(
      (
        await this.db.pool.query(
          'SELECT * FROM "Food Menu" ORDER BY "Date", "Day", "Meal Time"',
        )
      ).rows,
    );
  }
  async checkDonation(input: unknown) {
    const p = parse(locationSchema, input);
    const result = await this.db.pool.query(
      'SELECT "NAME" FROM "Donations" WHERE "TWR"=$1 AND "Apt. No."=$2 ORDER BY "Recipt No." LIMIT 1',
      [p.towerNumber, p.apartmentNumber],
    );
    return {
      eligible: !!result.rowCount,
      donorName: result.rows[0]?.NAME || "",
    };
  }
  async donate(input: any) {
    const p = parse(locationSchema, input);
    const payment = parse(paymentSchema, input);
    const phone = parse(phoneSchema, input.phoneNumber);
    const donation = parse(donationSchema, input.donation);
    if (cents(payment.payableAmount) !== 400000)
      fail("Donation amount must be Rs. 4,000.");
    const paymentReference =
      payment.paymentMethod === "cash" ? "CASH" : payment.paymentReference;
    return this.db.transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "donation:" + aptNo(p),
      ]);
      const existing = (
        await c.query(
          'SELECT * FROM "Donations" WHERE "TWR"=$1 AND "Apt. No."=$2',
          [p.towerNumber, p.apartmentNumber],
        )
      ).rows;
      if (existing.length) {
        // The existing receipt is the replay key; never insert another donation for this flat.
        const same =
          existing.length === 1 &&
          String(existing[0]["Recipt No."]) ===
            String(Number(donation.receiptNumber)) &&
          existing[0].NAME === donation.name &&
          Number(existing[0].Amount) === 4000 &&
          existing[0]["Transction ID"] === paymentReference &&
          existing[0]["Ph #"] === `+${phone}`;
        if (!same)
          throw new ConflictException(
            "A donation already exists for this apartment.",
          );
        return { receiptNumber: String(existing[0]["Recipt No."]) };
      }
      await c.query(
        'INSERT INTO "Donations" ("Recipt No.","TWR","Apt. No.","NAME","Amount","Transction ID","Date","Ph #") VALUES ($1,$2,$3,$4,4000,$5,$6,$7)',
        [
          donation.receiptNumber,
          p.towerNumber,
          p.apartmentNumber,
          donation.name,
          paymentReference,
          today(),
          `+${phone}`,
        ],
      );
      await c.query(
        `UPDATE "Resident Master" SET "Paid"='Paid' WHERE upper(btrim("Block"))=$1 AND upper(btrim("Unit No"))=$2`,
        [p.towerNumber, p.apartmentNumber],
      );
      return { receiptNumber: String(Number(donation.receiptNumber)) };
    });
  }
  async create(input: any) {
    const p = parse(locationSchema, input);
    const payment = parse(paymentSchema, input);
    const requestId = parse(requestIdSchema, input.bookingRequestId);
    const phone = parse(phoneSchema, input.phoneNumber);
    const items = parse(
      z.array(itemSchema).min(1).max(150),
      input.bookingItems,
    );
    const donation = input.donation
      ? parse(donationSchema, input.donation)
      : null;
    const hash = fingerprint({ p, payment, phone, items, donation });
    let created = false;
    const result = await this.db.transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "booking:" + requestId,
      ]);
      const saved = (
        await c.query(
          'SELECT * FROM "Bookings" WHERE "SMS Status"->>\'bookingRequestId\'=$1',
          [requestId],
        )
      ).rows[0];
      if (saved) {
        if (saved["SMS Status"].bookingFingerprint !== hash)
          throw new ConflictException(
            "Request ID already used for a different booking.",
          );
        return this.bookingResult(saved);
      }
      const menu = menuFromRows(
        (
          await c.query(
            'SELECT * FROM "Food Menu" ORDER BY "Day", "Meal Time" FOR SHARE',
          )
        ).rows,
      );
      validatePrices(items, menu);
      const total =
        items.reduce((n, i) => n + cents(i.lineTotal), 0) +
        (donation ? 400000 : 0);
      if (total !== cents(payment.payableAmount))
        fail("Booking total changed. Review your selection.");
      // Lock one apartment, preserving legacy duplicate records while preventing new duplicates.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "donation:" + aptNo(p),
      ]);
      const donor = (
        await c.query(
          'SELECT "NAME" FROM "Donations" WHERE "TWR"=$1 AND "Apt. No."=$2 ORDER BY "Recipt No." LIMIT 1',
          [p.towerNumber, p.apartmentNumber],
        )
      ).rows[0];
      if (donation && donor)
        throw new ConflictException(
          "A donation already exists for this apartment.",
        );
      if (!donation && !donor)
        fail("A Pujo donation record is required before booking coupons.");
      const serial = (
        await c.query(
          `SELECT nextval(pg_get_serial_sequence('"Bookings"','Sl No')) AS n`,
        )
      ).rows[0].n;
      const reference = `UUC${today().slice(2, 4)}-${String(serial).padStart(6, "0")}`;
      const text = details(
        items,
        donation ? "Pujo donation x 1 (Rs. 4,000)" : "",
      );
      const state = {
        state: "pending",
        attempts: 0,
        bookingRequestId: requestId,
        bookingFingerprint: hash,
        customerName: donation?.name || donor?.NAME || "",
        upgrades: [],
      };
      const row = (
        await c.query(
          `INSERT INTO "Bookings" ("Sl No","Booking Reference","Apt. No.","Payment Method","Payable Amount","UPI Txn Id/cheque number","Booking Details","Phone Number","SMS Status") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [
            serial,
            reference,
            aptNo(p),
            payment.paymentMethod.toUpperCase(),
            total / 100,
            payment.paymentReference,
            text,
            `+${phone}`,
            state,
          ],
        )
      ).rows[0];
      for (const item of items)
        await this.insertItem(c, reference, aptNo(p), row["Created At"], item);
      if (donation) {
        await c.query(
          'INSERT INTO "Donations" ("TWR","Apt. No.","NAME","Amount","Transction ID","Date","Ph #","Recipt No.") VALUES ($1,$2,$3,4000,$4,$5,$6,$7)',
          [
            p.towerNumber,
            p.apartmentNumber,
            donation.name,
            payment.paymentMethod === "cash"
              ? "CASH"
              : payment.paymentReference,
            today(),
            `+${phone}`,
            donation.receiptNumber,
          ],
        );
        await c.query(
          `UPDATE "Resident Master" SET "Paid"='Paid'
           WHERE upper(btrim("Block"))=$1 AND upper(btrim("Unit No"))=$2`,
          [p.towerNumber, p.apartmentNumber],
        );
      }
      created = true;
      return this.bookingResult(row);
    });
    // The transaction has committed. Notification problems must never undo success.
    if (created) {
      try {
        result.smsStatus = await this.sms.sendBooking(result.bookingReference);
      } catch {
        result.smsStatus = "unknown";
        console.error(
          "SMS outcome could not be confirmed for a committed booking.",
        );
        try {
          await this.db.pool.query(
            `UPDATE "Bookings" SET "SMS Status"="SMS Status" || '{"state":"unknown","error":"Notification outcome unavailable; booking remains confirmed."}'::jsonb WHERE "Booking Reference"=$1`,
            [result.bookingReference],
          );
        } catch {
          console.error(
            "Unable to persist SMS outcome; inspect booking notification state.",
          );
        }
      }
    }
    return result;
  }
  private bookingResult(row: any) {
    return {
      serialNumber: Number(row["Sl No"]),
      bookingReference: row["Booking Reference"],
      createdAt: row["Created At"],
      smsStatus: row["SMS Status"].state,
    };
  }
  private async insertItem(
    c: PoolClient,
    reference: string,
    apt: string,
    created: Date,
    item: Item,
  ) {
    const values = [
      reference,
      created,
      apt,
      item.dayName,
      item.mealType,
      item.foodType,
      item.serviceType,
      item.quantity,
      item.unitPrice,
      item.lineTotal,
      item.source,
      item.dayDate,
    ];
    await c.query(
      `INSERT INTO "Booking Items" (${ITEM_COLUMNS.map((k) => `"${k}"`).join(",")}) VALUES (${values.map((_, i) => "$" + (i + 1)).join(",")}) ON CONFLICT (${keyColumns.map((k) => `"${k}"`).join(",")}) DO UPDATE SET "Quantity"="Booking Items"."Quantity"+EXCLUDED."Quantity", "Line Total"="Booking Items"."Line Total"+EXCLUDED."Line Total"`,
      values,
    );
  }
  private managedItem(r: any, menu: ReturnType<typeof menuFromRows>) {
    const item = itemFromRow(r);
    const meal = menu.days
      .find((d) => d.date === item.dayDate && d.name === item.dayName)
      ?.meals.find(
        (m: any) =>
          m.mealTime === item.mealType && m.foodType === item.foodType,
      );
    const isPass = item.source === "Season Pass";
    const extra = isPass
      ? 3000
      : meal
        ? cents(meal.takeawayPrice) - cents(item.unitPrice)
        : 0;
    const eligible =
      item.dayDate >= today() &&
      (item.serviceType === "Dine-In" || (isPass && item.serviceType === "")) &&
      extra > 0;
    return {
      ...item,
      id: itemKey(r["Booking Reference"], item),
      bookingReference: r["Booking Reference"],
      takeawayUnitPrice: isPass
        ? (cents(item.unitPrice) + 3000) / 100
        : meal?.takeawayPrice || 0,
      extraUnitPrice: eligible ? extra / 100 : 0,
      extraTotal: eligible ? (extra * item.quantity) / 100 : 0,
      upgradeable: eligible,
    };
  }
  async bookings(input: unknown) {
    const p = parse(
      locationSchema.extend({
        bookingReference: z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,80}$/)
          .optional(),
      }),
      input,
    );
    const [bookings, items, menuRows] = await Promise.all([
      this.db.pool.query(
        'SELECT * FROM "Bookings" WHERE "Apt. No."=$1 AND ($2::text IS NULL OR "Booking Reference"=$2) ORDER BY "Created At" DESC',
        [aptNo(p), p.bookingReference || null],
      ),
      this.db.pool.query(
        'SELECT * FROM "Booking Items" WHERE "Apt. No."=$1 AND ($2::text IS NULL OR "Booking Reference"=$2) ORDER BY "Day Date", "Meal Type"',
        [aptNo(p), p.bookingReference || null],
      ),
      this.db.pool.query('SELECT * FROM "Food Menu"'),
    ]);
    const menu = menuFromRows(menuRows.rows, false);
    return bookings.rows.map((r) => ({
      bookingReference: r["Booking Reference"],
      createdAt: r["Created At"],
      paymentMethod: r["Payment Method"],
      payableAmount: Number(r["Payable Amount"]),
      bookingDetails: r["Booking Details"],
      items: items.rows
        .filter((i) => i["Booking Reference"] === r["Booking Reference"])
        .map((i) => this.managedItem(i, menu)),
    }));
  }
  async upgrade(input: any) {
    const p = parse(locationSchema, input);
    const payment = parse(paymentSchema, input);
    const id = parse(requestIdSchema, input.upgradeRequestId);
    const reference = input.bookingReference
      ? parse(z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), input.bookingReference)
      : "";
    const selections = parse(
      z
        .array(
          z.object({
            itemId: z.string().min(1).max(1500),
            quantity: z.number().int().positive().max(10000),
          }),
        )
        .min(1)
        .max(150),
      input.itemUpgrades,
    );
    if (new Set(selections.map((i) => i.itemId)).size !== selections.length)
      fail("Each item may only be selected once.");
    const hash = fingerprint({ p, payment, reference, selections });
    return this.db.transaction(async (c) => {
      // Serialize changes only within this apartment. All booking rows lock in a consistent order.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "upgrade:" + aptNo(p),
      ]);
      const bookings = (
        await c.query(
          'SELECT * FROM "Bookings" WHERE "Apt. No."=$1 ORDER BY "Booking Reference" FOR UPDATE',
          [aptNo(p)],
        )
      ).rows;
      const previous = bookings
        .flatMap((b) => b["SMS Status"].upgrades || [])
        .find((u) => u.id === id);
      if (previous) {
        if (previous.fingerprint !== hash)
          throw new ConflictException(
            "Request ID already used for a different upgrade.",
          );
        return previous.result;
      }
      const menu = menuFromRows(
        (
          await c.query(
            'SELECT * FROM "Food Menu" ORDER BY "Day", "Meal Time" FOR SHARE',
          )
        ).rows,
        false,
      );
      const changes: any[] = [];
      for (const selection of selections) {
        let key: unknown;
        try {
          key = JSON.parse(
            Buffer.from(selection.itemId, "base64url").toString(),
          );
        } catch {
          fail("Invalid booking item ID.");
        }
        const k = parse(
          z.tuple([
            z.string(),
            dateSchema,
            z.string(),
            z.string(),
            z.string(),
            z.string(),
            z.string(),
            z.number().nonnegative(),
          ]),
          key,
        );
        if (reference && reference !== k[0])
          fail("Selected item belongs to another booking.");
        if (!bookings.some((b) => b["Booking Reference"] === k[0]))
          fail("Selected item belongs to another apartment.");
        const r = (
          await c.query(
            `SELECT * FROM "Booking Items" WHERE ${keyWhere} FOR UPDATE`,
            k,
          )
        ).rows[0];
        if (!r)
          throw new ConflictException(
            "The item changed. Reload your bookings.",
          );
        const item = this.managedItem(r, menu);
        if (!item.upgradeable || selection.quantity > item.quantity)
          throw new ConflictException(
            "The selected coupons are no longer available for upgrade.",
          );
        changes.push({
          r,
          item,
          k,
          quantity: selection.quantity,
          extra: cents(item.extraUnitPrice) * selection.quantity,
        });
      }
      if (
        changes.reduce((n, i) => n + i.extra, 0) !==
        cents(payment.payableAmount)
      )
        fail("Upgrade price changed. Reload your bookings.");
      const refs = [
        ...new Set<string>(changes.map((i) => i.r["Booking Reference"])),
      ];
      const result = {
        upgradeReference: refs.join(", "),
        updatedBookingReferences: refs,
        updatedItemCount: changes.length,
        updatedCouponCount: changes.reduce((n, i) => n + i.quantity, 0),
        payableAmount: amount(payment.payableAmount),
      };
      for (const change of changes) {
        const { item, k, quantity, r } = change;
        if (quantity === item.quantity)
          await c.query(`DELETE FROM "Booking Items" WHERE ${keyWhere}`, k);
        else
          await c.query(
            `UPDATE "Booking Items" SET "Quantity"="Quantity"-$9, "Line Total"=("Quantity"-$9)*"Unit Price" WHERE ${keyWhere}`,
            [...k, quantity],
          );
        await this.insertItem(
          c,
          r["Booking Reference"],
          aptNo(p),
          r["Created At"],
          {
            ...item,
            quantity,
            serviceType: "Takeaway",
            unitPrice: item.takeawayUnitPrice,
            lineTotal: (cents(item.takeawayUnitPrice) * quantity) / 100,
          },
        );
      }
      for (const ref of refs) {
        const b = bookings.find((b) => b["Booking Reference"] === ref);
        const extra =
          changes
            .filter((i) => i.r["Booking Reference"] === ref)
            .reduce((n, i) => n + i.extra, 0) / 100;
        const rows = (
          await c.query(
            'SELECT * FROM "Booking Items" WHERE "Booking Reference"=$1 ORDER BY "Day Date", "Meal Type"',
            [ref],
          )
        ).rows;
        const donationText =
          b["Booking Details"]
            .split(";")
            .map((s: string) => s.trim())
            .find((s: string) => s.startsWith("Pujo donation")) || "";
        const state = {
          ...b["SMS Status"],
          upgrades: [
            ...(b["SMS Status"].upgrades || []),
            { id, fingerprint: hash, result },
          ],
        };
        const note = `Upgrade ${new Date().toISOString()}: ${payment.paymentMethod === "cash" ? "CASH" : payment.paymentReference} (Rs. ${extra.toFixed(2)})`;
        await c.query(
          'UPDATE "Bookings" SET "Payable Amount"="Payable Amount"+$1, "Payment Method"="Payment Method" || $2, "UPI Txn Id/cheque number"=concat_ws(\'; \',nullif("UPI Txn Id/cheque number",\'\'),$3::text), "Booking Details"=$4, "SMS Status"=$5 WHERE "Booking Reference"=$6',
          [
            extra,
            "; UPGRADE " + payment.paymentMethod.toUpperCase(),
            note,
            details(rows.map(itemFromRow), donationText),
            state,
            ref,
          ],
        );
      }
      return result;
    });
  }
  async apartmentCoupons(input: unknown) {
    const p = parse(locationSchema, input);
    const apartment = aptNo(p);
    const result = (
      await this.db.pool.query(
        `
      WITH selected AS MATERIALIZED (
        SELECT "Booking Reference", "Day Date", "Day Name", "Meal Type", "Food Type",
          coalesce(nullif("Service Type",''),'Dine-In') AS service, "Source", "Quantity"
        FROM "Booking Items" WHERE "Apt. No."=$1
      ), grouped AS (
        SELECT "Day Date" AS "dayDate", "Day Name" AS "dayName", "Meal Type" AS "mealType",
          "Food Type" AS "foodType", service AS "serviceType", "Source" AS source,
          sum("Quantity")::int AS quantity
        FROM selected GROUP BY 1,2,3,4,5,6
      )
      SELECT coalesce(sum("Quantity"),0)::int AS "totalCoupons",
        count(DISTINCT "Booking Reference")::int AS "totalBookings",
        (SELECT coalesce(json_agg(grouped ORDER BY "dayDate","dayName","mealType","foodType","serviceType",source),'[]'::json) FROM grouped) AS meals
      FROM selected`,
        [apartment],
      )
    ).rows[0];
    return { apartment, ...result };
  }
  async subscriptionSummary() {
    // Aggregate residents into apartments before counting; any paid member wins.
    // A full summary needs every resident, so a single scan/hash aggregate is
    // preferable to separate queries per tower or a new maintained totals table.
    const rows = (
      await this.db.pool.query<{
        tower: string;
        paid: number;
        unpaid: number;
        total: number;
      }>(`
        WITH apartments AS (
          SELECT upper(btrim("Block")) AS tower, upper(btrim("Unit No")) AS unit,
            bool_or(lower(btrim(coalesce("Paid", ''))) = 'paid') AS paid
          FROM "Resident Master"
          WHERE nullif(btrim("Block"), '') IS NOT NULL
            AND nullif(btrim("Unit No"), '') IS NOT NULL
          GROUP BY 1, 2
        )
        SELECT tower, count(*) FILTER (WHERE paid)::int AS paid,
          count(*) FILTER (WHERE NOT paid)::int AS unpaid, count(*)::int AS total
        FROM apartments GROUP BY tower
      `)
    ).rows;
    const byTower = new Map(rows.map((row) => [row.tower, row]));
    const towerNames = [
      ...new Set([
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "TH",
        ...rows.map((row) => row.tower),
      ]),
    ].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    const towers = towerNames.map(
      (tower) => byTower.get(tower) || { tower, paid: 0, unpaid: 0, total: 0 },
    );
    const totals = towers.reduce(
      (sum, row) => ({
        paid: sum.paid + row.paid,
        unpaid: sum.unpaid + row.unpaid,
        total: sum.total + row.total,
      }),
      { paid: 0, unpaid: 0, total: 0 },
    );
    return { generatedAt: new Date().toISOString(), towers, totals };
  }
  async unpaidResidents(input: unknown) {
    const report = await this.residentContacts(input);
    return { ...report, unpaidApartments: report.apartments };
  }
  async residentContacts(input: unknown) {
    const { towerNumber, status } = parse(
      locationSchema.pick({ towerNumber: true }).extend({
        status: z.enum(["unpaid", "paid", "all"]).default("unpaid"),
      }),
      input,
    );
    // Filter one tower once; window flags consider every member before selecting
    // contacts, so a paid owner also excludes that apartment's unpaid tenant.
    const result = (
      await this.db.pool.query(
        `
      WITH residents AS (
        SELECT upper(btrim("Block")) AS block, upper(btrim("Unit No")) AS unit,
          "Name" AS name, "Intercom" AS intercom,
          "Membership Status" AS "membershipStatus", "Lives Here" AS "livesHere",
          "Email id" AS email, "Contact number" AS "contactNumber", "Paid" AS paid,
          lower(btrim(coalesce("Membership Status", ''))) AS membership,
          upper(btrim(coalesce("Primary Contact", ''))) AS primary_contact,
          lower(btrim(coalesce("Paid", ''))) = 'paid' AS is_paid
        FROM "Resident Master"
        WHERE upper(btrim("Block")) = $1 AND nullif(btrim("Unit No"), '') IS NOT NULL
      ), flagged AS (
        SELECT *, bool_or(is_paid) OVER (PARTITION BY unit) AS apartment_paid
        FROM residents
      ), candidates AS (
        SELECT * FROM flagged
        WHERE $2 = 'all' OR ($2 = 'unpaid' AND NOT apartment_paid)
          OR ($2 = 'paid' AND is_paid)
      ), ranked AS (
        SELECT *, count(*) OVER (PARTITION BY unit) AS candidate_count,
          bool_or(membership = 'tenant') OVER (PARTITION BY unit) AS has_tenant
        FROM candidates
      ), contacts AS (
        SELECT block, unit, name, intercom, "membershipStatus", "livesHere", email,
          "contactNumber", paid,
          CASE WHEN apartment_paid THEN 'Paid' ELSE 'Unpaid' END AS "apartmentStatus"
        FROM ranked WHERE ($2 = 'paid' AND candidate_count = 1)
          OR membership = 'tenant'
          OR (NOT has_tenant AND primary_contact = 'Y' AND ($2 = 'all' OR membership = 'owner'))
      )
      SELECT (SELECT count(DISTINCT unit)::int FROM candidates) AS "apartments",
        count(DISTINCT unit)::int AS "contactApartments",
        coalesce(json_agg(contacts ORDER BY unit, name), '[]'::json) AS contacts
      FROM contacts
    `,
        [towerNumber, status],
      )
    ).rows[0];
    result.contacts.sort(
      (
        a: { unit: string; name: string | null },
        b: { unit: string; name: string | null },
      ) =>
        a.unit.localeCompare(b.unit, "en", { numeric: true }) ||
        (a.name || "").localeCompare(b.name || ""),
    );
    return {
      towerNumber,
      status,
      generatedAt: new Date().toISOString(),
      ...result,
    };
  }
  async collection(input: unknown) {
    const p = parse(
      z.object({ fromDate: dateSchema, toDate: dateSchema }),
      input,
    );
    if (p.fromDate > p.toDate) fail("From date must not follow To date.");
    const rows = (
      await this.db.pool.query(
        `SELECT "Booking Reference" AS "bookingReference","Created At" AS "createdAt","Apt. No." AS "apartmentNumber","Payment Method" AS "paymentMethod","Payable Amount"::float8 AS "payableAmount","UPI Txn Id/cheque number" AS "paymentReference" FROM "Bookings" WHERE "Created At">=($1::date::timestamp AT TIME ZONE 'Asia/Kolkata') AND "Created At"<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata') ORDER BY "Created At" DESC`,
        [p.fromDate, p.toDate],
      )
    ).rows;
    return {
      ...p,
      generatedAt: new Date().toISOString(),
      totalCollection:
        rows.reduce((n, r) => n + cents(r.payableAmount), 0) / 100,
      bookings: rows,
    };
  }
  async summary() {
    // Aggregate in Postgres; never scan and return individual sheet rows to the application.
    const groups = (
      await this.db.pool.query(
        `SELECT "Day Date" AS "dayDate", "Day Name" AS "dayName", "Meal Type" AS "mealType", "Food Type" AS "foodType", "Service Type" AS "serviceType", "Source" AS source, sum("Quantity")::int AS quantity, sum("Line Total")::float8 AS amount FROM "Booking Items" GROUP BY 1,2,3,4,5,6 ORDER BY 1,3,4,5`,
      )
    ).rows;
    const unique = (
      await this.db.pool.query(
        'SELECT count(DISTINCT "Booking Reference")::int AS bookings,count(DISTINCT "Apt. No.")::int AS apartments FROM "Booking Items"',
      )
    ).rows[0];
    const empty = () => ({
      quantity: 0,
      veg: 0,
      nonVeg: 0,
      dineIn: 0,
      takeaway: 0,
      seasonPass: 0,
      individual: 0,
      amountCollected: 0,
    });
    const totals = { ...empty(), ...unique };
    const days: any[] = [];
    for (const g of groups) {
      const food =
        g.foodType ||
        (/\b(non-veg|mutton|chicken|fish|murgh)\b/i.test(g.mealType)
          ? "Non-Veg"
          : /\bveg\b/i.test(g.mealType)
            ? "Veg"
            : "");
      const service =
        g.serviceType || (g.source === "Individual" ? "Dine-In" : "");
      let day = days.find((d) => d.dayDate === g.dayDate);
      if (!day) {
        day = { ...empty(), dayName: g.dayName, dayDate: g.dayDate, meals: [] };
        days.push(day);
      }
      const foodType =
        food || (g.source === "Season Pass" ? "Season Pass" : "Unspecified");
      const serviceType =
        service || (g.source === "Season Pass" ? "Season Pass" : "Unspecified");
      let meal = day.meals.find(
        (m: any) =>
          m.mealType === g.mealType &&
          m.foodType === foodType &&
          m.serviceType === serviceType,
      );
      if (!meal) {
        meal = { ...empty(), mealType: g.mealType, foodType, serviceType };
        day.meals.push(meal);
      }
      for (const target of [totals, day, meal]) {
        target.quantity += g.quantity;
        target.amountCollected = amount(target.amountCollected + g.amount);
        target[g.source === "Season Pass" ? "seasonPass" : "individual"] +=
          g.quantity;
        if (food === "Veg") target.veg += g.quantity;
        if (food === "Non-Veg") target.nonVeg += g.quantity;
        if (service === "Dine-In") target.dineIn += g.quantity;
        if (service === "Takeaway") target.takeaway += g.quantity;
      }
    }
    const rank = (m: string) =>
      ["Breakfast", "Lunch", "Dinner"].findIndex((x) => m.includes(x));
    for (const day of days)
      day.meals.sort((a: any, b: any) => rank(a.mealType) - rank(b.mealType));
    return { generatedAt: new Date().toISOString(), totals, days };
  }
  async adminMenu() {
    return (
      await this.db.pool.query(
        'SELECT * FROM "Food Menu" ORDER BY "Date", "Day", "Meal Time"',
      )
    ).rows.map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [
          k,
          k.includes("Price") && v !== null ? Number(v) : v,
        ]),
      ),
    );
  }
  async saveMenu(input: any) {
    const row = parse(menuRowSchema, input.row);
    const original = input.original
      ? parse(
          z.object({ Day: z.string(), "Meal Time": z.string() }),
          input.original,
        )
      : null;
    if (row.Day !== "Season Pass") {
      if (!row.Date || (!row["Menu Veg"] && !row["Menu Non-Veg"]))
        fail("An event date and at least one menu are required.");
      if (
        row["Menu Veg"] &&
        (!row["Veg Dine-In Price"] || !row["Veg Takeaway Price"])
      )
        fail("Veg prices are required.");
      if (
        row["Menu Non-Veg"] &&
        (!row["Non-Veg Dine-In Price"] || !row["Non-veg Takeaway Price"])
      )
        fail("Non-veg prices are required.");
    } else if (!row["Veg Dine-In Price"])
      fail("Season pass price is required.");
    return this.db.transaction(async (c) => {
      await c.query('LOCK TABLE "Food Menu" IN SHARE ROW EXCLUSIVE MODE');
      const rows = (await c.query('SELECT * FROM "Food Menu"')).rows;
      if (
        row.Day !== "Season Pass" &&
        rows.some(
          (r) =>
            r.Day === row.Day &&
            r["Meal Time"] !== original?.["Meal Time"] &&
            r.Date !== row.Date,
        )
      )
        fail("All meals for one event must use the same event date.");
      if (
        original &&
        !rows.some(
          (r) =>
            r.Day === original.Day && r["Meal Time"] === original["Meal Time"],
        )
      )
        throw new NotFoundException("Menu row no longer exists.");
      if (
        row.Day === "Season Pass" &&
        rows.some(
          (r) =>
            r.Day === "Season Pass" &&
            (!original ||
              r.Day !== original.Day ||
              r["Meal Time"] !== original["Meal Time"]),
        )
      )
        fail("Only one season pass configuration is allowed.");
      if (
        original &&
        (original.Day !== row.Day ||
          original["Meal Time"] !== row["Meal Time"]) &&
        (
          await c.query(
            'SELECT 1 FROM "Booking Items" WHERE "Day Name"=$1 AND "Meal Type"=$2 LIMIT 1',
            [original.Day, original["Meal Time"]],
          )
        ).rowCount
      )
        fail(
          "Booked event identities cannot be renamed. Prices and menu text can be edited.",
        );
      const existing = rows.find(
        (r) =>
          r.Day === original?.Day && r["Meal Time"] === original?.["Meal Time"],
      );
      if (
        existing &&
        existing.Date !== row.Date &&
        (
          await c.query(
            'SELECT 1 FROM "Booking Items" WHERE "Day Name"=$1 AND "Meal Type"=$2 LIMIT 1',
            [original!.Day, original!["Meal Time"]],
          )
        ).rowCount
      )
        fail("The date of an already booked event cannot be changed.");
      if (original)
        await c.query(
          'DELETE FROM "Food Menu" WHERE "Day"=$1 AND "Meal Time"=$2',
          [original.Day, original["Meal Time"]],
        );
      await c.query(
        `INSERT INTO "Food Menu" (${MENU_COLUMNS.map((k) => `"${k}"`).join(",")}) VALUES (${MENU_COLUMNS.map((_, i) => "$" + (i + 1)).join(",")})`,
        MENU_COLUMNS.map((k) => (row as any)[k]),
      );
      const all = (await c.query('SELECT * FROM "Food Menu"')).rows;
      if (
        all.some((r) => r.Day === "Season Pass") &&
        !menuFromRows(all, false).seasonPass
      )
        fail("Season pass included days must match existing dated events.");
      return { saved: true };
    });
  }
  async deleteMenu(input: unknown) {
    const p = parse(
      z.object({ Day: z.string(), "Meal Time": z.string() }),
      input,
    );
    return this.db.transaction(async (c) => {
      await c.query('LOCK TABLE "Food Menu" IN SHARE ROW EXCLUSIVE MODE');
      if (
        (
          await c.query(
            'SELECT 1 FROM "Booking Items" WHERE "Day Name"=$1 AND "Meal Type"=$2 LIMIT 1',
            [p.Day, p["Meal Time"]],
          )
        ).rowCount
      )
        fail("Cannot remove a menu with existing bookings.");
      const result = await c.query(
        'DELETE FROM "Food Menu" WHERE "Day"=$1 AND "Meal Time"=$2',
        [p.Day, p["Meal Time"]],
      );
      const rows = (await c.query('SELECT * FROM "Food Menu"')).rows;
      if (
        rows.some((r) => r.Day === "Season Pass") &&
        !menuFromRows(rows, false).seasonPass
      )
        fail("This event is included in the season pass. Edit the pass first.");
      return { deleted: !!result.rowCount };
    });
  }
}
