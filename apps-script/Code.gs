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
const SEASON_PASS_DAY_NAME = 'Season Pass';
const DEFAULT_SEASON_PASS_PRICE = 1450;
const DEFAULT_SEASON_PASS_MEAL_TYPE = 'Lunch';
const DEFAULT_SEASON_PASS_INCLUDED_DAYS = ['Saptami 1', 'Saptami 2', 'Ashtami', 'Nabami'];
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
  'Day Date',
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
  'Date',
];
const FALLBACK_FOOD_MENU_DAY_DATES = {
  Sashthi: '16 Oct',
  'Saptami 1': '17 Oct',
  'Saptami 2': '18 Oct',
  Ashtami: '19 Oct',
  Nabami: '20 Oct',
  Dashami: '21 Oct',
};
const ADMIN_DAY_ORDER = ['16 Oct', '17 Oct', '18 Oct', '19 Oct', '20 Oct', '21 Oct'];
const ADMIN_MEAL_ORDER = ['Breakfast', 'Lunch', 'Dinner'];

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

    if (payload.action === 'getBookingsForApartment') {
      return jsonResponse({ ok: true, bookings: getBookingsForApartment(payload) });
    }

    if (payload.action === 'getAdminSummary') {
      return jsonResponse({ ok: true, summary: getAdminSummary() });
    }

    if (payload.action === 'upgradeToTakeaway') {
      return jsonResponse({ ok: true, upgrade: upgradeToTakeaway(payload) });
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
  const seasonPassConfig = getSeasonPassConfig();
  const foodMenuDayDates = getFoodMenuDayDateMap();
  const bookingItems = value.map((item) => {
    const dayName = String(item.dayName || '').trim();
    const dayDate = String(item.dayDate || '').trim() || foodMenuDayDates[slugify(dayName)] || FALLBACK_FOOD_MENU_DAY_DATES[dayName] || '';
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
    if (source === 'Season Pass') validateSeasonPassBookingItem({ dayName, dayDate, mealType, quantity, unitPrice, lineTotal }, seasonPassConfig);

    const expectedLineTotal = quantity * unitPrice;
    if (!Number.isFinite(lineTotal) || Math.abs(lineTotal - expectedLineTotal) > 0.01) {
      throw new Error('Each booking item line total must match quantity x unit price.');
    }

    total += lineTotal;
    return { dayName, dayDate, mealType, foodType, serviceType, quantity, unitPrice, lineTotal, source };
  });

  const expectedPayableAmount = total + (donation ? donation.amount : 0);
  if (Math.abs(expectedPayableAmount - payableAmount) > 0.01) {
    throw new Error('Booking items and donation total must match the payable amount.');
  }

  return bookingItems;
}

function validateSeasonPassBookingItem(item, seasonPassConfig) {
  const includedDay = seasonPassConfig.includedDays.some((dayName) => slugify(dayName) === slugify(item.dayName));
  const includedDate = (seasonPassConfig.includedDates || []).some((dayDate) => normalizeDayDate(dayDate) === normalizeDayDate(item.dayDate));
  const expectedUnitPrice = seasonPassConfig.price / seasonPassConfig.includedDays.length;

  if (!includedDay && !includedDate) throw new Error('A season pass item has an invalid included day.');
  if (slugify(item.mealType) !== slugify(seasonPassConfig.mealType)) throw new Error('A season pass item has an invalid meal type.');
  if (Math.abs(item.unitPrice - expectedUnitPrice) > 0.01) throw new Error('Season pass item price does not match the Food Menu season pass price.');
}

function getBookingsForApartment(payload) {
  const towerNumber = validateTowerNumber(payload.towerNumber);
  const apartmentNumber = validateApartmentNumber(payload.apartmentNumber);
  const aptNo = formatAptNo(towerNumber, apartmentNumber);
  const bookingSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BOOKINGS_SHEET_NAME);
  if (!bookingSheet) throw new Error(`Could not find a tab named "${BOOKINGS_SHEET_NAME}".`);
  assertHeaders(bookingSheet);

  const bookingRows = bookingSheet.getDataRange().getValues();
  const bookingDisplayRows = bookingSheet.getDataRange().getDisplayValues();
  const apartmentItems = getBookingItemsForApartment(aptNo);
  const itemsByReference = apartmentItems.reduce((groups, item) => {
    if (!groups[item.bookingReference]) groups[item.bookingReference] = [];
    groups[item.bookingReference].push(item);
    return groups;
  }, {});

  return bookingDisplayRows
    .slice(1)
    .map((displayRow, index) => {
      if (normalizeAptNo(displayRow[3]) !== normalizeAptNo(aptNo)) return null;

      const rawRow = bookingRows[index + 1];
      const bookingReference = String(displayRow[1] || '').trim();
      return {
        bookingReference,
        createdAt: String(displayRow[2] || '').trim(),
        paymentMethod: String(displayRow[4] || '').trim(),
        payableAmount: parseAmount(rawRow[5], displayRow[5]),
        bookingDetails: String(displayRow[7] || '').trim(),
        items: itemsByReference[bookingReference] || [],
      };
    })
    .filter((booking) => booking !== null);
}

