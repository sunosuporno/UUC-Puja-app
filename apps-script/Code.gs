const BOOKINGS_SHEET_NAME = 'Bookings';
const BOOKING_ITEMS_SHEET_NAME = 'Booking Items';
const FOOD_MENU_SHEET_NAME = 'Food Menu';
const DONATIONS_SPREADSHEET_ID = '18496SQ_gLOH-XDOqomYS-pbO50WXcZwYaczf2WabyHo';
const DONATIONS_SHEET_NAME = 'Sheet3';
const DONATION_TOWER_HEADERS = ['TWR', 'Tower', 'Tower No.', 'Tower No', 'Tower Number'];
const DONATION_APARTMENT_HEADER = 'Apt. No.';
const DONATION_RECEIPT_HEADERS = ['Receipt No.', 'Recipt No.'];
const DONATION_NAME_HEADERS = ['Name'];
const DONATION_AMOUNT_HEADERS = ['Amount'];
const DONATION_TRANSACTION_HEADERS = ['Transaction ID', 'Transction ID'];
const DONATION_AMOUNT = 4000;
const EXPECTED_HEADERS = [
  'Sl No',
  'Booking Reference',
  'Created At',
  'Apt. No.',
  'Payment Method',
  'Payable Amount',
  'UPI Txn Id/cheque number',
  'Booking Details',
];
const BOOKING_ITEM_HEADERS = [
  'Booking Reference',
  'Created At',
  'Apt. No.',
  'Day Name',
  'Meal Type',
  'Food Type',
  'Service Type',
  'Quantity',
  'Unit Price',
  'Line Total',
  'Source',
];
const FOOD_MENU_HEADERS = [
  'Day',
  'Meal Time',
  'Menu Veg',
  'Menu Non-Veg',
  'Veg Takeaway Price',
  'Veg Dine-In Price',
  'Non-veg Takeaway Price',
  'Non-Veg Dine-In Price',
];
const FOOD_MENU_DAY_DATES = {
  Sashthi: '16 Oct',
  'Saptami 1': '17 Oct',
  'Saptami 2': '18 Oct',
  Ashtami: '19 Oct',
  Nabami: '20 Oct',
  Dashami: '21 Oct',
};

function doGet() {
  return jsonResponse({ ok: true, service: 'UUC Pujo bookings' });
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || '{}');

    if (payload.action === 'checkDonation') {
      const towerNumber = validateTowerNumber(payload.towerNumber);
      const apartmentNumber = validateApartmentNumber(payload.apartmentNumber);
      return jsonResponse({ ok: true, eligible: hasDonationRecord(towerNumber, apartmentNumber) });
    }

    if (payload.action === 'getFoodMenu') {
      return jsonResponse({ ok: true, menu: getFoodMenu() });
    }

    const booking = validateBooking(payload);
    const savedBooking = appendBooking(booking);
    return jsonResponse({ ok: true, booking: savedBooking });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || 'Unable to save booking.' });
  }
}

function validateBooking(payload) {
  const towerNumber = validateTowerNumber(payload.towerNumber);
  const apartmentNumber = validateApartmentNumber(payload.apartmentNumber);
  const paymentMethod = String(payload.paymentMethod || '').toLowerCase();
  const payableAmount = Number(payload.payableAmount);
  const paymentReference = String(payload.paymentReference || '').trim();
  const bookingDetails = String(payload.bookingDetails || '').trim();
  const donation = validateDonation(payload.donation);
  const bookingItems = validateBookingItems(payload.bookingItems, payableAmount, donation);

  if (!['cash', 'cheque', 'upi'].includes(paymentMethod)) throw new Error('Choose cash, cheque, or UPI.');
  if (!Number.isFinite(payableAmount) || payableAmount <= 0) throw new Error('A valid payable amount is required.');
  if (!bookingDetails) throw new Error('Booking details are required.');
  if (['cheque', 'upi'].includes(paymentMethod) && !paymentReference) {
    throw new Error('A cheque number or UPI transaction ID is required.');
  }

  return { towerNumber, apartmentNumber, paymentMethod, payableAmount, paymentReference, bookingDetails, bookingItems, donation };
}

