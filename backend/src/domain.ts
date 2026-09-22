import { BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { z } from "zod";
export const DEFAULT_DAYS = ["Saptami 1", "Saptami 2", "Nabami"];
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const slug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
export const cents = (v: unknown) => Math.round(Number(v) * 100);
export const amount = (v: unknown) => cents(v) / 100;
export const fail = (message: string): never => {
  throw new BadRequestException(message);
};
export const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid date");
const apartment = z
  .string()
  .trim()
  .toUpperCase()
  .max(20)
  .regex(/^[A-Z0-9]+(?:[ -][A-Z0-9]+)*$/);
export const locationSchema = z.object({
  towerNumber: z.enum(["1", "2", "3", "4", "5", "6", "7", "8", "9", "TH"]),
  apartmentNumber: apartment,
});
export const requestIdSchema = z
  .string()
  .min(8)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/);
export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, "").replace(/^(?:91|0)(?=\d{10}$)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/))
  .transform((s) => "91" + s);
const money = z.number().finite().nonnegative().max(10000000);
export const paymentSchema = z
  .object({
    paymentMethod: z.enum(["cash", "cheque", "upi"]),
    payableAmount: money.positive(),
    paymentReference: z.string().trim().max(150).default(""),
  })
  .refine((p) => p.paymentMethod === "cash" || !!p.paymentReference, {
    message: "A cheque number or UPI transaction ID is required",
  });
export const itemSchema = z.object({
  dayName: z.string().trim().min(1).max(100),
  dayDate: dateSchema,
  mealType: z.string().trim().min(1).max(100),
  foodType: z.enum(["Veg", "Non-Veg", ""]).default(""),
  serviceType: z.enum(["Dine-In", "Takeaway", ""]).default(""),
  quantity: z.number().int().min(1).max(15),
  unitPrice: money,
  lineTotal: money,
  source: z.enum(["Individual", "Season Pass"]),
});
export const donationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^\p{L}[\p{L}\p{M} .'’\-]*$/u),
  amount: z.literal(4000),
  receiptNumber: z
    .string()
    .trim()
    .regex(/^[0-9]{1,15}$/, "Enter a receipt number containing up to 15 digits")
    .refine((v) => Number(v) > 0, "Receipt number must be greater than zero"),
});
export type Item = z.infer<typeof itemSchema>;
export type MenuRow = Record<string, any>;
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    fail(result.error.issues.map((i) => i.message).join("; "));
  return result.data as T;
}
export const aptNo = (p: { towerNumber: string; apartmentNumber: string }) =>
  `${p.towerNumber}/${p.apartmentNumber}`;