function getBookingItemsForApartment(aptNo) {
  const sheet = getBookingItemsSheet();
  const range = sheet.getDataRange();
  const rows = range.getValues();
  const displayRows = range.getDisplayValues();
  const priceMap = getFoodMenuPriceMap();

  return rows
    .slice(1)
    .map((row, index) => buildManagedBookingItem(row, displayRows[index + 1], index + 2, priceMap))
    .filter((item) => normalizeAptNo(item.aptNo) === normalizeAptNo(aptNo));
}

function getAdminSummary() {
  const sheet = getBookingItemsSheet();
  const range = sheet.getDataRange();
  const rows = range.getValues();
  const displayRows = range.getDisplayValues();
  const summary = emptyAdminSummary();

  rows.slice(1).forEach((row, index) => {
    const item = buildAdminSummaryItem(row, displayRows[index + 1]);
    if (!item.bookingReference || !item.dayName || !item.mealType || item.quantity <= 0) return;

    summary.totals.quantity += item.quantity;
    summary.totals.amountCollected += item.lineTotal;
    summary.totals[item.source === 'Season Pass' ? 'seasonPass' : 'individual'] += item.quantity;
    if (item.foodType === 'Veg') summary.totals.veg += item.quantity;
    if (item.foodType === 'Non-Veg') summary.totals.nonVeg += item.quantity;
    if (item.serviceType === 'Dine-In') summary.totals.dineIn += item.quantity;
    if (item.serviceType === 'Takeaway') summary.totals.takeaway += item.quantity;
    summary.bookingReferences[item.bookingReference] = true;
    if (item.aptNo) summary.apartments[normalizeAptNo(item.aptNo)] = true;

    const day = ensureAdminDay(summary, item);
    addAdminCounts(day, item);

    const meal = ensureAdminMeal(day, item);
    addAdminCounts(meal, item);
  });

  summary.totals.bookings = Object.keys(summary.bookingReferences).length;
  summary.totals.apartments = Object.keys(summary.apartments).length;

  return {
    generatedAt: new Date().toISOString(),
    totals: summary.totals,
    days: summary.dayOrder.slice().sort((leftKey, rightKey) => compareAdminDays(summary.days[leftKey], summary.days[rightKey])).map((key) => {
      const day = summary.days[key];
      return {
        dayName: day.dayName,
        dayDate: day.dayDate,
        quantity: day.quantity,
        amountCollected: day.amountCollected,
        veg: day.veg,
        nonVeg: day.nonVeg,
        dineIn: day.dineIn,
        takeaway: day.takeaway,
        seasonPass: day.seasonPass,
        individual: day.individual,
        meals: day.mealOrder.slice().sort((leftKey, rightKey) => compareAdminMeals(day.meals[leftKey], day.meals[rightKey])).map((mealKey) => day.meals[mealKey]),
      };
    }),
  };
}

function emptyAdminSummary() {
  return {
    totals: {
      bookings: 0,
      apartments: 0,
      quantity: 0,
      veg: 0,
      nonVeg: 0,
      dineIn: 0,
      takeaway: 0,
      seasonPass: 0,
      individual: 0,
      amountCollected: 0,
    },
    bookingReferences: {},
    apartments: {},
    days: {},
    dayOrder: [],
  };
}

