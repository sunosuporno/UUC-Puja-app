# NestJS + PostgreSQL migration

The Expo app now calls this backend instead of Apps Script. The backend lives in this repository; it does not need a sibling project. PostgreSQL runs locally without a hosted account.

## Run locally

Requirements: Node.js 22.13+ and PostgreSQL 14+. Install dependencies in both the repository root and `backend` with `npm ci`.

The current development database is an isolated Postgres.app cluster in `backend/.postgres`, using a private Unix socket in `backend/.pgsocket`, port 55432. It does not use your default PostgreSQL database. From the repository root, start it after a restart:

```sh
/Applications/Postgres.app/Contents/Versions/14/bin/pg_ctl -D backend/.postgres -l backend/.postgres/server.log -o "-k $PWD/backend/.pgsocket -p 55432 -h ''" start
```

Local settings and the generated admin password are in `backend/.env.local` (gitignored). For another machine, copy `.env.example` to `.env.local`, create an empty database, and configure `DATABASE_URL`, `ADMIN_PASSWORD` (nonempty; no minimum length), and `SESSION_SECRET` (at least 32 characters). 

```sh
npm run db:migrate --prefix backend
npm run build --prefix backend
npm run start --prefix backend
```

In another terminal, from the repository root:

```sh
npm run web -- --port 8081
```

The root `.env.local` points `EXPO_PUBLIC_BOOKINGS_API_URL` to `http://localhost:3000/bookings`. Restart Expo after changing it. Open `http://localhost:8081`; admin is at `http://localhost:8081/admin` or the Dashboards button. Refreshing clears the in-memory admin session. For a physical phone, use your computer's LAN address, bind the API to `HOST=0.0.0.0`, and configure the frontend URL accordingly.

For backend development, `npm run dev --prefix backend` runs TypeScript directly; restart it after edits. Stop the isolated database with:

```sh
/Applications/Postgres.app/Contents/Versions/14/bin/pg_ctl -D backend/.postgres stop -m fast
```

## Preserved data

