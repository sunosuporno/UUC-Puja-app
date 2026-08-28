# UUC Pujo Bookings Apps Script

1. Rename the booking tab in Google Sheets to `Bookings`.
2. Add a second tab named `Booking Items` for reportable meal rows. The script can create it automatically if it is missing, or you can create it with these headers:

   ```text
   Booking Reference | Created At | Apt. No. | Day Name | Meal Type | Food Type | Service Type | Quantity | Unit Price | Line Total | Source
   ```

   If a resident books both dine-in and takeaway for the same meal, the app saves them as separate rows with the same day, meal, and food type, but different `Service Type` values.

3. Add a tab named `Food Menu` with these headers. The app reads this tab dynamically, so new veg/non-veg meal rows and price changes go live after the Apps Script deployment is refreshed.

   ```text
   Day | Meal Time | Menu Veg | Menu Non-Veg | Veg Takeaway Price | Veg Dine-In Price | Non-veg Takeaway Price | Non-Veg Dine-In Price
   ```

4. Open `Extensions` > `Apps Script` from that Sheet.
5. Replace the default `Code.gs` content with `Code.gs` from this folder and save.
6. Deploy it as a Web app. Choose `Execute as: Me` and grant the app access to run the web app.
7. Copy the deployed `/exec` URL. That is the URL the Expo app will use to create bookings.

The Sheet does not need to be shared publicly or made editable. The script is bound to the Sheet and runs with the deployer's permissions.