function buildAdminSummaryItem(row, displayRow) {
  const dayName = String(displayRow[3] || '').trim();
  const mealType = String(displayRow[4] || '').trim();
  return {
    bookingReference: String(displayRow[0] || '').trim(),
    aptNo: String(displayRow[2] || '').trim(),
    dayName,
    mealType,
    foodType: inferAdminFoodType(String(displayRow[5] || '').trim(), mealType),
    serviceType: inferAdminServiceType(String(displayRow[6] || '').trim(), String(displayRow[10] || '').trim()),
    quantity: Number(row[7]) || 0,
    lineTotal: parseAmount(row[9], displayRow[9]),
    source: String(displayRow[10] || '').trim(),
    dayDate: String(displayRow[11] || '').trim() || FALLBACK_FOOD_MENU_DAY_DATES[dayName] || '',
  };
}

function inferAdminFoodType(foodType, mealType) {
  if (['Veg', 'Non-Veg'].includes(foodType)) return foodType;
  if (/\b(non-veg|mutton|chicken|fish|murgh)\b/i.test(mealType)) return 'Non-Veg';
  if (/\bveg\b/i.test(mealType)) return 'Veg';
  return '';
}

function inferAdminServiceType(serviceType, source) {
  if (['Dine-In', 'Takeaway'].includes(serviceType)) return serviceType;
  return source === 'Individual' ? 'Dine-In' : '';
}

function ensureAdminDay(summary, item) {
  const key = adminDayKey(item);
  if (!summary.days[key]) {
    summary.days[key] = {
      dayName: item.dayName,
      dayDate: item.dayDate,
      quantity: 0,
      veg: 0,
      nonVeg: 0,
      dineIn: 0,
      takeaway: 0,
      seasonPass: 0,
      individual: 0,
      amountCollected: 0,
      meals: {},
      mealOrder: [],
    };
    summary.dayOrder.push(key);
  }

  return summary.days[key];
}

function ensureAdminMeal(day, item) {
  const foodType = item.foodType || (item.source === 'Season Pass' ? 'Season Pass' : 'Unspecified');
  const serviceType = item.serviceType || (item.source === 'Season Pass' ? 'Season Pass' : 'Unspecified');
  const key = `${slugify(item.mealType)}|${slugify(foodType)}|${slugify(serviceType)}`;
  if (!day.meals[key]) {
    day.meals[key] = {
      mealType: item.mealType,
      foodType,
      serviceType,
      quantity: 0,
      veg: 0,
      nonVeg: 0,
      dineIn: 0,
      takeaway: 0,
      seasonPass: 0,
      individual: 0,
      amountCollected: 0,
    };
    day.mealOrder.push(key);
  }

  return day.meals[key];
}

function addAdminCounts(target, item) {
  target.quantity += item.quantity;
  target.amountCollected += item.lineTotal;
  target[item.source === 'Season Pass' ? 'seasonPass' : 'individual'] += item.quantity;
  if (item.foodType === 'Veg') target.veg += item.quantity;
  if (item.foodType === 'Non-Veg') target.nonVeg += item.quantity;
  if (item.serviceType === 'Dine-In') target.dineIn += item.quantity;
  if (item.serviceType === 'Takeaway') target.takeaway += item.quantity;
}

function adminDayKey(item) {
  return normalizeDayDate(item.dayDate) || slugify(item.dayName);
}

function compareAdminDays(left, right) {
  const leftRank = orderedIndex(ADMIN_DAY_ORDER, left.dayDate);
  const rightRank = orderedIndex(ADMIN_DAY_ORDER, right.dayDate);
  if (leftRank !== rightRank) return leftRank - rightRank;

  return String(left.dayName || '').localeCompare(String(right.dayName || ''));
}

function compareAdminMeals(left, right) {
  const leftRank = mealTimeRank(left.mealType);
  const rightRank = mealTimeRank(right.mealType);
  if (leftRank !== rightRank) return leftRank - rightRank;

  const foodTypeOrder = { Veg: 0, 'Non-Veg': 1, 'Season Pass': 2, Unspecified: 3 };
  const serviceTypeOrder = { 'Dine-In': 0, Takeaway: 1, 'Season Pass': 2, Unspecified: 3 };
  const leftFoodRank = foodTypeOrder[left.foodType] === undefined ? 99 : foodTypeOrder[left.foodType];
  const rightFoodRank = foodTypeOrder[right.foodType] === undefined ? 99 : foodTypeOrder[right.foodType];
  if (leftFoodRank !== rightFoodRank) return leftFoodRank - rightFoodRank;

  const leftServiceRank = serviceTypeOrder[left.serviceType] === undefined ? 99 : serviceTypeOrder[left.serviceType];
  const rightServiceRank = serviceTypeOrder[right.serviceType] === undefined ? 99 : serviceTypeOrder[right.serviceType];
  if (leftServiceRank !== rightServiceRank) return leftServiceRank - rightServiceRank;

  return String(left.mealType || '').localeCompare(String(right.mealType || ''));
}