export function menuFromRows(rows: MenuRow[], activeOnly = true) {
  const days: any[] = [];
  for (const row of rows) {
    if (row.Day === "Season Pass" || (activeOnly && row.Date < today()))
      continue;
    let day = days.find((d) => d.date === row.Date && d.name === row.Day);
    if (!day) {
      day = { date: row.Date, name: row.Day, meals: [] };
      days.push(day);
    }
    for (const food of ["Veg", "Non-Veg"]) {
      const non = food === "Non-Veg";
      const menu = row[non ? "Menu Non-Veg" : "Menu Veg"];
      if (!menu) continue;
      day.meals.push({
        id: [row.Date, row.Day, row["Meal Time"], food].map(slug).join("-"),
        mealTime: row["Meal Time"],
        foodType: food,
        menu,
        dineInPrice: Number(
          row[non ? "Non-Veg Dine-In Price" : "Veg Dine-In Price"],
        ),
        takeawayPrice: Number(
          row[non ? "Non-veg Takeaway Price" : "Veg Takeaway Price"],
        ),
      });
    }
  }
  const pass = rows.find((r) => r.Day === "Season Pass");
  let seasonPass: any = null;
  if (pass) {
    const includedDays = String(pass["Menu Veg"] || DEFAULT_DAYS.join(","))
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const includedDates = includedDays.map(
      (n) =>
        rows.find((r) => slug(r.Day) === slug(n) && r.Day !== "Season Pass")
          ?.Date || "",
    );
    const price = Number(
      pass["Veg Dine-In Price"] ||
        pass["Veg Takeaway Price"] ||
        pass["Non-Veg Dine-In Price"] ||
        pass["Non-veg Takeaway Price"] ||
        1450,
    );
    if (
      includedDates.every(Boolean) &&
      (!activeOnly || includedDates.every((d) => d >= today()))
    )
      seasonPass = {
        price,
        mealType: pass["Meal Time"] || "Lunch",
        includedDays,
        includedDates,
        description: `Includes ${(pass["Meal Time"] || "Lunch").toLowerCase()} for ${includedDays.join(", ")}`,
      };
  }
  return { days: days.filter((d) => d.meals.length), seasonPass };
}
export function validatePrices(
  items: Item[],
  menu: ReturnType<typeof menuFromRows>,
) {
  const passItems = items.filter((i) => i.source === "Season Pass");
  const pass = menu.seasonPass;
  if (passItems.length) {
    if (!pass) fail("Select the complete available season pass.");
    const seen = new Set<string>();
    const dayQuantities = new Map<number, number>();
    passItems.forEach((i) => {
      const idx = pass.includedDays.findIndex(
        (n: string) => slug(n) === slug(i.dayName),
      );
      if (
        idx < 0 ||
        seen.has(`${idx}:${i.serviceType || "Dine-In"}`) ||
        i.dayDate !== pass.includedDates[idx] ||
        i.mealType !== pass.mealType
      )
        fail("Invalid season pass selection.");
      seen.add(`${idx}:${i.serviceType || "Dine-In"}`);
      dayQuantities.set(idx, (dayQuantities.get(idx) || 0) + i.quantity);
      // Allocate any fractional paise deterministically so all days sum to the pass price.
      const base = Math.floor(cents(pass.price) / pass.includedDays.length);
      const unit =
        (base +
          (idx < cents(pass.price) % pass.includedDays.length ? 1 : 0) +
          (i.serviceType === "Takeaway" ? 3000 : 0)) /
        100;
      if (cents(i.unitPrice) !== cents(unit))
        fail("Season pass price changed. Refresh the menu.");
      i.unitPrice = unit;
      i.foodType = "";
      i.serviceType = i.serviceType || "Dine-In";
    });
    if (dayQuantities.size !== pass.includedDays.length)
      fail("Select the complete available season pass.");
    const quantities = [...dayQuantities.values()];
    if (quantities[0] > 15 || quantities.some((q) => q !== quantities[0]))
      fail(
        "Each season pass day must contain the same total quantity (up to 15).",
      );
  }
  for (const item of items) {
    if (item.dayDate < today()) fail(`${item.dayName} is no longer available.`);
    if (item.source === "Individual") {
      const day = menu.days.find(
        (d) => d.date === item.dayDate && slug(d.name) === slug(item.dayName),
      );
      const meal = day?.meals.find(
        (m: any) =>
          m.mealTime === item.mealType && m.foodType === item.foodType,
      );
      if (!meal || !["Dine-In", "Takeaway"].includes(item.serviceType))
        fail("This meal is unavailable. Refresh the menu.");
      const price =
        item.serviceType === "Takeaway" ? meal.takeawayPrice : meal.dineInPrice;
      if (cents(item.unitPrice) !== cents(price))
        fail("Menu prices changed. Refresh before booking.");
      item.unitPrice = price;
    }
    if (cents(item.lineTotal) !== cents(item.unitPrice) * item.quantity)
      fail("Item total does not match its quantity and price.");
    item.lineTotal = (cents(item.unitPrice) * item.quantity) / 100;
  }
}
export function itemFromRow(r: any): Item {
  return {
    dayName: r["Day Name"],
    dayDate: r["Day Date"],
    mealType: r["Meal Type"],
    foodType: r["Food Type"],
    serviceType: r["Service Type"],
    quantity: Number(r.Quantity),
    unitPrice: Number(r["Unit Price"]),
    lineTotal: Number(r["Line Total"]),
    source: r.Source,
  };
}
export function itemKey(reference: string, item: Item) {
  return Buffer.from(
    JSON.stringify([
      reference,
      item.dayDate,
      item.dayName,
      item.mealType,
      item.foodType,
      item.serviceType,
      item.source,
      item.unitPrice,
    ]),
  ).toString("base64url");
}
export function details(items: Item[], donationText = "") {
  const parts = donationText ? [donationText] : [];
  const passes = items.filter((i) => i.source === "Season Pass");
  if (passes.length) {
    const quantities = new Map<string, number>();
    for (const i of passes) {
      const key = JSON.stringify([i.dayDate, i.dayName, i.mealType]);
      quantities.set(key, (quantities.get(key) || 0) + i.quantity);
    }
    parts.push(`Season pass x ${Math.max(...quantities.values())}`);
  }
  for (const i of passes)
    parts.push(
      `${i.dayName}: Season pass ${i.mealType} (${i.serviceType || "Dine-In"}) x ${i.quantity}`,
    );
  const days = new Map<string, string[]>();
  for (const i of items.filter((i) => i.source === "Individual")) {
    const list = days.get(i.dayName) || [];
    list.push(
      `${i.mealType} (${i.foodType}, ${i.serviceType}) x ${i.quantity}`,
    );
    days.set(i.dayName, list);
  }
  for (const [day, list] of days) parts.push(`${day}: ${list.join(", ")}`);
  return parts.join("; ");
}