function validateBookingItems(value, payableAmount, donation) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Booking items are required.');

  let total = 0;
  const bookingItems = value.map((item) => {
    const dayName = String(item.dayName || '').trim();
    const mealType = String(item.mealType || '').trim();
    const foodType = String(item.foodType || '').trim();
    const serviceType = String(item.serviceType || '').trim();
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const lineTotal = Number(item.lineTotal);
    const source = String(item.source || '').trim();

    if (!dayName) throw new Error('Each booking item needs a day name.');
    if (!mealType) throw new Error('Each booking item needs a meal type.');
    if (source === 'Individual' && !['Veg', 'Non-Veg'].includes(foodType)) throw new Error('Each individual booking item needs Veg or Non-Veg.');
    if (source === 'Individual' && !['Dine-In', 'Takeaway'].includes(serviceType)) throw new Error('Each individual booking item needs Dine-In or Takeaway.');
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Each booking item needs a positive whole-number quantity.');
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Each booking item needs a valid unit price.');
    if (!['Individual', 'Season Pass'].includes(source)) throw new Error('Each booking item needs a valid source.');

    const expectedLineTotal = quantity * unitPrice;
    if (!Number.isFinite(lineTotal) || Math.abs(lineTotal - expectedLineTotal) > 0.01) {
      throw new Error('Each booking item line total must match quantity x unit price.');
    }

    total += lineTotal;
    return { dayName, mealType, foodType, serviceType, quantity, unitPrice, lineTotal, source };
  });

  const expectedPayableAmount = total + (donation ? donation.amount : 0);
  if (Math.abs(expectedPayableAmount - payableAmount) > 0.01) {
    throw new Error('Booking items and donation total must match the payable amount.');
  }

  return bookingItems;
}

function getFoodMenu() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOOD_MENU_SHEET_NAME);
  if (!sheet) throw new Error(`Could not find a tab named "${FOOD_MENU_SHEET_NAME}".`);
  assertSheetHeaders(sheet, FOOD_MENU_HEADERS, FOOD_MENU_SHEET_NAME);

  const rows = sheet.getDataRange().getValues().slice(1);
  const days = [];
  const dayIndexes = {};

  rows.forEach((row) => {
    const dayName = String(row[0] || '').trim();
    const mealTime = String(row[1] || '').trim();
    if (!dayName && !mealTime) return;
    if (!dayName || !mealTime) throw new Error('Each food menu row needs both Day and Meal Time.');

    const meals = buildFoodMenuMeals(row, dayName, mealTime);
    if (!meals.length) return;

    if (dayIndexes[dayName] === undefined) {
      dayIndexes[dayName] = days.length;
      days.push({ date: FOOD_MENU_DAY_DATES[dayName] || '', name: dayName, meals: [] });
    }

    const day = days[dayIndexes[dayName]];
    day.meals = day.meals.concat(meals);
  });

  return { days };
}

function buildFoodMenuMeals(row, dayName, mealTime) {
  const meals = [];
  addFoodMenuMeal(meals, dayName, mealTime, 'Veg', row[2], row[5], row[4]);
  addFoodMenuMeal(meals, dayName, mealTime, 'Non-Veg', row[3], row[7], row[6]);
  return meals;
}