function mealTimeRank(mealType) {
  const mealSlug = slugify(mealType);
  const matchIndex = ADMIN_MEAL_ORDER.findIndex((mealName) => mealSlug.includes(slugify(mealName)));
  return matchIndex === -1 ? 99 : matchIndex;
}

function orderedIndex(values, value) {
  const valueSlug = slugify(value);
  const index = values.findIndex((candidate) => slugify(candidate) === valueSlug);
  return index === -1 ? 99 : index;
}

function buildManagedBookingItem(row, displayRow, rowNumber, priceMap) {
  const bookingReference = String(displayRow[0] || '').trim();
  const dayName = String(displayRow[3] || '').trim();
  const mealType = String(displayRow[4] || '').trim();
  const foodType = String(displayRow[5] || '').trim();
  const serviceType = String(displayRow[6] || '').trim();
  const quantity = Number(row[7]);
  const unitPrice = parseAmount(row[8], displayRow[8]);
  const lineTotal = parseAmount(row[9], displayRow[9]);
  const source = String(displayRow[10] || '').trim();
  const dayDate = String(displayRow[11] || '').trim() || FALLBACK_FOOD_MENU_DAY_DATES[dayName] || '';
  const menuPrice = priceMap[foodMenuPriceKey(dayDate, mealType, foodType)] || priceMap[foodMenuPriceKey(dayName, mealType, foodType)];
  const takeawayUnitPrice = menuPrice ? menuPrice.takeawayPrice : 0;
  const extraUnitPrice = takeawayUnitPrice - unitPrice;
  const isIndividualDineIn = source === 'Individual' && serviceType === 'Dine-In' && ['Veg', 'Non-Veg'].includes(foodType);
  const upgradeable = isIndividualDineIn && Number.isFinite(quantity) && quantity > 0 && Number.isFinite(extraUnitPrice) && extraUnitPrice > 0;

  return {
    id: `row-${rowNumber}`,
    rowNumber,
    bookingReference,
    createdAt: String(displayRow[1] || '').trim(),
    aptNo: String(displayRow[2] || '').trim(),
    dayName,
    dayDate,
    mealType,
    foodType,
    serviceType,
    quantity,
    unitPrice,
    lineTotal,
    source,
    takeawayUnitPrice,
    extraUnitPrice: upgradeable ? extraUnitPrice : 0,
    extraTotal: upgradeable ? extraUnitPrice * quantity : 0,
    upgradeable,
  };
}

function upgradeToTakeaway(payload) {
  const towerNumber = validateTowerNumber(payload.towerNumber);
  const apartmentNumber = validateApartmentNumber(payload.apartmentNumber);
  const aptNo = formatAptNo(towerNumber, apartmentNumber);
  const rowNumbers = validateManagedItemIds(payload.itemIds);
  const payment = validateUpgradePayment(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = getBookingItemsSheet();
    const range = sheet.getDataRange();
    const rows = range.getValues();
    const displayRows = range.getDisplayValues();
    const priceMap = getFoodMenuPriceMap();
    const selectedItems = rowNumbers.map((rowNumber) => {
      if (rowNumber < 2 || rowNumber > rows.length) throw new Error('One selected booking item no longer exists.');

      const item = buildManagedBookingItem(rows[rowNumber - 1], displayRows[rowNumber - 1], rowNumber, priceMap);
      if (normalizeAptNo(item.aptNo) !== normalizeAptNo(aptNo)) throw new Error('One selected booking item belongs to another apartment.');
      if (!item.upgradeable) throw new Error(`${item.bookingReference} ${item.dayName} ${item.mealType} is not eligible for takeaway upgrade.`);
      return item;
    });
    const expectedPayableAmount = selectedItems.reduce((sum, item) => sum + item.extraTotal, 0);
    if (Math.abs(expectedPayableAmount - payment.payableAmount) > 0.01) {
      throw new Error('The selected upgrades do not match the payable amount.');
    }

    const itemSnapshots = selectedItems.map((item) => ({
      rowNumber: item.rowNumber,
      values: sheet.getRange(item.rowNumber, 7, 1, 4).getValues()[0],
    }));
    const createdAt = new Date();
    const bookingReferences = uniqueValues(selectedItems.map((item) => item.bookingReference));
    const bookingSnapshots = snapshotBookingRows(bookingReferences, aptNo);

    try {
      selectedItems.forEach((item) => {
        const updatedLineTotal = item.takeawayUnitPrice * item.quantity;
        sheet.getRange(item.rowNumber, 7, 1, 4).setValues([['Takeaway', item.quantity, item.takeawayUnitPrice, updatedLineTotal]]);
        sheet.getRange(item.rowNumber, 9, 1, 2).setNumberFormat('₹#,##0.00');
      });

      updateBookingRowsAfterTakeawayUpgrade({
        createdAt,
        aptNo,
        payment,
        selectedItems,
      });
    } catch (error) {
      itemSnapshots.forEach((snapshot) => sheet.getRange(snapshot.rowNumber, 7, 1, 4).setValues([snapshot.values]));
      restoreBookingRows(bookingSnapshots);
      throw error;
    }

    return {
      upgradeReference: bookingReferences.join(', '),
      updatedBookingReferences: bookingReferences,
      updatedItemCount: selectedItems.length,
      payableAmount: payment.payableAmount,
    };
  } finally {
    lock.releaseLock();
  }
}

