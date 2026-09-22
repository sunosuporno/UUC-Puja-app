import "reflect-metadata";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Database } from "../src/database";
import { BookingsService } from "../src/bookings.service";
import { SmsService } from "../src/sms.service";
import { Auth } from "../src/auth";
import { today } from "../src/domain";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error(
    "TEST_DATABASE_URL must point to a dedicated database ending in _test",
  );
process.env.DATABASE_URL = url;
const db = new Database(),
  sms = new SmsService(db),
  bookings = new BookingsService(db, sms);
const loc = { towerNumber: "1", apartmentNumber: "101" };
const menu = {
  Day: "Test Event",
  "Meal Time": "Lunch",
  "Menu Veg": "Rice and vegetables",
  "Menu Non-Veg": "Chicken and rice",
  "Veg Takeaway Price": 130,
  "Veg Dine-In Price": 100,
  "Non-veg Takeaway Price": 160,
  "Non-Veg Dine-In Price": 140,
  Date: "2099-10-17",
};
function order(overrides: any = {}) {
  return {
    ...loc,
    phoneNumber: "9876543210",
    bookingRequestId: "booking-test-0001",
    paymentMethod: "cash",
    payableAmount: 500,
    paymentReference: "",
    bookingItems: [
      {
        dayName: "Test Event",
        dayDate: "2099-10-17",
        mealType: "Lunch",
        foodType: "Veg",
        serviceType: "Dine-In",
        quantity: 5,
        unitPrice: 100,
        lineTotal: 500,
        source: "Individual",
      },
    ],
    ...overrides,
  };
}
async function upgrade(q = 2, id = "upgrade-test-0001", extra: any = {}) {
  const [b] = await bookings.bookings(loc);
  return bookings.upgrade({
    ...loc,
    paymentMethod: "cash",
    paymentReference: "",
    payableAmount: q * 30,
    upgradeRequestId: id,
    itemUpgrades: [
      {
        itemId: b.items.find((i: any) => i.serviceType === "Dine-In")!.id,
        quantity: q,
      },
    ],
    ...extra,
  });
}
before(async () => {
  await db.pool.query(
    readFileSync(new URL("../sql/001-schema.sql", import.meta.url), "utf8"),
  );
});
beforeEach(async () => {
  await db.pool.query(
    'TRUNCATE "Booking Items","Bookings","Donations","Food Menu","Resident Master" RESTART IDENTITY CASCADE',
  );
  await bookings.saveMenu({ row: menu });
  await db.pool.query(
    'INSERT INTO "Donations" ("TWR","Apt. No.","NAME","Amount") VALUES ($1,$2,$3,4000)',
    [loc.towerNumber, loc.apartmentNumber, "Existing Donor"],
  );
  process.env.SMS_MODE = "mock";
  process.env.SMS_DAILY_LIMIT = "100";
});
after(async () => {
  await db.onModuleDestroy();
});
test("schema keeps exactly the five source tables and all original column counts", async () => {
  const rows = (
    await db.pool.query(
      "SELECT table_name,count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name ORDER BY table_name",
    )
  ).rows;
  assert.deepEqual(rows, [
    { table_name: "Booking Items", n: 12 },
    { table_name: "Bookings", n: 12 },
    { table_name: "Donations", n: 8 },
    { table_name: "Food Menu", n: 9 },
    { table_name: "Resident Master", n: 12 },
  ]);
});
test("booking saves items and pending SMS; identical concurrent retries return one order", async () => {
  const result = await Promise.all([
    bookings.create(order()),
    bookings.create(order()),
  ]);
  assert.equal(result[0].bookingReference, result[1].bookingReference);
  assert.equal(
    (await db.pool.query('SELECT "Phone Number" FROM "Bookings"')).rows[0][
      "Phone Number"
    ],
    "+919876543210",
  );
  assert.equal((await db.pool.query('SELECT * FROM "Bookings"')).rowCount, 1);
  assert.equal(
    (await db.pool.query('SELECT * FROM "Booking Items"')).rowCount,
    1,
  );
  assert.equal(result[0].smsStatus, "mock");
  await assert.rejects(
    bookings.create(order({ phoneNumber: "9876543211" })),
    /different booking/,
  );
});
test("tampered menu price and incomplete totals are rejected without partial data", async () => {
  const p = order();
  p.bookingItems[0].unitPrice = 1;
  p.bookingItems[0].lineTotal = 5;
  p.payableAmount = 5;
  await assert.rejects(bookings.create(p), /prices changed/);
  await assert.rejects(
    bookings.create(order({ payableAmount: 499 })),
    /total changed/,
  );
  assert.equal((await db.pool.query('SELECT * FROM "Bookings"')).rowCount, 0);
});
test("database failure after booking insert rolls back the booking and all items", async () => {
  await db.pool.query(
    `CREATE FUNCTION fail_test_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER fail_test BEFORE INSERT ON "Booking Items" FOR EACH ROW EXECUTE FUNCTION fail_test_item()`,
  );
  try {
    await assert.rejects(bookings.create(order()), /test failure/);
    assert.equal((await db.pool.query('SELECT * FROM "Bookings"')).rowCount, 0);
  } finally {
    await db.pool.query(
      'DROP TRIGGER fail_test ON "Booking Items"; DROP FUNCTION fail_test_item()',
    );
  }
});
test("donations are atomic and duplicate donations reject the entire new order", async () => {
  await db.pool.query('DELETE FROM "Donations"');
  await bookings.create(
    order({
      donation: { name: "Test Resident", amount: 4000, receiptNumber: "731" },
      payableAmount: 4500,
    }),
  );
  assert.equal(
    (await db.pool.query('SELECT "Ph #" FROM "Donations"')).rows[0]["Ph #"],
    "+919876543210",
  );
  assert.equal(
    (await db.pool.query('SELECT "Recipt No." FROM "Donations"')).rows[0][
      "Recipt No."
    ],
    "731",
  );
  assert.deepEqual(await bookings.checkDonation(loc), {
    eligible: true,
    donorName: "Test Resident",
  });
  await assert.rejects(
    bookings.create(
      order({
        bookingRequestId: "booking-second-0002",
        donation: { name: "Test Resident", amount: 4000, receiptNumber: "731" },
        payableAmount: 4500,
      }),
    ),
    /already exists/,
  );
  assert.equal((await db.pool.query('SELECT * FROM "Bookings"')).rowCount, 1);
});
test("partial upgrade splits quantities and updates totals; retries do not double-charge", async () => {
  await bookings.create(order());
  const [b] = await bookings.bookings(loc);
  const p = {
    ...loc,
    paymentMethod: "cash",
    payableAmount: 60,
    upgradeRequestId: "upgrade-test-0001",
    itemUpgrades: [{ itemId: b.items[0].id, quantity: 2 }],
  };
  await bookings.upgrade(p);
  await bookings.upgrade(p);
  const [updated] = await bookings.bookings(loc);
  assert.equal(updated.payableAmount, 560);
  assert.equal(
    updated.items.find((i: any) => i.serviceType === "Dine-In")!.quantity,
    3,
  );
  assert.equal(
    updated.items.find((i: any) => i.serviceType === "Takeaway")!.quantity,
    2,
  );
  assert.match(updated.bookingDetails, /Dine-In\) x 3/);
  await assert.rejects(
    bookings.upgrade({ ...p, paymentMethod: "upi", paymentReference: "new" }),
    /different upgrade/,
  );
});
test("concurrent upgrades cannot consume more coupons than exist", async () => {
  await bookings.create(order());
  const [b] = await bookings.bookings(loc);
  const p = {
    ...loc,
    paymentMethod: "cash",
    payableAmount: 120,
    itemUpgrades: [{ itemId: b.items[0].id, quantity: 4 }],
  };
  const results = await Promise.allSettled([
    bookings.upgrade({ ...p, upgradeRequestId: "upgrade-concurrent-1" }),
    bookings.upgrade({ ...p, upgradeRequestId: "upgrade-concurrent-2" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const [updated] = await bookings.bookings(loc);
  assert.equal(updated.payableAmount, 620);
  assert.equal(
    updated.items.reduce((n: number, i: any) => n + i.quantity, 0),
    5,
  );
});
test("upgrades reject another apartment and a conflicting booking reference", async () => {
  await bookings.create(order());
  await assert.rejects(
    upgrade(1, "upgrade-wrong-ref", { bookingReference: "UUC99-999999" }),
    /another booking/,
  );
  const [b] = await bookings.bookings(loc);
  await assert.rejects(
    bookings.upgrade({
      ...loc,
      apartmentNumber: "102",
      paymentMethod: "cash",
      payableAmount: 30,
      upgradeRequestId: "upgrade-wrong-apt",
      itemUpgrades: [{ itemId: b.items[0].id, quantity: 1 }],
    }),
    /another apartment/,
  );
});
test("season pass requires every included date and exact total allocation", async () => {
  await bookings.saveMenu({
    row: { ...menu, Day: "Second Event", Date: "2099-10-18" },
  });
  await bookings.saveMenu({
    row: {
      ...menu,
      Day: "Season Pass",
      Date: null,
      "Menu Veg": "Test Event, Second Event",
      "Menu Non-Veg": "",
      "Veg Dine-In Price": 199.99,
    },
  });
  const items = [
    {
      ...order().bookingItems[0],
      source: "Season Pass",
      foodType: "",
      serviceType: "",
      quantity: 1,
      unitPrice: 100,
      lineTotal: 100,
    },
    {
      ...order().bookingItems[0],
      dayName: "Second Event",
      dayDate: "2099-10-18",
      source: "Season Pass",
      foodType: "",
      serviceType: "",
      quantity: 1,
      unitPrice: 99.99,
      lineTotal: 99.99,
    },
  ];
  await assert.rejects(
    bookings.create(
      order({ bookingItems: items.slice(0, 1), payableAmount: 100 }),
    ),
    /complete available season pass/,
  );
  await bookings.create(order({ bookingItems: items, payableAmount: 199.99 }));
  assert.equal((await bookings.bookings(loc))[0].payableAmount, 199.99);
});
test("past meals disappear and cannot be booked", async () => {
  await bookings.saveMenu({
    row: { ...menu, Day: "Expired", Date: "2020-01-01" },
  });
  assert.equal((await bookings.menu()).days.length, 1);
  const p = order();
  p.bookingItems[0].dayName = "Expired";
  p.bookingItems[0].dayDate = "2020-01-01";
  await assert.rejects(bookings.create(p), /no longer available/);
});
test("admin event publishing updates public menu; booked identities are protected", async () => {
  await bookings.create(order());
  await bookings.saveMenu({
    original: { Day: menu.Day, "Meal Time": menu["Meal Time"] },
    row: { ...menu, "Menu Veg": "New description", "Veg Dine-In Price": 110 },
  });
  assert.equal((await bookings.menu()).days[0].meals[0].dineInPrice, 110);
  await assert.rejects(bookings.deleteMenu(menu), /existing bookings/);
  await assert.rejects(
    bookings.saveMenu({ original: menu, row: { ...menu, Date: "2099-10-19" } }),
    /date/,
  );
});
test("reports preserve original-date collection semantics and SQL aggregate quantities", async () => {
  await bookings.create(order());
  await upgrade();
  const summary = await bookings.summary();
  assert.equal(summary.totals.quantity, 5);
  assert.equal(summary.totals.dineIn, 3);
  assert.equal(summary.totals.takeaway, 2);
  assert.equal(summary.totals.amountCollected, 560);
  const report = await bookings.collection({
    fromDate: today(),
    toDate: today(),
  });
  assert.equal(report.totalCollection, 560);
  assert.equal(report.bookings.length, 1);
  await db.pool.query(
    `UPDATE "Bookings" SET "Created At"='2099-01-01T18:30:00Z'`,
  );
  assert.equal(
    (
      await bookings.collection({
        fromDate: "2099-01-02",
        toDate: "2099-01-02",
      })
    ).bookings.length,
    1,
  );
  assert.equal(
    (
      await bookings.collection({
        fromDate: "2099-01-01",
        toDate: "2099-01-01",
      })
    ).bookings.length,
    0,
  );
});
test("SMS failure returns booking success and is not retried", async () => {
  process.env.SMS_MODE = "msg91";
  delete process.env.MSG91_AUTH_KEY;
  const result = await bookings.create(order());
  assert.equal(result.smsStatus, "failed");
  assert.equal((await bookings.bookings(loc))[0].payableAmount, 500);
  assert.equal((await bookings.create(order())).smsStatus, "failed");
  assert.equal(
    (await db.pool.query('SELECT "SMS Status" FROM "Bookings"')).rows[0][
      "SMS Status"
    ].attempts,
    1,
  );
});
test("SMS is sent immediately after commit and accepted outcome is saved", async () => {
  process.env.SMS_MODE = "msg91";
  process.env.MSG91_AUTH_KEY = "test";
  process.env.MSG91_TEMPLATE_ID = "template-test";
  process.env.MSG91_VARIABLE_MAP = '{"VAR1":"bookingReference"}';
  const old = global.fetch;
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls++;
    // Another connection sees committed data before the provider call.
    assert.equal((await db.pool.query('SELECT * FROM "Bookings"')).rowCount, 1);
    assert.equal(
      (await db.pool.query('SELECT * FROM "Booking Items"')).rowCount,
      1,
    );
    assert.equal(
      JSON.parse(String(options?.body)).recipients[0].mobiles,
      "919876543210",
    );
    return new Response(
      JSON.stringify({ type: "success", message: "request-123" }),
      { status: 200 },
    );
  };
  try {
    assert.equal((await bookings.create(order())).smsStatus, "accepted");
    await bookings.create(order());
    assert.equal(calls, 1);
    assert.equal((await sms.list())[0].requestId, "request-123");
  } finally {
    global.fetch = old;
  }
});
test("timeout records unknown once; mock mode never contacts provider", async () => {
  process.env.SMS_MODE = "msg91";
  process.env.MSG91_AUTH_KEY = "test";
  process.env.MSG91_TEMPLATE_ID = "test";
  const old = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    throw new Error("timeout");
  };
  try {
    assert.equal((await bookings.create(order())).smsStatus, "unknown");
    await bookings.create(order());
    assert.equal(calls, 1);
    process.env.SMS_MODE = "mock";
    assert.equal(
      (await bookings.create(order({ bookingRequestId: "booking-mock-0002" })))
        .smsStatus,
      "mock",
    );
    assert.equal(calls, 1);
  } finally {
    global.fetch = old;
  }
});
test("daily cap records failure immediately without queuing a later send", async () => {
  process.env.SMS_DAILY_LIMIT = "1";
  const results = await Promise.all([
    bookings.create(order()),
    bookings.create(order({ bookingRequestId: "booking-second-0002" })),
  ]);
  assert.deepEqual(results.map((r) => r.smsStatus).sort(), ["failed", "mock"]);
});
test("notification infrastructure failure cannot fail a committed booking", async () => {
  const original = sms.sendBooking;
  sms.sendBooking = async () => {
    throw new Error("storage unavailable");
  };
  try {
    const result = await bookings.create(order());
    assert.equal(result.smsStatus, "unknown");
    assert.equal((await bookings.bookings(loc)).length, 1);
    assert.equal((await sms.list())[0].state, "unknown");
  } finally {
    sms.sendBooking = original;
  }
});
test("admin sessions reject missing, incorrect and tampered credentials", () => {
  process.env.ADMIN_PASSWORD = "test-password-long";
  process.env.SESSION_SECRET = "test-secret".repeat(8);
  const auth = new Auth();
  assert.throws(() => auth.require());
  assert.throws(() => auth.login("bad", "test"));
  const { token } = auth.login("test-password-long", "test");
  assert.doesNotThrow(() => auth.require("Bearer " + token));
  assert.throws(() => auth.require("Bearer " + token + "x"));
});

test("server enforces donation eligibility even when the frontend is bypassed", async () => {
  await db.pool.query('DELETE FROM "Donations"');
  await assert.rejects(bookings.create(order()), /donation record is required/);
  assert.equal((await db.pool.query('SELECT * FROM "Bookings"')).rowCount, 0);
});

test("4xx and 5xx including non-JSON errors are recorded as failed", async () => {
  process.env.SMS_MODE = "msg91";
  process.env.MSG91_AUTH_KEY = "test";
  process.env.MSG91_TEMPLATE_ID = "test";
  const old = global.fetch;
  try {
    for (const status of [400, 503]) {
      global.fetch = async () => new Response("Upstream error", { status });
      const result = await bookings.create(
        order({ bookingRequestId: `booking-http-${status}` }),
      );
      assert.equal(result.smsStatus, "failed");
      const row = (await sms.list()).find(
        (r) => r.bookingReference === result.bookingReference,
      );
      assert.match(row.error, new RegExp(`HTTP ${status}`));
    }
    assert.equal((await bookings.bookings(loc)).length, 2);
  } finally {
    global.fetch = old;
  }
});

async function createPassFixture() {
  await bookings.saveMenu({
    row: { ...menu, Day: "Second Event", Date: "2099-10-18" },
  });
  await bookings.saveMenu({
    row: {
      ...menu,
      Day: "Season Pass",
      Date: null,
      "Menu Veg": "Test Event, Second Event",
      "Menu Non-Veg": "",
      "Veg Dine-In Price": 199.99,
    },
  });
  return [
    {
      ...order().bookingItems[0],
      source: "Season Pass",
      foodType: "",
      serviceType: "Dine-In",
      quantity: 2,
      unitPrice: 100,
      lineTotal: 200,
    },
    {
      ...order().bookingItems[0],
      source: "Season Pass",
      dayName: "Second Event",
      dayDate: "2099-10-18",
      foodType: "",
      serviceType: "Takeaway",
      quantity: 2,
      unitPrice: 129.99,
      lineTotal: 259.98,
    },
  ];
}
test("season pass prices each takeaway day at 30 extra per person", async () => {
  const items = await createPassFixture();
  await assert.rejects(
    bookings.create(
      order({
        bookingItems: [
          items[0],
          { ...items[1], unitPrice: 99.99, lineTotal: 199.98 },
        ],
        payableAmount: 399.98,
      }),
    ),
    /Season pass price changed/,
  );
  await bookings.create(order({ bookingItems: items, payableAmount: 459.98 }));
  const [b] = await bookings.bookings(loc);
  assert.equal(b.payableAmount, 459.98);
  assert.equal(
    b.items.find((i) => i.dayName === "Test Event")!.serviceType,
    "Dine-In",
  );
  assert.equal(
    b.items.find((i) => i.dayName === "Second Event")!.serviceType,
    "Takeaway",
  );
  assert.equal(
    b.items.find((i) => i.dayName === "Second Event")!.upgradeable,
    false,
  );
});
test("season pass partial day upgrades preserve other days and retry safely", async () => {
  const items = await createPassFixture();
  await bookings.create(order({ bookingItems: items, payableAmount: 459.98 }));
  const [b] = await bookings.bookings(loc);
  const first = b.items.find((i) => i.dayName === "Test Event")!;
  assert.equal(first.extraUnitPrice, 30);
  const p = {
    ...loc,
    paymentMethod: "cash",
    payableAmount: 30,
    upgradeRequestId: "pass-upgrade-0001",
    itemUpgrades: [{ itemId: first.id, quantity: 1 }],
  };
  await bookings.upgrade(p);
  await bookings.upgrade(p);
  const [updated] = await bookings.bookings(loc);
  assert.equal(updated.payableAmount, 489.98);
  assert.equal(
    updated.items.find(
      (i) => i.dayName === "Test Event" && i.serviceType === "Dine-In",
    )!.quantity,
    1,
  );
  assert.equal(
    updated.items.find(
      (i) => i.dayName === "Test Event" && i.serviceType === "Takeaway",
    )!.quantity,
    1,
  );
  const second = updated.items.find((i) => i.dayName === "Second Event")!;
  assert.equal(second.quantity, 2);
  assert.equal(second.unitPrice, 129.99);
  await assert.rejects(
    bookings.upgrade({
      ...p,
      upgradeRequestId: "pass-downgrade-01",
      itemUpgrades: [{ itemId: second.id, quantity: 1 }],
    }),
    /no longer available/,
  );
  assert.match(
    updated.bookingDetails,
    /Test Event: Season pass Lunch \(Takeaway\) x 1/,
  );
});
test("legacy blank-service season pass days can upgrade for exactly 30", async () => {
  const items = await createPassFixture();
  await bookings.create(order({ bookingItems: items, payableAmount: 459.98 }));
  await db.pool.query(
    `UPDATE "Booking Items" SET "Service Type"='' WHERE "Day Name"='Test Event'`,
  );
  const [b] = await bookings.bookings(loc);
  const first = b.items.find((i) => i.dayName === "Test Event")!;
  assert.equal(first.upgradeable, true);
  await bookings.upgrade({
    ...loc,
    paymentMethod: "cash",
    payableAmount: 60,
    upgradeRequestId: "pass-legacy-0001",
    itemUpgrades: [{ itemId: first.id, quantity: 2 }],
  });
  assert.equal((await bookings.bookings(loc))[0].payableAmount, 519.98);
});

test("mixed service quantities within each pass day preserve pass totals and upgrade correctly", async () => {
  const original = await createPassFixture();
  const mixed = [
    { ...original[0], quantity: 1, lineTotal: 100 },
    {
      ...original[0],
      serviceType: "Takeaway",
      quantity: 1,
      unitPrice: 130,
      lineTotal: 130,
    },
    original[1],
  ];
  await bookings.create(order({ bookingItems: mixed, payableAmount: 489.98 }));
  const [b] = await bookings.bookings(loc);
  assert.equal(b.items.length, 3);
  assert.match(b.bookingDetails, /Season pass x 2/);
  const dine = b.items.find((i) => i.serviceType === "Dine-In")!;
  await bookings.upgrade({
    ...loc,
    paymentMethod: "cash",
    payableAmount: 30,
    upgradeRequestId: "mixed-pass-upgrade",
    itemUpgrades: [{ itemId: dine.id, quantity: 1 }],
  });
  const [updated] = await bookings.bookings(loc);
  assert.equal(updated.payableAmount, 519.98);
  assert.equal(
    updated.items.find((i) => i.dayName === "Test Event")!.quantity,
    2,
  );
  assert.equal(updated.items.length, 2);
});
test("split pass rows reject unequal day totals, duplicate services and more than 15 passes", async () => {
  const items = await createPassFixture();
  await assert.rejects(
    bookings.create(
      order({
        bookingItems: [{ ...items[0], quantity: 1, lineTotal: 100 }, items[1]],
        payableAmount: 359.98,
      }),
    ),
    /same total quantity/,
  );
  await assert.rejects(
    bookings.create(
      order({
        bookingItems: [items[0], items[0], items[1]],
        payableAmount: 659.98,
      }),
    ),
    /Invalid season pass/,
  );
  const tooMany = items.flatMap((i) => [
    {
      ...i,
      serviceType: "Dine-In",
      quantity: 8,
      unitPrice: i.dayName === "Test Event" ? 100 : 99.99,
      lineTotal: i.dayName === "Test Event" ? 800 : 799.92,
    },
    {
      ...i,
      serviceType: "Takeaway",
      quantity: 8,
      unitPrice: i.dayName === "Test Event" ? 130 : 129.99,
      lineTotal: i.dayName === "Test Event" ? 1040 : 1039.92,
    },
  ]);
  await assert.rejects(
    bookings.create(order({ bookingItems: tooMany, payableAmount: 3679.84 })),
    /up to 15/,
  );
});

test("donation receipt is required and validated before anything is saved", async () => {
  await db.pool.query('DELETE FROM "Donations"');
  for (const receiptNumber of [undefined, "", "0", "12x", "1234567890123456"]) {
    await assert.rejects(
      bookings.create(
        order({
          donation: { name: "Test Resident", amount: 4000, receiptNumber },
          payableAmount: 4500,
        }),
      ),
    );
  }
  assert.equal((await db.pool.query('SELECT * FROM "Bookings"')).rowCount, 0);
  assert.equal((await db.pool.query('SELECT * FROM "Donations"')).rowCount, 0);
});

test("new donation marks only the matching block and unit paid, including on replay", async () => {
  await db.pool.query('DELETE FROM "Donations"');
  await db.pool.query(
    `INSERT INTO "Resident Master" ("Block","Unit No","Paid") VALUES ('1','101','Unpaid'),('2','101','Unpaid'),('1','102','Unpaid')`,
  );
  const request = order({
    donation: { name: "Test Resident", amount: 4000, receiptNumber: "800" },
    payableAmount: 4500,
  });
  await bookings.create(request);
  await bookings.create(request);
  const rows = (
    await db.pool.query(
      'SELECT "Block","Unit No","Paid" FROM "Resident Master" ORDER BY "Block","Unit No"',
    )
  ).rows;
  assert.deepEqual(rows, [
    { Block: "1", "Unit No": "101", Paid: "Paid" },
    { Block: "1", "Unit No": "102", Paid: "Unpaid" },
    { Block: "2", "Unit No": "101", Paid: "Unpaid" },
  ]);
  assert.equal((await db.pool.query('SELECT * FROM "Donations"')).rowCount, 1);
});
test("food-only booking does not change resident donation status", async () => {
  await db.pool.query(
    `INSERT INTO "Resident Master" ("Block","Unit No","Paid") VALUES ('1','101','Unpaid')`,
  );
  await bookings.create(order());
  assert.equal(
    (await db.pool.query('SELECT "Paid" FROM "Resident Master"')).rows[0].Paid,
    "Unpaid",
  );
});
test("resident update failure rolls back booking, items and donation", async () => {
  await db.pool.query('DELETE FROM "Donations"');
  await db.pool.query(
    `INSERT INTO "Resident Master" ("Block","Unit No","Paid") VALUES ('1','101','Unpaid')`,
  );
  await db.pool.query(
    `CREATE FUNCTION fail_test_resident() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'resident update failure'; END $$; CREATE TRIGGER fail_resident BEFORE UPDATE ON "Resident Master" FOR EACH ROW EXECUTE FUNCTION fail_test_resident()`,
  );
  try {
    await assert.rejects(
      bookings.create(
        order({
          donation: {
            name: "Test Resident",
            amount: 4000,
            receiptNumber: "801",
          },
          payableAmount: 4500,
        }),
      ),
      /resident update failure/,
    );
    for (const table of ["Bookings", "Booking Items", "Donations"])
      assert.equal(
        (await db.pool.query(`SELECT * FROM "${table}"`)).rowCount,
        0,
      );
    assert.equal(
      (await db.pool.query('SELECT "Paid" FROM "Resident Master"')).rows[0]
        .Paid,
      "Unpaid",
    );
  } finally {
    await db.pool.query(
      'DROP TRIGGER fail_resident ON "Resident Master"; DROP FUNCTION fail_test_resident()',
    );
  }
});

test("donation-only payment saves receipt and resident status with no booking or coupons", async () => {
  await db.pool.query('DELETE FROM "Donations"');
  await db.pool.query(
    `INSERT INTO "Resident Master" ("Block","Unit No","Paid") VALUES ('1','101','Unpaid')`,
  );
  const request = order({
    bookingItems: [],
    payableAmount: 4000,
    donation: { name: "Test Resident", amount: 4000, receiptNumber: "920" },
  });
  const results = await Promise.all([
    bookings.donate(request),
    bookings.donate(request),
  ]);
  assert.deepEqual(results, [
    { receiptNumber: "920" },
    { receiptNumber: "920" },
  ]);
  const rows = (await db.pool.query('SELECT * FROM "Donations"')).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["Ph #"], "+919876543210");
  assert.equal(rows[0]["Transction ID"], "CASH");
  assert.equal(
    (await db.pool.query('SELECT "Paid" FROM "Resident Master"')).rows[0].Paid,
    "Paid",
  );
  for (const table of ["Bookings", "Booking Items"])
    assert.equal((await db.pool.query(`SELECT * FROM "${table}"`)).rowCount, 0);
  assert.equal((await bookings.checkDonation(loc)).eligible, true);
  await assert.rejects(
    bookings.donate({
      ...request,
      donation: { ...request.donation, receiptNumber: "921" },
    }),
    /already exists/,
  );
});
test("donation-only validates payment and receipt, preserving cheque and UPI references", async () => {
  await db.pool.query('DELETE FROM "Donations"');
  const request = order({
    payableAmount: 4000,
    donation: { name: "Test Resident", amount: 4000, receiptNumber: "922" },
  });
  await assert.rejects(
    bookings.donate({ ...request, payableAmount: 3999 }),
    /4,000/,
  );
  await assert.rejects(
    bookings.donate({
      ...request,
      donation: { ...request.donation, receiptNumber: "" },
    }),
  );
  for (const [index, method] of ["cheque", "upi"].entries()) {
    const apartmentNumber = String(201 + index);
    await bookings.donate({
      ...request,
      apartmentNumber,
      paymentMethod: method,
      paymentReference: `test-${method}`,
    });
    assert.equal(
      (
        await db.pool.query(
          'SELECT "Transction ID" FROM "Donations" WHERE "Apt. No."=$1',
          [apartmentNumber],
        )
      ).rows[0]["Transction ID"],
      `test-${method}`,
    );
  }
});
test("donation-only resident failure rolls back donation", async () => {
  await db.pool.query('DELETE FROM "Donations"');
  await db.pool.query(
    `INSERT INTO "Resident Master" ("Block","Unit No","Paid") VALUES ('1','101','Unpaid')`,
  );
  await db.pool.query(
    `CREATE FUNCTION fail_only_resident() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'resident failure'; END $$; CREATE TRIGGER fail_only BEFORE UPDATE ON "Resident Master" FOR EACH ROW EXECUTE FUNCTION fail_only_resident()`,
  );
  try {
    await assert.rejects(
      bookings.donate(
        order({
          payableAmount: 4000,
          donation: {
            name: "Test Resident",
            amount: 4000,
            receiptNumber: "923",
          },
        }),
      ),
      /resident failure/,
    );
    assert.equal(
      (await db.pool.query('SELECT * FROM "Donations"')).rowCount,
      0,
    );
    assert.equal(
      (await db.pool.query('SELECT "Paid" FROM "Resident Master"')).rows[0]
        .Paid,
      "Unpaid",
    );
  } finally {
    await db.pool.query(
      'DROP TRIGGER fail_only ON "Resident Master"; DROP FUNCTION fail_only_resident()',
    );
  }
});

test("apartment report totals include split season passes and upgrades without other flats", async () => {
  const items = await createPassFixture();
  await bookings.create(order({ bookingItems: items, payableAmount: 459.98 }));
  await bookings.create(order({ bookingRequestId: "report-second-booking" }));
  await bookings.create(
    order({
      apartmentNumber: "102",
      bookingRequestId: "report-other-flat",
      donation: { name: "Other Resident", amount: 4000, receiptNumber: "999" },
      payableAmount: 4500,
    }),
  );
  const [b] = await bookings.bookings(loc);
  const individual = b.items.find((i) => i.source === "Individual");
  const all = await bookings.bookings(loc);
  const i = all.flatMap((b) => b.items).find((i) => i.source === "Individual")!;
  await bookings.upgrade({
    ...loc,
    paymentMethod: "cash",
    payableAmount: 60,
    upgradeRequestId: "report-upgrade-001",
    itemUpgrades: [{ itemId: i.id, quantity: 2 }],
  });
  const r = await bookings.apartmentCoupons(loc);
  assert.equal(r.apartment, "1/101");
  assert.equal(r.totalCoupons, 9);
  assert.equal(r.totalBookings, 2);
  assert.equal(
    r.meals
      .filter((m) => m.dayName === "Test Event")
      .reduce((n, m) => n + m.quantity, 0),
    7,
  );
  assert.equal(
    r.meals
      .filter((m) => m.serviceType === "Takeaway")
      .reduce((n, m) => n + m.quantity, 0),
    4,
  );
  const empty = await bookings.apartmentCoupons({ ...loc, towerNumber: "2" });
  assert.equal(empty.totalCoupons, 0);
  assert.equal(empty.totalBookings, 0);
  assert.deepEqual(empty.meals, []);
  await assert.rejects(
    bookings.apartmentCoupons({ ...loc, towerNumber: "99" }),
  );
});
