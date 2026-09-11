const BOOKINGS_SHEET_NAME = 'Bookings';
const BOOKING_ITEMS_SHEET_NAME = 'Booking Items';
const FOOD_MENU_SHEET_NAME = 'Food Menu';
const DONATIONS_SHEET_NAME = 'Donations';
const DONATION_TOWER_HEADERS = ['TWR', 'Tower', 'Tower No.', 'Tower No', 'Tower Number'];
const DONATION_APARTMENT_HEADER = 'Apt. No.';
const DONATION_RECEIPT_HEADERS = ['Receipt No.', 'Recipt No.'];
const DONATION_NAME_HEADERS = ['Name'];
const DONATION_AMOUNT_HEADERS = ['Amount'];
const DONATION_TRANSACTION_HEADERS = ['Transaction ID', 'Transction ID'];
const DONATION_DATE_HEADERS = ['Date'];
const DONATION_PHONE_HEADERS = ['Ph #', 'Phone', 'Phone Number', 'WhatsApp Number'];
const DONATION_AMOUNT = 4000;
const APARTMENT_NUMBER_MAX_LENGTH = 20;
const DONOR_NAME_MAX_LENGTH = 80;
const BOOKING_REQUEST_PROPERTY_PREFIX = 'bookingRequest:';
const UPGRADE_REQUEST_PROPERTY_PREFIX = 'takeawayUpgradeRequest:';
const ALLOWED_TOWER_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'TH'];
const SEASON_PASS_DAY_NAME = 'Season Pass';
const DEFAULT_SEASON_PASS_PRICE = 1450;
const DEFAULT_SEASON_PASS_MEAL_TYPE = 'Lunch';
const DEFAULT_SEASON_PASS_INCLUDED_DAYS = ['Saptami 1', 'Saptami 2', 'Ashtami', 'Nabami'];
const WHATSAPP_GRAPH_API_VERSION = 'v26.0';
const WHATSAPP_PROPERTY_KEYS = {
  phoneNumberId: 'WHATSAPP_PHONE_NUMBER_ID',
  accessToken: 'WHATSAPP_ACCESS_TOKEN',
  templateName: 'WHATSAPP_TEMPLATE_NAME',
  templateLanguage: 'WHATSAPP_TEMPLATE_LANGUAGE',
};
const EXPECTED_HEADERS = [
  'Sl No',
  'Booking Reference',
  'Created At',
  'Apt. No.',
  'Payment Method',
  'Payable Amount',
  'UPI Txn Id/cheque number',
  'Booking Details',
  'WhatsApp Number',
  'WhatsApp Status',
  'WhatsApp Message ID',
  'WhatsApp Sent At',
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
const DEFAULT_EVENT_YEAR = 2026;
const FALLBACK_FOOD_MENU_DAY_DATES = {
  Sashthi: '2026-10-16',
  'Saptami 1': '2026-10-17',
  'Saptami 2': '2026-10-18',
  Ashtami: '2026-10-19',
  Nabami: '2026-10-20',
  Dashami: '2026-10-21',
};
const ADMIN_DAY_ORDER = ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21'];
const MONTH_ABBREVIATIONS = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};
const ADMIN_MEAL_ORDER = ['Breakfast', 'Lunch', 'Dinner'];

function doGet(event) {
  try {
    const payload = parseGetPayload(event);
    if (!payload || !Object.keys(payload).length) return jsonResponse({ ok: true, service: 'UUC Pujo bookings' });
    return handlePayload(payload);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || 'Unable to process request.' });
  }
}

function doPost(event) {
  try {
    return handlePayload(parsePostPayload(event));
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || 'Unable to save booking.' });
  }
}

function parseGetPayload(event) {
  const parameter = event && event.parameter ? event.parameter : {};
  if (parameter.payload) return JSON.parse(parameter.payload);
  return parameter;
}

function parsePostPayload(event) {
  if (!event || !event.postData) return {};
  return JSON.parse(event.postData.contents || '{}');
}