function validateManagedItemIds(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Select at least one dine-in item to switch to takeaway.');

  const rowNumbers = value.map((itemId) => {
    const match = String(itemId || '').trim().match(/^row-(\d+)$/);
    if (!match) throw new Error('A selected booking item has an invalid ID.');
    return Number(match[1]);
  });

  return uniqueValues(rowNumbers);
}

function validateUpgradePayment(payload) {
  const paymentMethod = String(payload.paymentMethod || '').toLowerCase();
  const payableAmount = Number(payload.payableAmount);
  const paymentReference = String(payload.paymentReference || '').trim();

  if (!['cash', 'cheque', 'upi'].includes(paymentMethod)) throw new Error('Choose cash, cheque, or UPI.');
  if (!Number.isFinite(payableAmount) || payableAmount <= 0) throw new Error('A valid payable amount is required.');
  if (['cheque', 'upi'].includes(paymentMethod) && !paymentReference) {
    throw new Error('A cheque number or UPI transaction ID is required.');
  }

  return { paymentMethod, payableAmount, paymentReference };
}

function getFoodMenuPriceMap() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOOD_MENU_SHEET_NAME);
  if (!sheet) throw new Error(`Could not find a tab named "${FOOD_MENU_SHEET_NAME}".`);
  assertSheetHeaders(sheet, FOOD_MENU_HEADERS, FOOD_MENU_SHEET_NAME);

  const priceMap = {};
  sheet.getDataRange().getValues().slice(1).forEach((row) => {
    const dayName = String(row[0] || '').trim();
    const mealTime = String(row[1] || '').trim();
    const dayDate = foodMenuDateForRow(row, dayName);
    if (isSeasonPassMenuRow(row)) return;
    if (!dayName || !mealTime) return;

    addFoodMenuPrice(priceMap, dayName, dayDate, mealTime, 'Veg', row[2], row[5], row[4]);
    addFoodMenuPrice(priceMap, dayName, dayDate, mealTime, 'Non-Veg', row[3], row[7], row[6]);
  });

  return priceMap;
}

function addFoodMenuPrice(priceMap, dayName, dayDate, mealTime, foodType, menu, dineInPrice, takeawayPrice) {
  if (!String(menu || '').trim()) return;

  const dineInAmount = Number(dineInPrice);
  const takeawayAmount = Number(takeawayPrice);
  if (!Number.isFinite(dineInAmount) || dineInAmount <= 0 || !Number.isFinite(takeawayAmount) || takeawayAmount <= 0) {
    throw new Error(`${dayName} ${mealTime} ${foodType} needs valid dine-in and takeaway prices.`);
  }

  const price = {
    dineInPrice: dineInAmount,
    takeawayPrice: takeawayAmount,
  };
  priceMap[foodMenuPriceKey(dayName, mealTime, foodType)] = price;
  if (dayDate) priceMap[foodMenuPriceKey(dayDate, mealTime, foodType)] = price;
}