function addFoodMenuMeal(meals, dayName, mealTime, foodType, menu, dineInPrice, takeawayPrice) {
  const menuText = String(menu || '').trim();
  if (!menuText) return;

  const dineInAmount = Number(dineInPrice);
  const takeawayAmount = Number(takeawayPrice);
  if (!Number.isFinite(dineInAmount) || dineInAmount <= 0 || !Number.isFinite(takeawayAmount) || takeawayAmount <= 0) {
    throw new Error(`${dayName} ${mealTime} ${foodType} needs valid dine-in and takeaway prices.`);
  }

  meals.push({
    id: `${slugify(dayName)}-${slugify(mealTime)}-${slugify(foodType)}`,
    mealTime,
    foodType,
    menu: menuText,
    dineInPrice: dineInAmount,
    takeawayPrice: takeawayAmount,
  });
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateDonation(value) {
  if (!value) return null;

  const name = String(value.name || '').trim();
  const amount = Number(value.amount);
  if (!name) throw new Error('A donor name is required.');
  if (amount !== DONATION_AMOUNT) throw new Error(`The Pujo donation amount must be ₹${DONATION_AMOUNT}.`);

  return { name, amount };
}

function validateTowerNumber(value) {
  const towerNumber = normalizeTowerNumber(value);
  if (!towerNumber) throw new Error('A tower number is required.');
  return towerNumber;
}

function validateApartmentNumber(value) {
  const apartmentNumber = normalizeApartmentNumber(value);
  if (!apartmentNumber) throw new Error('An apartment number is required.');
  return apartmentNumber;
}

function normalizeApartmentNumber(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeTowerNumber(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^TOWER/, '');
}

function headerIndex(row, headers) {
  const normalizedHeaders = headers.map(normalizeApartmentNumber);
  return row.findIndex((value) => normalizedHeaders.includes(normalizeApartmentNumber(value)));
}

function getDonationSheet() {
  const sheet = SpreadsheetApp.openById(DONATIONS_SPREADSHEET_ID).getSheetByName(DONATIONS_SHEET_NAME);
  if (!sheet) throw new Error(`Could not find a tab named "${DONATIONS_SHEET_NAME}" in the donations spreadsheet.`);
  return sheet;
}

function getDonationColumns(sheet) {
  const rows = sheet.getDataRange().getDisplayValues();
  const headerRowIndex = rows.findIndex((row) => headerIndex(row, DONATION_TOWER_HEADERS) !== -1 && headerIndex(row, [DONATION_APARTMENT_HEADER]) !== -1);
  if (headerRowIndex === -1) {
    throw new Error(`Could not find Tower and ${DONATION_APARTMENT_HEADER} columns in the donations spreadsheet.`);
  }

  const headerRow = rows[headerRowIndex];
  return {
    rows,
    headerRowIndex,
    towerColumnIndex: headerIndex(headerRow, DONATION_TOWER_HEADERS),
    apartmentColumnIndex: headerIndex(headerRow, [DONATION_APARTMENT_HEADER]),
    receiptColumnIndex: headerIndex(headerRow, DONATION_RECEIPT_HEADERS),
    nameColumnIndex: headerIndex(headerRow, DONATION_NAME_HEADERS),
    amountColumnIndex: headerIndex(headerRow, DONATION_AMOUNT_HEADERS),
    transactionColumnIndex: headerIndex(headerRow, DONATION_TRANSACTION_HEADERS),
  };
}

function hasDonationRecord(towerNumber, apartmentNumber) {
  const columns = getDonationColumns(getDonationSheet());
  return columns.rows
    .slice(columns.headerRowIndex + 1)
    .some((row) => normalizeTowerNumber(row[columns.towerColumnIndex]) === towerNumber && normalizeApartmentNumber(row[columns.apartmentColumnIndex]) === apartmentNumber);
}

function nextDonationReceiptNumber(rows, headerRowIndex, receiptColumnIndex) {
  const largestReceiptNumber = rows
    .slice(headerRowIndex + 1)
    .map((row) => Number(row[receiptColumnIndex]))
    .filter(Number.isFinite)
    .reduce((largest, receiptNumber) => Math.max(largest, receiptNumber), 0);

  return largestReceiptNumber + 1;
}

function appendDonation(booking) {
  const sheet = getDonationSheet();
  const columns = getDonationColumns(sheet);
  const writeColumns = [
    columns.receiptColumnIndex,
    columns.towerColumnIndex,
    columns.apartmentColumnIndex,
    columns.nameColumnIndex,
    columns.amountColumnIndex,
    columns.transactionColumnIndex,
  ];
  if (writeColumns.some((columnIndex) => columnIndex === -1)) {
    throw new Error('The donations sheet must include Receipt No., TWR, Apt. No., NAME, Amount, and Transaction ID columns.');
  }
  if (columns.rows.slice(columns.headerRowIndex + 1).some((row) => normalizeTowerNumber(row[columns.towerColumnIndex]) === booking.towerNumber && normalizeApartmentNumber(row[columns.apartmentColumnIndex]) === booking.apartmentNumber)) {
    throw new Error('A donation record already exists for this tower and apartment.');
  }

  const receiptNumber = nextDonationReceiptNumber(columns.rows, columns.headerRowIndex, columns.receiptColumnIndex);
  const row = Array(Math.max(sheet.getLastColumn(), columns.transactionColumnIndex + 1)).fill('');
  row[columns.receiptColumnIndex] = receiptNumber;
  row[columns.towerColumnIndex] = booking.towerNumber;
  row[columns.apartmentColumnIndex] = booking.apartmentNumber;
  row[columns.nameColumnIndex] = booking.donation.name;
  row[columns.amountColumnIndex] = booking.donation.amount;
  row[columns.transactionColumnIndex] = booking.paymentMethod === 'cash' ? 'CASH' : booking.paymentReference;

  let savedRow = 0;
  try {
    sheet.appendRow(row);
    savedRow = sheet.getLastRow();
    sheet.getRange(savedRow, columns.amountColumnIndex + 1).setNumberFormat('₹#,##0.00');
    return { receiptNumber, savedRow };
  } catch (error) {
    if (savedRow) sheet.deleteRow(savedRow);
    throw error;
  }
}

function appendBooking(booking) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BOOKINGS_SHEET_NAME);
    if (!sheet) throw new Error(`Could not find a tab named "${BOOKINGS_SHEET_NAME}".`);
    assertHeaders(sheet);

    const serialNumber = nextSerialNumber(sheet);
    const bookingReference = `UUC26-${String(serialNumber).padStart(6, '0')}`;
    const createdAt = new Date();

    sheet.appendRow([
      serialNumber,
      bookingReference,
      createdAt,
      `${booking.towerNumber}/${booking.apartmentNumber}`,
      booking.paymentMethod.toUpperCase(),
      booking.payableAmount,
      booking.paymentReference,
      booking.bookingDetails,
    ]);

    const savedRow = sheet.getLastRow();
    let savedBookingItemCount = 0;
    try {
      sheet.getRange(savedRow, 3).setNumberFormat('yyyy-mm-dd hh:mm:ss');
      sheet.getRange(savedRow, 6).setNumberFormat('₹#,##0.00');
      savedBookingItemCount = appendBookingItems(booking, bookingReference, createdAt);
      const donation = booking.donation ? appendDonation(booking) : null;

      return {
        serialNumber,
        bookingReference,
        createdAt: createdAt.toISOString(),
        bookingItemCount: savedBookingItemCount,
        donationReceiptNumber: donation ? donation.receiptNumber : null,
      };
    } catch (error) {
      if (savedBookingItemCount) deleteBookingItems(bookingReference);
      sheet.deleteRow(savedRow);
      throw error;
    }
  } finally {
    lock.releaseLock();
  }
}

