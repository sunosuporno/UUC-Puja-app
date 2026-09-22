# UUC Pujo Bookings Apps Script

1. Rename the booking tab in Google Sheets to `Bookings`.
2. Add a second tab named `Booking Items` for reportable meal rows. The script can create it automatically if it is missing, or you can create it with these headers:

   ```text
   Booking Reference | Created At | Apt. No. | Day Name | Meal Type | Food Type | Service Type | Quantity | Unit Price | Line Total | Source | Day Date
   ```

   If a resident books both dine-in and takeaway for the same meal, the app saves them as separate rows with the same day, meal, and food type, but different `Service Type` values.
   `Day Date` is stored separately so reports and upgrade pricing remain stable even if the display name changes later, for example `Sashthi` to `Mahasasthi`.

3. Add a tab named `Food Menu` with these headers. The app reads this tab dynamically, so new veg/non-veg meal rows and price changes go live after the Apps Script deployment is refreshed.

   ```text
   Day | Meal Time | Menu Veg | Menu Non-Veg | Veg Takeaway Price | Veg Dine-In Price | Non-veg Takeaway Price | Non-Veg Dine-In Price | Date
   ```

   To control the season pass dynamically, add one special row:

   ```text
   Season Pass | Lunch | | | | 1450 | | |
   ```

   The app treats this as configuration only. It will not show as an individual meal card, and the pass will still be saved as one row per included day in `Booking Items`. Leave `Menu Veg` blank to use the default included days: `Saptami 1`, `Saptami 2`, `Ashtami`, and `Nabami`. After the updated Apps Script is deployed, you can optionally put a comma-separated included-day list in `Menu Veg`.

   Dated events remain available through their event date and are removed from the booking page starting the following day. A season pass is also removed once one of its included dated events has passed.

   When a resident upgrades dine-in items to takeaway, the matching `Booking Items` rows are updated to `Takeaway` with the new unit price and line total. The matching `Bookings` row is also updated with the new payable amount, regenerated booking details, and an appended upgrade payment note.

4. Keep the Pujo donation records in a tab named `Donations` in this same spreadsheet. The script discovers the header row using the existing tower and apartment headers. New donation records also store the payment date in `Date` and the resident's validated WhatsApp number in `Ph #`.

5. Open `Extensions` > `Apps Script` from that Sheet.
6. Replace the default `Code.gs` content with `Code.gs` from this folder and save.
7. In Apps Script settings, enable `Show "appsscript.json" manifest file in editor`, then replace the manifest content with `appsscript.json` from this folder and save.
8. Deploy it as a Web app. Choose `Execute as: Me`, set access to `Anyone`, and grant the app access to run the web app.
9. Copy the deployed `/exec` URL. That is the URL the Expo app will use to create bookings and manage takeaway upgrades.

The app's third admin dashboard uses the `getCollectionReport` action. It reads `Bookings` columns B:G, filters by the `Created At` date in the spreadsheet timezone, and returns the matching booking rows plus their total payable amount. Both ends of the selected date range are inclusive.
Its booking references open the existing takeaway-upgrade flow for only that reference. `getBookingsForApartment` accepts an optional `bookingReference` filter, and `upgradeToTakeaway` rejects items from other references when that filter is supplied. The home-screen apartment view still shows all bookings for the apartment.

The Sheet does not need to be shared publicly or made editable. The script is bound to the Sheet and runs with the deployer's permissions.

For WhatsApp confirmations, set these Script Properties: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME`, and `WHATSAPP_TEMPLATE_LANGUAGE`. The manifest uses the `script.storage` scope so the script can read these properties. The booking sheet displays WhatsApp numbers with a leading `+`, but the Cloud API send request uses the required digits-only format internally.