function foodMenuPriceKey(dayName, mealTime, foodType) {
  return `${slugify(dayName)}|${slugify(mealTime)}|${slugify(foodType)}`;
}

function snapshotBookingRows(bookingReferences, aptNo) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BOOKINGS_SHEET_NAME);
  if (!sheet) throw new Error(`Could not find a tab named "${BOOKINGS_SHEET_NAME}".`);
  assertHeaders(sheet);

  const displayRows = sheet.getDataRange().getDisplayValues();
  return bookingReferences.map((bookingReference) => {
    const rowIndex = displayRows.findIndex((row, index) => index > 0 && String(row[1] || '').trim() === bookingReference && normalizeAptNo(row[3]) === normalizeAptNo(aptNo));
    if (rowIndex === -1) throw new Error(`Could not find booking ${bookingReference} for this apartment.`);

    const rowNumber = rowIndex + 1;
    return {
      rowNumber,
      values: sheet.getRange(rowNumber, 1, 1, EXPECTED_HEADERS.length).getValues()[0],
    };
  });
}

function restoreBookingRows(snapshots) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BOOKINGS_SHEET_NAME);
  if (!sheet) return;

  snapshots.forEach((snapshot) => {
    sheet.getRange(snapshot.rowNumber, 1, 1, EXPECTED_HEADERS.length).setValues([snapshot.values]);
  });
}

function updateBookingRowsAfterTakeawayUpgrade(options) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BOOKINGS_SHEET_NAME);
  if (!sheet) throw new Error(`Could not find a tab named "${BOOKINGS_SHEET_NAME}".`);
  assertHeaders(sheet);

  const displayRows = sheet.getDataRange().getDisplayValues();
  const rawRows = sheet.getDataRange().getValues();
  const selectedItems = options.selectedItems;
  const bookingReferences = uniqueValues(selectedItems.map((item) => item.bookingReference));
  const itemsByReference = getBookingItemsByReference(bookingReferences, options.aptNo);
  const extraByReference = selectedItems.reduce((groups, item) => {
    groups[item.bookingReference] = (groups[item.bookingReference] || 0) + item.extraTotal;
    return groups;
  }, {});

  bookingReferences.forEach((bookingReference) => {
    const rowIndex = displayRows.findIndex((row, index) => index > 0 && String(row[1] || '').trim() === bookingReference && normalizeAptNo(row[3]) === normalizeAptNo(options.aptNo));
    if (rowIndex === -1) throw new Error(`Could not find booking ${bookingReference} for this apartment.`);

    const rowNumber = rowIndex + 1;
    const currentPayableAmount = parseAmount(rawRows[rowIndex][5], displayRows[rowIndex][5]);
    const newPayableAmount = currentPayableAmount + (extraByReference[bookingReference] || 0);
    const paymentMethodText = appendCellNote(displayRows[rowIndex][4], `UPGRADE ${options.payment.paymentMethod.toUpperCase()}`);
    const paymentReferenceText = appendCellNote(
      displayRows[rowIndex][6],
      formatUpgradePaymentReference(options.createdAt, options.payment, extraByReference[bookingReference] || 0),
    );
    const bookingDetails = buildBookingDetailsFromItems(itemsByReference[bookingReference] || [], displayRows[rowIndex][7]);

    sheet.getRange(rowNumber, 5, 1, 4).setValues([[paymentMethodText, newPayableAmount, paymentReferenceText, bookingDetails]]);
    sheet.getRange(rowNumber, 6).setNumberFormat('₹#,##0.00');
  });
}

function getBookingItemsByReference(bookingReferences, aptNo) {
  const sheet = getBookingItemsSheet();
  const range = sheet.getDataRange();
  const rows = range.getValues();
  const displayRows = range.getDisplayValues();
  const priceMap = getFoodMenuPriceMap();
  const groups = {};

  rows.slice(1).forEach((row, index) => {
    const item = buildManagedBookingItem(row, displayRows[index + 1], index + 2, priceMap);
    if (!bookingReferences.includes(item.bookingReference)) return;
    if (normalizeAptNo(item.aptNo) !== normalizeAptNo(aptNo)) return;
    if (!groups[item.bookingReference]) groups[item.bookingReference] = [];
    groups[item.bookingReference].push(item);
  });

  return groups;
}