Source: [UUC Pujo Coupon Bookings](https://docs.google.com/spreadsheets/d/1BOVNzrNe5qgWFLcG17W2rxw87rKQYjMHx7bA8pE6pKY/edit). The source workbook was read only and remains unchanged.

There are exactly five application tables, with every named source column preserved except the requested Bookings messaging changes. SQL identifiers retain the sheet names and original spelling. Empty Subscription and formula dashboard tabs are excluded; Resident Master is preserved as data, without adding a new resident-management screen.

| Table | Columns | Imported rows |
| --- | ---: | ---: |
| Bookings | 12 | 0 |
| Booking Items | 12 | 0 |
| Food Menu | 9 | 18 |
| Donations | 8 | 543 |
| Resident Master | 12 | 1,102 |

The blank unnamed leading Donations column is not a database column. Pre-numbered donation placeholders and duplicate receipt numbers are preserved, so `Recipt No.` deliberately is not unique. Imported donation total: ₹1,619,509.00. Source Season Pass price is ₹1,200.

Bookings renames: `WhatsApp Number` → `Phone Number`, `WhatsApp Status` → `SMS Status`, `WhatsApp Message ID` → `SMS Request ID`, `WhatsApp Sent At` → `SMS Sent At`. Phone numbers are normalized with the country prefix. `SMS Status` is JSONB: it holds notification state/errors plus request IDs, replay results, and customer name. This keeps the requested table/column count, at the cost of combining operational metadata in this column. Booking item IDs derive from the existing composite key rather than spreadsheet row positions.

The exact SQL definitions are in `sql/001-schema.sql`. Dates/prices have database types and constraints; money calculations use integer paise. Booking dates and report boundaries use Asia/Kolkata.

## Import and cutover

The private read snapshot is in `data/snapshot.local.json`, excluded from Git along with local databases and credentials. The importer refuses any nonempty target application table. Dry run is the default and rolls back all imported rows; `--apply` commits:

```sh
npm run db:import --prefix backend -- data/snapshot.local.json
npm run db:import --prefix backend -- data/snapshot.local.json --apply
```

The current local database has already been imported. Do not rerun against it. For production, pause old-app writes, take a fresh source snapshot in the same header/rows format, migrate/import an empty production database, reconcile row counts/totals, then point the frontend at the new API and rebuild it. This is a one-time migration, not live synchronization with Sheets. Keep the old workbook as the cutover backup and configure PostgreSQL backups separately.

## Booking and admin behavior

Residents without a donation record can select “Pay donation only” after entering their name on the home screen. This goes directly to the ₹4,000 payment summary and receipt entry, supporting cash, cheque, and UPI recording. `createDonation` writes Donations and Resident Master together; it creates no Bookings or Booking Items rows, so it does not appear in the existing booking collection report. Identical receipt/payment submissions for the same flat return the existing receipt; conflicting donations are rejected. No SMS is sent for this donation-only flow.

- Donation eligibility, prices, event dates, season-pass completeness, and quantities are checked on the server.
- A new donation requires the entered receipt number (stored in the original `Recipt No.` column) and marks matching Resident Master rows `Paid`, matching Block to tower and Unit No to apartment, ignoring case and outer whitespace. If no resident matches, the donation still saves without creating a resident. Food-only bookings do not change resident status.
- Booking header, items, donation, resident payment status, and pending notification commit in one database transaction. Repeating the same request ID returns the existing result. Changed content with that ID is rejected.
- Season passes allow separate dine-in and takeaway quantities for each included day at checkout. Their sum on every day must equal the number of passes; changing one service quantity adjusts the other. Takeaway costs ₹30 per person per selected day. After payment, selected quantities on individual days can be upgraded for ₹30 each; downgrades/refunds are not supported. Older blank-service pass rows are treated as dine-in for upgrades.
- Partial dine-in → takeaway upgrades split the chosen quantity and charge only its price difference. Row/advisory locks prevent competing upgrades from consuming the same quantity. Retrying the request does not charge again.
- Admin can add/edit event meals and season-pass configuration. Saving publishes to the food menu immediately; there is no draft column. Booked event identities cannot be renamed/deleted. Price changes apply to future bookings.
- Apartment coupons is an admin-only lookup by tower and apartment. It counts meal coupons (including each season-pass day), distinct bookings, and daily meal/service/source quantities. One parameterized query filters Booking Items using the existing `items_apartment` index and aggregates in PostgreSQL; donations are excluded.
- Coupon Detail and Bookings/date collection reports query PostgreSQL. The formula Coupon Summary dashboard is removed. Collection follows the original creation-date accounting behavior, including later upgrades in the original booking's amount.
- Payment methods retain the existing recording flow. This does not independently verify a UPI payment or bank settlement.

Admin routes/reports require a signed, expiring session from the private admin password. The existing resident flow still looks bookings up by apartment without OTP: it is suitable only within the original trusted-operator access model. Add resident verification and public API rate limiting before exposing it as an unrestricted resident self-service system. The login limiter is process-local; a multi-instance deployment needs a shared/edge limiter.

## MSG91 SMS

Default `SMS_MODE=mock` sends nothing. Production sending needs your MSG91 authentication key, approved SMS flow/template ID, and `MSG91_VARIABLE_MAP` matching the template variables. Available fields: `bookingReference`, `apartmentNumber`, `amount`, `customerName`, `bookingDetails`. Keep all credentials in backend environment variables, never `EXPO_PUBLIC_*`.

Set `SMS_MODE=msg91` only after those values are configured. Immediately after a new booking transaction commits, the same API request calls MSG91 with a five-second timeout, records the outcome, and returns booking success. There are no timers, scheduled jobs, background processors, or automatic retries. Replaying a booking request does not resend the SMS.

Booking success does not depend on MSG91. States include `pending`, `sending`, `mock`, `accepted`, `failed`, and `unknown`. HTTP 4xx/5xx responses are `failed` with the status/error recorded, including non-JSON error responses. Timeouts or missing responses are `unknown`. `accepted` and `SMS Sent At` mean provider submission, not confirmed handset delivery; delivery callbacks are not implemented. Admin can inspect outcomes through authenticated `GET /admin/sms`.

If the process stops between commit and sending, a message can remain pending/sending; no recovery job runs. If storing the SMS outcome fails, the API still returns booking success and logs the problem. The confirmation screen can wait up to the provider timeout in addition to normal database work.

`SMS_DAILY_LIMIT` bounds claimed booking messages per database day (default 100). It is an application guard, not a provider billing cap; long messages can consume multiple SMS segments. No live MSG91 message has been sent during development.

## Tests and deployment

Create a separate empty database whose name ends with `_test` and set `TEST_DATABASE_URL`. Tests deliberately truncate that database's five tables and refuse other database names.

```sh
npm run build --prefix backend
npm test --prefix backend
npx tsc --noEmit
npm run build
```

The integration suite covers transaction rollback, donation eligibility, concurrent/retried bookings and upgrades, price validation, pass rounding, report dates, admin validation, and notification outcomes. Browser verification covered admin login, event publication, donor eligibility, and checkout against the local database.

The frontend can stay on Vercel; root `vercel.json` supports `/admin` navigation. Host this backend as a persistent Node process with PostgreSQL (local or managed), set `HOST=0.0.0.0`, production CORS origins, private secrets, and HTTPS. Use `npm ci`, `npm run build`, and `npm start` inside `backend`; run migrations separately before starting the release. Use your database provider's required TLS configuration.

Vercel supports NestJS entry points such as `src/main.ts` directly. Deploying the backend there still requires verifying the build, configuring hosted PostgreSQL and production secrets, and testing the deployed flow. SMS is sent within the booking request, so no scheduler is required. Nothing has been published or provisioned in a paid service.