function handlePayload(payload) {
  if (payload.action === 'checkDonation') {
    const towerNumber = validateTowerNumber(payload.towerNumber);
    const apartmentNumber = validateApartmentNumber(payload.apartmentNumber);
    const donationRecord = getDonationRecord(towerNumber, apartmentNumber);
    return jsonResponse({ ok: true, eligible: Boolean(donationRecord), donorName: donationRecord ? donationRecord.name : '' });
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
}

function validateBooking(payload) {
  const towerNumber = validateTowerNumber(payload.towerNumber);
  const apartmentNumber = validateApartmentNumber(payload.apartmentNumber);
  const paymentMethod = String(payload.paymentMethod || '').toLowerCase();
  const payableAmount = Number(payload.payableAmount);
  const paymentReference = String(payload.paymentReference || '').trim();
  const bookingDetails = String(payload.bookingDetails || '').trim();
  const whatsAppNumber = validateWhatsAppNumber(payload.whatsAppNumber);
  const donation = validateDonation(payload.donation);
  const bookingItems = validateBookingItems(payload.bookingItems, payableAmount, donation);
  const bookingRequestId = validateBookingRequestId(payload.bookingRequestId);

  if (!['cash', 'cheque', 'upi'].includes(paymentMethod)) throw new Error('Choose cash, cheque, or UPI.');
  if (!Number.isFinite(payableAmount) || payableAmount <= 0) throw new Error('A valid payable amount is required.');
  if (!bookingDetails) throw new Error('Booking details are required.');
  if (['cheque', 'upi'].includes(paymentMethod) && !paymentReference) {
    throw new Error('A cheque number or UPI transaction ID is required.');
  }

  return { towerNumber, apartmentNumber, paymentMethod, payableAmount, paymentReference, bookingDetails, bookingItems, donation, whatsAppNumber, bookingRequestId };
}

function validateBookingRequestId(value) {
  const requestId = String(value || '').trim();
  if (!requestId) return '';
  if (requestId.length > 80 || !/^[A-Za-z0-9_-]+$/.test(requestId)) {
    throw new Error('The booking request ID is invalid.');
  }
  return requestId;
}

function buildBookingRequestFingerprint(booking) {
  return JSON.stringify({
    towerNumber: booking.towerNumber,
    apartmentNumber: booking.apartmentNumber,
    paymentMethod: booking.paymentMethod,
    payableAmount: booking.payableAmount,
    paymentReference: booking.paymentReference,
    bookingDetails: booking.bookingDetails,
    bookingItems: booking.bookingItems,
    donation: booking.donation,
    whatsAppNumber: booking.whatsAppNumber,
  });
}

function getCompletedBookingRequest(requestId, requestFingerprint) {
  if (!requestId) return null;
  const savedValue = PropertiesService.getScriptProperties().getProperty(`${BOOKING_REQUEST_PROPERTY_PREFIX}${requestId}`);
  if (!savedValue) return null;

  const savedRequest = JSON.parse(savedValue);
  if (savedRequest.fingerprint !== requestFingerprint) {
    throw new Error('This booking request ID was already used for a different booking.');
  }
  return savedRequest.result;
}

function saveCompletedBookingRequest(requestId, requestFingerprint, result) {
  if (!requestId) return;
  PropertiesService.getScriptProperties().setProperty(
    `${BOOKING_REQUEST_PROPERTY_PREFIX}${requestId}`,
    JSON.stringify({ fingerprint: requestFingerprint, result }),
  );
}

function validateBookingItems(value, payableAmount, donation) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Booking items are required.');

  let total = 0;
  const seasonPassConfig = getSeasonPassConfig();
  const foodMenuDayDates = getFoodMenuDayDateMap();
  const bookingItems = value.map((item) => {
    const dayName = String(item.dayName || '').trim();
    const dayDate = formatFoodMenuDateValue(item.dayDate) || foodMenuDayDates[slugify(dayName)] || FALLBACK_FOOD_MENU_DAY_DATES[dayName] || '';
    const mealType = String(item.mealType || '').trim();
    const foodType = String(item.foodType || '').trim();
    const serviceType = String(item.serviceType || '').trim();
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const lineTotal = Number(item.lineTotal);
    const source = String(item.source || '').trim();

    if (!dayName) throw new Error('Each booking item needs a day name.');
    if (isPastFoodMenuDate(dayDate)) throw new Error(`${dayName} is no longer available for booking.`);
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
  if (!seasonPassConfig) throw new Error('Season pass is not available in the Food Menu.');

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
    dayDate: formatFoodMenuDateValue(row[11]) || formatFoodMenuDateValue(displayRow[11]) || FALLBACK_FOOD_MENU_DAY_DATES[dayName] || '',
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
  const dayDate = formatFoodMenuDateValue(row[11]) || formatFoodMenuDateValue(displayRow[11]) || FALLBACK_FOOD_MENU_DAY_DATES[dayName] || '';
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
  const itemUpgrades = validateManagedItemUpgrades(payload.itemUpgrades, payload.itemIds);
  const payment = validateUpgradePayment(payload);
  const requestId = validateUpgradeRequestId(payload.upgradeRequestId);
  const requestFingerprint = buildUpgradeRequestFingerprint(aptNo, itemUpgrades, payment);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const completedUpgrade = getCompletedUpgradeRequest(requestId, requestFingerprint);
    if (completedUpgrade) return completedUpgrade;

    const sheet = getBookingItemsSheet();
    const range = sheet.getDataRange();
    const rows = range.getValues();
    const displayRows = range.getDisplayValues();
    const priceMap = getFoodMenuPriceMap();
    const selectedItems = itemUpgrades.map((upgrade) => {
      const rowNumber = upgrade.rowNumber;
      if (rowNumber < 2 || rowNumber > rows.length) throw new Error('One selected booking item no longer exists.');

      const item = buildManagedBookingItem(rows[rowNumber - 1], displayRows[rowNumber - 1], rowNumber, priceMap);
      if (normalizeAptNo(item.aptNo) !== normalizeAptNo(aptNo)) throw new Error('One selected booking item belongs to another apartment.');
      if (!item.upgradeable) throw new Error(`${item.bookingReference} ${item.dayName} ${item.mealType} is not eligible for takeaway upgrade.`);
      const upgradeQuantity = upgrade.quantity === null ? item.quantity : upgrade.quantity;
      if (upgradeQuantity > item.quantity) {
        throw new Error(`${item.bookingReference} ${item.dayName} ${item.mealType} only has ${item.quantity} coupons available.`);
      }

      return {
        ...item,
        originalQuantity: item.quantity,
        quantity: upgradeQuantity,
        lineTotal: item.unitPrice * upgradeQuantity,
        extraTotal: item.extraUnitPrice * upgradeQuantity,
        sourceRow: rows[rowNumber - 1].slice(0, BOOKING_ITEM_HEADERS.length),
      };
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
    const upgradeResult = {
      upgradeReference: bookingReferences.join(', '),
      updatedBookingReferences: bookingReferences,
      updatedItemCount: selectedItems.length,
      updatedCouponCount: selectedItems.reduce((sum, item) => sum + item.quantity, 0),
      payableAmount: payment.payableAmount,
    };
    let appendedStartRow = 0;
    let appendedRowCount = 0;

    try {
      const appendedRows = [];
      selectedItems.forEach((item) => {
        const change = buildTakeawayUpgradeChange(item);
        sheet.getRange(item.rowNumber, 7, 1, 4).setValues([change.originalRowValues]);
        sheet.getRange(item.rowNumber, 9, 1, 2).setNumberFormat('₹#,##0.00');
        if (change.appendedRow) appendedRows.push(change.appendedRow);
      });

      if (appendedRows.length) {
        appendedStartRow = sheet.getLastRow() + 1;
        sheet.getRange(appendedStartRow, 3, appendedRows.length, 1).setNumberFormat('@');
        sheet.getRange(appendedStartRow, 12, appendedRows.length, 1).setNumberFormat('@');
        sheet.getRange(appendedStartRow, 1, appendedRows.length, BOOKING_ITEM_HEADERS.length).setValues(appendedRows);
        appendedRowCount = appendedRows.length;
        sheet.getRange(appendedStartRow, 2, appendedRowCount, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
        sheet.getRange(appendedStartRow, 9, appendedRowCount, 2).setNumberFormat('₹#,##0.00');
      }

      updateBookingRowsAfterTakeawayUpgrade({
        createdAt,
        aptNo,
        payment,
        selectedItems,
      });
      saveCompletedUpgradeRequest(requestId, requestFingerprint, upgradeResult);
    } catch (error) {
      if (appendedRowCount) sheet.deleteRows(appendedStartRow, appendedRowCount);
      itemSnapshots.forEach((snapshot) => sheet.getRange(snapshot.rowNumber, 7, 1, 4).setValues([snapshot.values]));
      restoreBookingRows(bookingSnapshots);
      throw error;
    }

    return upgradeResult;
  } finally {
    lock.releaseLock();
  }
}

function validateUpgradeRequestId(value) {
  const requestId = String(value || '').trim();
  if (!requestId) return '';
  if (requestId.length > 80 || !/^[A-Za-z0-9_-]+$/.test(requestId)) {
    throw new Error('The takeaway upgrade request ID is invalid.');
  }
  return requestId;
}

function buildUpgradeRequestFingerprint(aptNo, itemUpgrades, payment) {
  return JSON.stringify({
    aptNo: normalizeAptNo(aptNo),
    itemUpgrades,
    paymentMethod: payment.paymentMethod,
    payableAmount: payment.payableAmount,
  });
}

function getCompletedUpgradeRequest(requestId, requestFingerprint) {
  if (!requestId) return null;
  const savedValue = PropertiesService.getScriptProperties().getProperty(`${UPGRADE_REQUEST_PROPERTY_PREFIX}${requestId}`);
  if (!savedValue) return null;

  const savedRequest = JSON.parse(savedValue);
  if (savedRequest.fingerprint !== requestFingerprint) {
    throw new Error('This takeaway upgrade request ID was already used for a different selection.');
  }
  return savedRequest.result;
}

function saveCompletedUpgradeRequest(requestId, requestFingerprint, result) {
  if (!requestId) return;
  PropertiesService.getScriptProperties().setProperty(
    `${UPGRADE_REQUEST_PROPERTY_PREFIX}${requestId}`,
    JSON.stringify({ fingerprint: requestFingerprint, result }),
  );
}

function buildTakeawayUpgradeChange(item) {
  const remainingQuantity = item.originalQuantity - item.quantity;
  if (remainingQuantity < 0) throw new Error('The takeaway quantity exceeds the available quantity.');

  if (remainingQuantity === 0) {
    return {
      originalRowValues: ['Takeaway', item.quantity, item.takeawayUnitPrice, item.takeawayUnitPrice * item.quantity],
      appendedRow: null,
    };
  }

  const appendedRow = item.sourceRow.slice(0, BOOKING_ITEM_HEADERS.length);
  appendedRow[6] = 'Takeaway';
  appendedRow[7] = item.quantity;
  appendedRow[8] = item.takeawayUnitPrice;
  appendedRow[9] = item.takeawayUnitPrice * item.quantity;

  return {
    originalRowValues: ['Dine-In', remainingQuantity, item.unitPrice, item.unitPrice * remainingQuantity],
    appendedRow,
  };
}

function validateManagedItemUpgrades(value, legacyItemIds) {
  let upgrades;
  if (Array.isArray(value) && value.length > 0) {
    upgrades = value.map((upgrade) => {
      if (!upgrade || typeof upgrade !== 'object' || Array.isArray(upgrade)) {
        throw new Error('A selected booking item has an invalid upgrade quantity.');
      }

      const match = String(upgrade.itemId || '').trim().match(/^row-(\d+)$/);
      const quantity = Number(upgrade.quantity);
      if (!match) throw new Error('A selected booking item has an invalid ID.');
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error('Each takeaway upgrade needs a valid coupon quantity.');
      }
      return { rowNumber: Number(match[1]), quantity };
    });
  } else if (Array.isArray(legacyItemIds) && legacyItemIds.length > 0) {
    upgrades = legacyItemIds.map((itemId) => {
      const match = String(itemId || '').trim().match(/^row-(\d+)$/);
      if (!match) throw new Error('A selected booking item has an invalid ID.');
      return { rowNumber: Number(match[1]), quantity: null };
    });
  } else {
    throw new Error('Select at least one dine-in item to switch to takeaway.');
  }

  const seenRowNumbers = {};
  upgrades.forEach((upgrade) => {
    if (seenRowNumbers[upgrade.rowNumber]) throw new Error('A booking item can only be selected once.');
    seenRowNumbers[upgrade.rowNumber] = true;
  });

  return upgrades;
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
  const configuredSeasonPass = buildSeasonPassConfig(rows);
  const seasonPass = configuredSeasonPass && configuredSeasonPass.includedDates.some((dayDate) => isPastFoodMenuDate(dayDate))
    ? null
    : configuredSeasonPass;

  rows.forEach((row) => {
    const dayName = String(row[0] || '').trim();
    const mealTime = String(row[1] || '').trim();
    const dayDate = foodMenuDateForRow(row, dayName);
    const dayKey = slugify(dayDate) || slugify(dayName);
    if (isSeasonPassMenuRow(row)) return;
    if (!dayName && !mealTime) return;
    if (!dayName || !mealTime) throw new Error('Each food menu row needs both Day and Meal Time.');
    if (isPastFoodMenuDate(dayDate)) return;

    const meals = buildFoodMenuMeals(row, dayName, dayDate, mealTime);
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
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return normalizeFoodMenuDateString(String(value || '').trim());
}

function isPastFoodMenuDate(value, currentDate) {
  const dayDate = formatFoodMenuDateValue(value);
  const match = dayDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    return false;
  }

  const today = currentDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return dayDate < today;
}

function normalizeFoodMenuDateString(value) {
  if (!value) return '';

  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) return buildIsoDate(isoMatch[1], isoMatch[2], isoMatch[3]);

  const dayFirstMatch = value.match(/^(\d{1,2})[\s/-]+([A-Za-z]+)[\s,/-]*(\d{4})?$/);
  if (dayFirstMatch) {
    const month = MONTH_ABBREVIATIONS[dayFirstMatch[2].toLowerCase()];
    if (month) return buildIsoDate(dayFirstMatch[3] || DEFAULT_EVENT_YEAR, month, dayFirstMatch[1]);
  }

  const slashMatch = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) return buildIsoDate(slashMatch[3], slashMatch[2], slashMatch[1]);

  return value;
}

function buildIsoDate(year, month, day) {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
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
  if (!seasonPassRow) return null;

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

function buildFoodMenuMeals(row, dayName, dayDate, mealTime) {
  const meals = [];
  addFoodMenuMeal(meals, dayName, dayDate, mealTime, 'Veg', row[2], row[5], row[4]);
  addFoodMenuMeal(meals, dayName, dayDate, mealTime, 'Non-Veg', row[3], row[7], row[6]);
  return meals;
}

function addFoodMenuMeal(meals, dayName, dayDate, mealTime, foodType, menu, dineInPrice, takeawayPrice) {
  const menuText = String(menu || '').trim();
  if (!menuText) return;

  const dineInAmount = Number(dineInPrice);
  const takeawayAmount = Number(takeawayPrice);
  if (!Number.isFinite(dineInAmount) || dineInAmount <= 0 || !Number.isFinite(takeawayAmount) || takeawayAmount <= 0) {
    throw new Error(`${dayName} ${mealTime} ${foodType} needs valid dine-in and takeaway prices.`);
  }

  meals.push({
    id: `${slugify(dayDate) || slugify(dayName)}-${slugify(dayName)}-${slugify(mealTime)}-${slugify(foodType)}`,
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

  if (typeof value !== 'object' || Array.isArray(value) || typeof value.name !== 'string') {
    throw new Error('A valid donor name is required.');
  }

  const name = normalizeDonorName(value.name);
  const amount = Number(value.amount);
  if (name.length > DONOR_NAME_MAX_LENGTH || !/^\p{L}[\p{L}\p{M} .'’\-]*$/u.test(name)) {
    throw new Error('Enter a valid donor name beginning with a letter.');
  }
  if (amount !== DONATION_AMOUNT) throw new Error(`The Pujo donation amount must be ₹${DONATION_AMOUNT}.`);

  return { name, amount };
}

function validateTowerNumber(value) {
  if (typeof value !== 'string') throw new Error('Choose a valid tower.');
  const towerNumber = normalizeTowerNumber(value);
  if (!ALLOWED_TOWER_NUMBERS.includes(towerNumber)) throw new Error('Choose a valid tower.');
  return towerNumber;
}

function validateApartmentNumber(value) {
  if (typeof value !== 'string') throw new Error('Enter a valid apartment number.');
  const input = value.trim().toUpperCase().replace(/\s+/g, ' ');
  if (
    input.length > APARTMENT_NUMBER_MAX_LENGTH ||
    !/^[A-Z0-9]+(?:[ -][A-Z0-9]+)*$/.test(input)
  ) {
    throw new Error('Enter a valid apartment number using letters, numbers, spaces, or hyphens.');
  }
  const apartmentNumber = normalizeApartmentNumber(value);
  return apartmentNumber;
}

function validateWhatsAppNumber(value) {
  if (typeof value !== 'string') throw new Error('Enter a valid 10-digit WhatsApp number.');
  const digits = value.replace(/\D/g, '');
  let localNumber = digits;
  if (digits.length === 12 && digits.startsWith('91')) localNumber = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) localNumber = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(localNumber)) {
    throw new Error('Enter a valid 10-digit Indian WhatsApp number.');
  }
  return `91${localNumber}`;
}

function formatWhatsAppNumberForSheet(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function normalizeApartmentNumber(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeDonorName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DONATIONS_SHEET_NAME);
  if (!sheet) throw new Error(`Could not find a tab named "${DONATIONS_SHEET_NAME}" in the booking spreadsheet.`);
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
    dateColumnIndex: headerIndex(headerRow, DONATION_DATE_HEADERS),
    phoneColumnIndex: headerIndex(headerRow, DONATION_PHONE_HEADERS),
  };
}

function getDonationRecord(towerNumber, apartmentNumber) {
  const columns = getDonationColumns(getDonationSheet());
  const row = columns.rows
    .slice(columns.headerRowIndex + 1)
    .find((donationRow) => normalizeTowerNumber(donationRow[columns.towerColumnIndex]) === towerNumber && normalizeApartmentNumber(donationRow[columns.apartmentColumnIndex]) === apartmentNumber);

  if (!row) return null;
  return {
    name: columns.nameColumnIndex === -1 ? '' : String(row[columns.nameColumnIndex] || '').trim(),
  };
}

function hasDonationRecord(towerNumber, apartmentNumber) {
  return Boolean(getDonationRecord(towerNumber, apartmentNumber));
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
    columns.dateColumnIndex,
    columns.phoneColumnIndex,
  ];
  if (writeColumns.some((columnIndex) => columnIndex === -1)) {
    throw new Error('The donations sheet must include Receipt No., TWR, Apt. No., NAME, Amount, Transaction ID, Date, and Ph # columns.');
  }
  if (columns.rows.slice(columns.headerRowIndex + 1).some((row) => normalizeTowerNumber(row[columns.towerColumnIndex]) === booking.towerNumber && normalizeApartmentNumber(row[columns.apartmentColumnIndex]) === booking.apartmentNumber)) {
    throw new Error('A donation record already exists for this tower and apartment.');
  }

  const receiptNumber = nextDonationReceiptNumber(columns.rows, columns.headerRowIndex, columns.receiptColumnIndex);
  const row = Array(Math.max(sheet.getLastColumn(), ...writeColumns.map((columnIndex) => columnIndex + 1))).fill('');
  row[columns.receiptColumnIndex] = receiptNumber;
  row[columns.towerColumnIndex] = booking.towerNumber;
  row[columns.apartmentColumnIndex] = booking.apartmentNumber;
  row[columns.nameColumnIndex] = plainSheetText(booking.donation.name);
  row[columns.amountColumnIndex] = booking.donation.amount;
  row[columns.transactionColumnIndex] = booking.paymentMethod === 'cash' ? 'CASH' : booking.paymentReference;
  row[columns.dateColumnIndex] = new Date();
  row[columns.phoneColumnIndex] = formatWhatsAppNumberForSheet(booking.whatsAppNumber);

  let savedRow = 0;
  try {
    sheet.appendRow(row);
    savedRow = sheet.getLastRow();
    sheet.getRange(savedRow, columns.amountColumnIndex + 1).setNumberFormat('₹#,##0.00');
    sheet.getRange(savedRow, columns.dateColumnIndex + 1).setNumberFormat('yyyy-mm-dd');
    sheet.getRange(savedRow, columns.phoneColumnIndex + 1).setNumberFormat('@').setValue(formatWhatsAppNumberForSheet(booking.whatsAppNumber));
    return { receiptNumber, savedRow };
  } catch (error) {
    if (savedRow) sheet.deleteRow(savedRow);
    throw error;
  }
}

function sendWhatsAppConfirmation(booking, bookingReference) {
  const properties = PropertiesService.getScriptProperties();
  const phoneNumberId = String(properties.getProperty(WHATSAPP_PROPERTY_KEYS.phoneNumberId) || '').trim();
  const accessToken = String(properties.getProperty(WHATSAPP_PROPERTY_KEYS.accessToken) || '').trim();
  const templateName = String(properties.getProperty(WHATSAPP_PROPERTY_KEYS.templateName) || '').trim();
  const templateLanguage = String(properties.getProperty(WHATSAPP_PROPERTY_KEYS.templateLanguage) || '').trim();
  const missingConfig = [];

  if (!phoneNumberId) missingConfig.push(WHATSAPP_PROPERTY_KEYS.phoneNumberId);
  if (!accessToken) missingConfig.push(WHATSAPP_PROPERTY_KEYS.accessToken);
  if (!templateName) missingConfig.push(WHATSAPP_PROPERTY_KEYS.templateName);
  if (!templateLanguage) missingConfig.push(WHATSAPP_PROPERTY_KEYS.templateLanguage);

  if (missingConfig.length) {
    return {
      status: `Skipped: missing ${missingConfig.join(', ')}`,
      messageId: '',
      sentAt: '',
    };
  }

  const endpoint = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: booking.whatsAppNumber,
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components: [
        {
          type: 'body',
          parameters: [
            whatsappTextParameter('customer_name', getBookingCustomerName(booking)),
            whatsappTextParameter('booking_id', bookingReference),
            whatsappTextParameter('flat_number', formatAptNo(booking.towerNumber, booking.apartmentNumber)),
            whatsappTextParameter('meals_booked', bookingMealsForWhatsApp(booking)),
            whatsappTextParameter('payment_mode', booking.paymentMethod.toUpperCase()),
            whatsappTextParameter('total_amount', formatPlainAmount(booking.payableAmount)),
          ],
        },
      ],
    },
  };

  try {
    const response = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${accessToken}` },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const statusCode = response.getResponseCode();
    const bodyText = response.getContentText();
    const body = bodyText ? JSON.parse(bodyText) : {};
    const messageId = body.messages && body.messages[0] ? String(body.messages[0].id || '') : '';

    if (statusCode >= 200 && statusCode < 300 && messageId) {
      return { status: 'Sent', messageId, sentAt: new Date() };
    }

    return {
      status: truncateForCell(`Failed: ${extractWhatsAppError(body) || bodyText || `HTTP ${statusCode}`}`, 450),
      messageId,
      sentAt: '',
    };
  } catch (error) {
    return {
      status: truncateForCell(`Failed: ${error.message || error}`, 450),
      messageId: '',
      sentAt: '',
    };
  }
}

function whatsappTextParameter(parameterName, value) {
  return {
    type: 'text',
    parameter_name: parameterName,
    text: truncateForCell(String(value || '').trim() || '-', 900),
  };
}

function getBookingCustomerName(booking) {
  if (booking.donation && booking.donation.name) return booking.donation.name;
  try {
    const donationRecord = getDonationRecord(booking.towerNumber, booking.apartmentNumber);
    return donationRecord && donationRecord.name ? donationRecord.name : 'Resident';
  } catch (error) {
    return 'Resident';
  }
}

function bookingMealsForWhatsApp(booking) {
  return truncateForCell(
    String(booking.bookingDetails || '')
      .split(';')
      .map((detail) => detail.trim())
      .filter((detail) => detail && !/^Pujo donation\b/i.test(detail))
      .join('; ') || 'Food coupons',
    900
  );
}

function formatPlainAmount(amount) {
  return Number(amount).toLocaleString('en-IN');
}

function extractWhatsAppError(body) {
  if (!body || !body.error) return '';
  return [body.error.message, body.error.error_data && body.error.error_data.details]
    .filter(Boolean)
    .join(' - ');
}

function truncateForCell(value, maxLength) {
  const text = String(value || '');
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function plainSheetText(value) {
  const text = String(value || '');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function appendBooking(booking) {
  const requestId = booking.bookingRequestId;
  const requestFingerprint = buildBookingRequestFingerprint(booking);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const completedBooking = getCompletedBookingRequest(requestId, requestFingerprint);
    if (completedBooking) return completedBooking;

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
      formatWhatsAppNumberForSheet(booking.whatsAppNumber),
      'Pending',
      '',
      '',
    ]);

    const savedRow = sheet.getLastRow();
    let savedBookingItemCount = 0;
    let savedDonationRow = 0;
    try {
      sheet.getRange(savedRow, 3).setNumberFormat('yyyy-mm-dd hh:mm:ss');
      sheet.getRange(savedRow, 6).setNumberFormat('₹#,##0.00');
      sheet.getRange(savedRow, 9).setNumberFormat('@').setValue(formatWhatsAppNumberForSheet(booking.whatsAppNumber));
      savedBookingItemCount = appendBookingItems(booking, bookingReference, createdAt);
      const donation = booking.donation ? appendDonation(booking) : null;
      savedDonationRow = donation ? donation.savedRow : 0;
      const whatsAppConfirmation = sendWhatsAppConfirmation(booking, bookingReference);
      sheet.getRange(savedRow, 10, 1, 3).setValues([[
        whatsAppConfirmation.status,
        whatsAppConfirmation.messageId,
        whatsAppConfirmation.sentAt || '',
      ]]);
      if (whatsAppConfirmation.sentAt) sheet.getRange(savedRow, 12).setNumberFormat('yyyy-mm-dd hh:mm:ss');

      const result = {
        serialNumber,
        bookingReference,
        createdAt: createdAt.toISOString(),
        bookingItemCount: savedBookingItemCount,
        donationReceiptNumber: donation ? donation.receiptNumber : null,
        whatsAppStatus: whatsAppConfirmation.status,
      };
      saveCompletedBookingRequest(requestId, requestFingerprint, result);
      return result;
    } catch (error) {
      if (savedDonationRow) getDonationSheet().deleteRow(savedDonationRow);
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