function buildBookingDetailsFromItems(items, originalBookingDetails) {
  const details = [];
  const donationDetail = String(originalBookingDetails || '').split(';').map((part) => part.trim()).find((part) => /^Pujo donation\b/i.test(part));
  const seasonPassQuantity = inferSeasonPassQuantity(items);
  const individualDetails = buildIndividualBookingDetails(items);

  if (donationDetail) details.push(donationDetail);
  if (seasonPassQuantity > 0) details.push(`Season pass x ${seasonPassQuantity}`);
  return details.concat(individualDetails).join('; ');
}

function inferSeasonPassQuantity(items) {
  const seasonPassRows = items.filter((item) => item.source === 'Season Pass');
  if (!seasonPassRows.length) return 0;
  return seasonPassRows.map((item) => Number(item.quantity)).filter(Number.isFinite).reduce((largest, quantity) => Math.max(largest, quantity), 0);
}

function buildIndividualBookingDetails(items) {
  const dayOrder = [];
  const dayGroups = {};

  items
    .filter((item) => item.source === 'Individual')
    .forEach((item) => {
      if (!item.dayName || !item.mealType || !Number.isFinite(item.quantity) || item.quantity <= 0) return;

      if (!dayGroups[item.dayName]) {
        dayGroups[item.dayName] = {};
        dayOrder.push(item.dayName);
      }

      const descriptor = item.foodType && item.serviceType
        ? `${item.mealType} (${item.foodType}, ${item.serviceType})`
        : item.foodType
          ? `${item.mealType} (${item.foodType})`
          : item.serviceType
            ? `${item.mealType} (${item.serviceType})`
            : item.mealType;
      dayGroups[item.dayName][descriptor] = (dayGroups[item.dayName][descriptor] || 0) + item.quantity;
    });

  return dayOrder.map((dayName) => {
    const mealDetails = Object.keys(dayGroups[dayName]).map((descriptor) => `${descriptor} x ${dayGroups[dayName][descriptor]}`);
    return `${dayName}: ${mealDetails.join(', ')}`;
  });
}

function appendCellNote(currentValue, note) {
  const currentText = String(currentValue || '').trim();
  return currentText ? `${currentText}; ${note}` : note;
}

function formatUpgradePaymentReference(createdAt, payment, amount) {
  const timestamp = Utilities.formatDate(createdAt, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const paymentReference = payment.paymentMethod === 'cash' ? 'CASH' : payment.paymentReference;
  return `Upgrade ${timestamp}: ${paymentReference} (${formatCurrency(amount)})`;
}

function getFoodMenu() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOOD_MENU_SHEET_NAME);
  if (!sheet) throw new Error(`Could not find a tab named "${FOOD_MENU_SHEET_NAME}".`);
  assertSheetHeaders(sheet, FOOD_MENU_HEADERS, FOOD_MENU_SHEET_NAME);

  const rows = sheet.getDataRange().getValues().slice(1);
  const days = [];
  const dayIndexes = {};
  const seasonPass = buildSeasonPassConfig(rows);

  rows.forEach((row) => {
    const dayName = String(row[0] || '').trim();
    const mealTime = String(row[1] || '').trim();
    const dayDate = foodMenuDateForRow(row, dayName);
    const dayKey = slugify(dayDate) || slugify(dayName);
    if (isSeasonPassMenuRow(row)) return;
    if (!dayName && !mealTime) return;
    if (!dayName || !mealTime) throw new Error('Each food menu row needs both Day and Meal Time.');

    const meals = buildFoodMenuMeals(row, dayName, mealTime);
    if (!meals.length) return;

    if (dayIndexes[dayKey] === undefined) {
      dayIndexes[dayKey] = days.length;
      days.push({ date: dayDate, name: dayName, meals: [] });
    }

    const day = days[dayIndexes[dayKey]];
    if (!day.date && dayDate) day.date = dayDate;
    day.meals = day.meals.concat(meals);
  });

  return { days, seasonPass };
}

function foodMenuDateForRow(row, dayName) {
  return formatFoodMenuDateValue(row[8]) || FALLBACK_FOOD_MENU_DAY_DATES[dayName] || '';
}

function formatFoodMenuDateValue(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'd MMM');
  return String(value || '').trim();
}

function normalizeDayDate(value) {
  return slugify(formatFoodMenuDateValue(value));
}