function appendBookingItems(booking, bookingReference, createdAt) {
  const sheet = getBookingItemsSheet();
  const aptNo = `${booking.towerNumber}/${booking.apartmentNumber}`;
  const rows = booking.bookingItems.map((item) => [
    bookingReference,
    createdAt,
    aptNo,
    item.dayName,
    item.mealType,
    item.foodType || '',
    item.serviceType || '',
    item.quantity,
    item.unitPrice,
    item.lineTotal,
    item.source,
  ]);
  const startRow = sheet.getLastRow() + 1;
  let rowsWritten = 0;

  try {
    sheet.getRange(startRow, 3, rows.length, 1).setNumberFormat('@');
    sheet.getRange(startRow, 1, rows.length, BOOKING_ITEM_HEADERS.length).setValues(rows);
    rowsWritten = rows.length;
    sheet.getRange(startRow, 2, rowsWritten, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sheet.getRange(startRow, 9, rowsWritten, 2).setNumberFormat('₹#,##0.00');
    return rowsWritten;
  } catch (error) {
    if (rowsWritten) sheet.deleteRows(startRow, rowsWritten);
    throw error;
  }
}

function deleteBookingItems(bookingReference) {
  const sheet = getBookingItemsSheet();
  const values = sheet.getDataRange().getDisplayValues();
  for (let rowIndex = values.length - 1; rowIndex >= 1; rowIndex -= 1) {
    if (values[rowIndex][0] === bookingReference) sheet.deleteRow(rowIndex + 1);
  }
}

function getBookingItemsSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(BOOKING_ITEMS_SHEET_NAME);

  if (!sheet) sheet = spreadsheet.insertSheet(BOOKING_ITEMS_SHEET_NAME);

  const headerRange = sheet.getRange(1, 1, 1, BOOKING_ITEM_HEADERS.length);
  const headers = headerRange.getDisplayValues()[0];
  const hasAnyHeader = headers.some((header) => String(header).trim());

  if (!hasAnyHeader) {
    headerRange.setValues([BOOKING_ITEM_HEADERS]);
    headerRange.setFontWeight('bold');
  } else {
    assertSheetHeaders(sheet, BOOKING_ITEM_HEADERS, BOOKING_ITEMS_SHEET_NAME);
  }

  return sheet;
}

function nextSerialNumber(sheet) {
  const properties = PropertiesService.getScriptProperties();
  const storedCounter = Number(properties.getProperty('bookingSerialNumber') || 0);
  const existingRows = Math.max(sheet.getLastRow() - 1, 0);
  const serialNumber = Math.max(storedCounter, existingRows) + 1;

  properties.setProperty('bookingSerialNumber', String(serialNumber));
  return serialNumber;
}

function assertHeaders(sheet) {
  assertSheetHeaders(sheet, EXPECTED_HEADERS, BOOKINGS_SHEET_NAME);
}

function assertSheetHeaders(sheet, expectedHeaders, sheetName) {
  const headers = sheet.getRange(1, 1, 1, expectedHeaders.length).getDisplayValues()[0];
  const headersMatch = expectedHeaders.every((header, index) => headers[index] === header);
  if (!headersMatch) {
    throw new Error(`The ${sheetName} headers must match: ${expectedHeaders.join(' | ')}`);
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