function getFoodMenuDayDateMap() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOOD_MENU_SHEET_NAME);
  if (!sheet) throw new Error(`Could not find a tab named "${FOOD_MENU_SHEET_NAME}".`);
  assertSheetHeaders(sheet, FOOD_MENU_HEADERS, FOOD_MENU_SHEET_NAME);

  return sheet.getDataRange().getValues().slice(1).reduce((dates, row) => {
    const dayName = String(row[0] || '').trim();
    if (!dayName || isSeasonPassMenuRow(row)) return dates;

    const dayDate = foodMenuDateForRow(row, dayName);
    if (dayDate) dates[slugify(dayName)] = dayDate;
    return dates;
  }, {});
}

function getSeasonPassConfig() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOOD_MENU_SHEET_NAME);
  if (!sheet) throw new Error(`Could not find a tab named "${FOOD_MENU_SHEET_NAME}".`);
  assertSheetHeaders(sheet, FOOD_MENU_HEADERS, FOOD_MENU_SHEET_NAME);
  return buildSeasonPassConfig(sheet.getDataRange().getValues().slice(1));
}

function buildSeasonPassConfig(rows) {
  const seasonPassRow = rows.find(isSeasonPassMenuRow);
  if (!seasonPassRow) return defaultSeasonPassConfig();

  const mealType = String(seasonPassRow[1] || '').trim() || DEFAULT_SEASON_PASS_MEAL_TYPE;
  const includedDays = parseSeasonPassIncludedDays(seasonPassRow[2]);
  const includedDates = includedDays
    .map((dayName) => findFoodMenuDateForDay(rows, dayName))
    .filter(Boolean);
  const price = firstPositiveNumber([seasonPassRow[5], seasonPassRow[4], seasonPassRow[7], seasonPassRow[6]]) || DEFAULT_SEASON_PASS_PRICE;

  return {
    price,
    mealType,
    includedDays,
    includedDates,
    description: `Includes ${mealType.toLowerCase()} for ${includedDays.join(', ')}`,
  };
}

function defaultSeasonPassConfig() {
  return {
    price: DEFAULT_SEASON_PASS_PRICE,
    mealType: DEFAULT_SEASON_PASS_MEAL_TYPE,
    includedDays: DEFAULT_SEASON_PASS_INCLUDED_DAYS,
    includedDates: DEFAULT_SEASON_PASS_INCLUDED_DAYS.map((dayName) => FALLBACK_FOOD_MENU_DAY_DATES[dayName]).filter(Boolean),
    description: `Includes ${DEFAULT_SEASON_PASS_MEAL_TYPE.toLowerCase()} for ${DEFAULT_SEASON_PASS_INCLUDED_DAYS.join(', ')}`,
  };
}

function findFoodMenuDateForDay(rows, targetDayName) {
  const targetSlug = slugify(targetDayName);
  const row = rows.find((foodMenuRow) => slugify(foodMenuRow[0]) === targetSlug);
  return row ? foodMenuDateForRow(row, targetDayName) : FALLBACK_FOOD_MENU_DAY_DATES[targetDayName] || '';
}

function isSeasonPassMenuRow(row) {
  return slugify(row[0]) === slugify(SEASON_PASS_DAY_NAME);
}

function parseSeasonPassIncludedDays(value) {
  const days = String(value || '')
    .split(',')
    .map((dayName) => dayName.trim())
    .filter(Boolean);
  return days.length ? days : DEFAULT_SEASON_PASS_INCLUDED_DAYS;
}

function firstPositiveNumber(values) {
  const amount = values.map(Number).find((value) => Number.isFinite(value) && value > 0);
  return amount || 0;
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

function normalizeAptNo(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function formatAptNo(towerNumber, apartmentNumber) {
  return `${towerNumber}/${apartmentNumber}`;
}

function parseAmount(rawValue, displayValue) {
  const rawAmount = Number(rawValue);
  if (Number.isFinite(rawAmount)) return rawAmount;

  const displayAmount = Number(String(displayValue || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(displayAmount) ? displayAmount : 0;
}

function formatCurrency(amount) {
  return `₹${Number(amount).toFixed(2)}`;
}

function uniqueValues(values) {
  const seen = {};
  return values.filter((value) => {
    const key = String(value);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
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
    item.dayDate,
  ]);
  const startRow = sheet.getLastRow() + 1;
  let rowsWritten = 0;

  try {
    sheet.getRange(startRow, 3, rows.length, 1).setNumberFormat('@');
    sheet.getRange(startRow, 12, rows.length, 1).setNumberFormat('@');
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
