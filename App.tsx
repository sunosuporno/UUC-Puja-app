import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { useEffect, useRef, useState } from "react";
import { Picker } from "@react-native-picker/picker";
import QRCode from "react-native-qrcode-svg";
import {
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

type Meal = {
  id: string;
  mealTime: string;
  foodType: "Veg" | "Non-Veg";
  menu: string;
  dineInPrice: number;
  takeawayPrice: number;
};

type Day = {
  date: string;
  name: string;
  meals: Meal[];
};

type SeasonPassConfig = {
  price: number;
  mealType: string;
  includedDays: string[];
  description: string;
};
type Screen =
  | "phone"
  | "booking"
  | "manage"
  | "admin"
  | "payment"
  | "cash"
  | "cheque"
  | "upi"
  | "success";
type PaymentMethod = "cash" | "cheque" | "upi";
type ServiceType = "Dine-In" | "Takeaway";
type PaymentPurpose = "booking" | "upgrade";
type MealQuantities = {
  dineIn: number;
  takeaway: number;
};
type ReviewItem = {
  id: string;
  label: string;
  quantity: number;
  subtotal: number;
};
type BookingItemPayload = {
  dayName: string;
  dayDate: string;
  mealType: string;
  foodType?: "Veg" | "Non-Veg";
  serviceType?: ServiceType;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  source: "Individual" | "Season Pass";
};
type FoodMenuResponse = {
  ok?: boolean;
  menu?: {
    days?: Day[];
    seasonPass?: SeasonPassConfig | null;
  };
  error?: string;
};
type DonationCheckResponse = {
  ok?: boolean;
  eligible?: boolean;
  donorName?: string;
  error?: string;
};
type ManagedBookingItem = {
  id: string;
  rowNumber: number;
  bookingReference: string;
  dayName: string;
  dayDate: string;
  mealType: string;
  foodType: string;
  serviceType: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  source: string;
  takeawayUnitPrice: number;
  extraUnitPrice: number;
  extraTotal: number;
  upgradeable: boolean;
};
type ManagedBooking = {
  bookingReference: string;
  createdAt: string;
  paymentMethod: string;
  payableAmount: number;
  bookingDetails: string;
  items: ManagedBookingItem[];
};
type ManagedBookingsResponse = {
  ok?: boolean;
  bookings?: ManagedBooking[];
  error?: string;
};
type AdminSummaryCounts = {
  quantity: number;
  veg: number;
  nonVeg: number;
  dineIn: number;
  takeaway: number;
  seasonPass: number;
  individual: number;
  amountCollected: number;
};
type AdminSummaryMeal = AdminSummaryCounts & {
  mealType: string;
  foodType: string;
  serviceType: string;
};
type AdminSummaryDay = AdminSummaryCounts & {
  dayName: string;
  dayDate: string;
  meals: AdminSummaryMeal[];
};
type AdminSummary = {
  generatedAt: string;
  totals: AdminSummaryCounts & {
    bookings: number;
    apartments: number;
  };
  days: AdminSummaryDay[];
};
type AdminSummaryResponse = {
  ok?: boolean;
  summary?: AdminSummary;
  error?: string;
};
type AdminDashboardView = 1 | 2;
type DashboardMatrixColumn = {
  key: string;
  mealType: string;
  foodType: "Veg" | "Non-Veg";
};
type DashboardMatrixRow = {
  key: string;
  eventName: string;
  serviceType: ServiceType;
  values: Record<string, { quantity: number; amount: number }>;
};

const MAX_QUANTITY = 15;
const DONATION_AMOUNT = 4000;
const APARTMENT_NUMBER_MAX_LENGTH = 20;
const DONOR_NAME_MAX_LENGTH = 80;
const TOWER_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "TH"];
const DEFAULT_SEASON_PASS_CONFIG: SeasonPassConfig = {
  price: 1450,
  mealType: "Lunch",
  includedDays: ["Saptami 1", "Saptami 2", "Ashtami", "Nabami"],
  description: "",
};
const UPI_ID = "boim-405733112614@boi";
const UPI_PAYEE_NAME = "UUC Pujo Coupons";
const BOOKINGS_API_URL = process.env.EXPO_PUBLIC_BOOKINGS_API_URL;
const CREATOR_NAME = "Suporno";
const CREATOR_EMAIL = "sarkarsuporno36@gmail.com";
const CREATOR_PHONE = "+91 62894 91245";

const currency = (amount: number) => `Rs. ${amount.toLocaleString("en-IN")}`;
const createClientRequestId = (prefix: "booking" | "upgrade") =>
  `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
const phoneDigits = (value: string) => value.replace(/\D/g, "");
const normalizeWhatsAppInput = (value: string) => {
  let digits = phoneDigits(value);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
};
const isValidWhatsAppNumber = (value: string) => {
  const digits = phoneDigits(value);
  return /^[6-9]\d{9}$/.test(digits);
};
const normalizeApartmentInput = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/g, " ");
const isValidApartmentNumber = (value: string) => {
  const normalized = normalizeApartmentInput(value);
  return (
    normalized.length <= APARTMENT_NUMBER_MAX_LENGTH &&
    /^[A-Z0-9]+(?:[ -][A-Z0-9]+)*$/.test(normalized)
  );
};
const normalizeDonorName = (value: string) => value.trim().replace(/\s+/g, " ");
const isValidDonorName = (value: string) => {
  const normalized = normalizeDonorName(value);
  return (
    normalized.length <= DONOR_NAME_MAX_LENGTH &&
    /^\p{L}[\p{L}\p{M} .'’\-]*$/u.test(normalized)
  );
};
const DISPLAY_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const displayDayDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;

  const monthIndex = Number(match[2]) - 1;
  const month = DISPLAY_MONTHS[monthIndex];
  if (!month) return value;

  return `${Number(match[3])} ${month}`;
};

const buildDashboardOneData = (menuDays: Day[], summary: AdminSummary) => {
  const eventNames: string[] = [];
  const seenEvents = new Set<string>();
  [...menuDays.map((day) => day.name), ...summary.days.map((day) => day.dayName)]
    .filter(Boolean)
    .forEach((eventName) => {
      if (seenEvents.has(eventName)) return;
      seenEvents.add(eventName);
      eventNames.push(eventName);
    });

  const mealTypes = ["Breakfast", "Lunch", "Dinner"];
  summary.days.forEach((day) => {
    day.meals.forEach((meal) => {
      if (meal.mealType && !mealTypes.includes(meal.mealType)) {
        mealTypes.push(meal.mealType);
      }
    });
  });

  const columns: DashboardMatrixColumn[] = mealTypes.flatMap((mealType) =>
    (["Veg", "Non-Veg"] as const).map((foodType) => ({
      key: `${mealType}-${foodType}`,
      mealType,
      foodType,
    }))
  );
  const rows: DashboardMatrixRow[] = eventNames.flatMap((eventName) =>
    (["Dine-In", "Takeaway"] as const).map((serviceType) => {
      const day = summary.days.find((candidate) => candidate.dayName === eventName);
      const values: DashboardMatrixRow["values"] = {};
      columns.forEach((column) => {
        const matches = day?.meals.filter(
          (meal) =>
            meal.mealType === column.mealType &&
            meal.foodType === column.foodType &&
            meal.serviceType === serviceType
        );
        values[column.key] = {
          quantity: (matches || []).reduce((sum, meal) => sum + meal.quantity, 0),
          amount: (matches || []).reduce(
            (sum, meal) => sum + meal.amountCollected,
            0
          ),
        };
      });
      return {
        key: `${eventName}-${serviceType}`,
        eventName,
        serviceType,
        values,
      };
    })
  );

  return { columns, rows };
};

const isPastEventDate = (value: string, today = new Date()) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const eventDate = new Date(year, monthIndex, day);
  if (
    eventDate.getFullYear() !== year ||
    eventDate.getMonth() !== monthIndex ||
    eventDate.getDate() !== day
  ) {
    return false;
  }

  const currentDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  return eventDate.getTime() < currentDate.getTime();
};

async function callBookingsApi<T>(payload: Record<string, unknown>): Promise<T> {
  if (!BOOKINGS_API_URL) {
    throw new Error("Booking service is not configured yet. Please try again later.");
  }

  const action = typeof payload.action === "string" ? payload.action : "";
  const isReadRequest = [
    "checkDonation",
    "getFoodMenu",
    "getBookingsForApartment",
    "getAdminSummary",
  ].includes(action);
  const maxAttempts = isReadRequest ? 2 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const requestOptions: RequestInit = isReadRequest
      ? {
          redirect: "follow",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }
      : {
          method: "POST",
          redirect: "follow",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Content-Type": "text/plain;charset=utf-8",
          },
          body: JSON.stringify(payload),
        };
    const requestUrl = isReadRequest
      ? `${BOOKINGS_API_URL}${
          BOOKINGS_API_URL.includes("?") ? "&" : "?"
        }${new URLSearchParams({
          payload: JSON.stringify(payload),
          _: `${Date.now()}-${attempt}-${Math.random().toString(36).slice(2)}`,
        }).toString()}`
      : BOOKINGS_API_URL;

    let response: Response;
    try {
      response = await fetch(requestUrl, requestOptions);
    } catch (error) {
      if (isReadRequest && attempt + 1 < maxAttempts) continue;
      throw error;
    }

    const trimmedText = (await response.text()).trim();
    try {
      const result = JSON.parse(trimmedText) as T;
      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Booking service returned an error.";
        throw new Error(message);
      }
      return result;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      if (isReadRequest && attempt + 1 < maxAttempts) continue;
      throw new Error(
        isReadRequest
          ? "The booking service was temporarily unavailable. Please try again."
          : "The booking may have been received, but confirmation could not be loaded. Check Manage Bookings before trying again."
      );
    }
  }

  throw new Error("The booking service was temporarily unavailable. Please try again.");
}

function normalizeSeasonPassConfig(
  value: SeasonPassConfig | null | undefined
) {
  if (
    !value ||
    !Number.isFinite(value.price) ||
    value.price <= 0 ||
    !Array.isArray(value.includedDays) ||
    value.includedDays.length === 0
  ) {
    return null;
  }

  return {
    price: value.price,
    mealType: value.mealType || DEFAULT_SEASON_PASS_CONFIG.mealType,
    includedDays: value.includedDays,
    description: value.description || "",
  };
}

function QuantityControl({
  quantity,
  onChange,
  disabled,
  maxQuantity = MAX_QUANTITY,
}: {
  quantity: number;
  onChange: (next: number) => void;
  disabled: boolean;
  maxQuantity?: number;
}) {
  return (
    <View
      style={[
        styles.quantityControl,
        disabled && styles.quantityControlDisabled,
      ]}
    >
      <Pressable
        disabled={disabled || quantity === 0}
        onPress={() => onChange(quantity - 1)}
        style={({ pressed }) => [
          styles.quantityButton,
          (disabled || quantity === 0) && styles.inactiveButton,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.quantitySymbol}>-</Text>
      </Pressable>
      <Text style={styles.quantityText}>{quantity}</Text>
      <Pressable
        disabled={disabled || quantity >= maxQuantity}
        onPress={() => onChange(quantity + 1)}
        style={({ pressed }) => [
          styles.quantityButton,
          (disabled || quantity >= maxQuantity) && styles.inactiveButton,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.quantitySymbol}>+</Text>
      </Pressable>
    </View>
  );
}

function HeaderLogo() {
  return (
    <Image
      accessibilityLabel="Udita Utsav Committee"
      resizeMode="contain"
      source={require("./assets/udita-logo-transparent.png")}
      style={styles.headerLogo}
    />
  );
}

function DashboardMatrix({
  title,
  columns,
  rows,
  valueType,
}: {
  title: string;
  columns: DashboardMatrixColumn[];
  rows: DashboardMatrixRow[];
  valueType: "quantity" | "amount";
}) {
  return (
    <View style={styles.dashboardMatrixCard}>
      <Text style={styles.dashboardMatrixTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={[styles.dashboardMatrixRow, styles.dashboardMatrixHeader]}>
            <Text style={[styles.dashboardMatrixHeaderText, styles.dashboardEventCell]}>
              Event
            </Text>
            <Text style={[styles.dashboardMatrixHeaderText, styles.dashboardServiceCell]}>
              Service
            </Text>
            {columns.map((column) => (
              <View key={column.key} style={styles.dashboardValueCell}>
                <Text style={styles.dashboardMatrixHeaderText}>{column.mealType}</Text>
                <Text style={styles.dashboardMatrixSubheader}>{column.foodType}</Text>
              </View>
            ))}
          </View>
          {rows.map((row, index) => (
            <View
              key={row.key}
              style={[
                styles.dashboardMatrixRow,
                index % 2 === 1 && styles.dashboardMatrixAlternateRow,
              ]}
            >
              <Text style={[styles.dashboardMatrixEvent, styles.dashboardEventCell]}>
                {row.eventName}
              </Text>
              <Text style={[styles.dashboardMatrixService, styles.dashboardServiceCell]}>
                {row.serviceType}
              </Text>
              {columns.map((column) => {
                const value = row.values[column.key]?.[valueType] || 0;
                return (
                  <Text key={column.key} style={[styles.dashboardMatrixValue, styles.dashboardValueCell]}>
                    {valueType === "amount" ? currency(value) : value}
                  </Text>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export default function App() {
  const [homeFontsLoaded] = useFonts({
    Avigea: require("./assets/fonts/Avigea.otf"),
    Balooda2Medium: require("./assets/fonts/Balooda2-Medium.ttf"),
    Balooda2ExtraBold: require("./assets/fonts/Balooda2-ExtraBold.ttf"),
  });
  const { width } = useWindowDimensions();
  const isPhoneWidth = width < 720;
  const shouldStackHomeActions = width < 360;
  const submissionInFlightRef = useRef(false);
  const bookingRequestIdRef = useRef("");
  const upgradeRequestIdRef = useRef("");
  const [screen, setScreen] = useState<Screen>("phone");
  const [towerNumber, setTowerNumber] = useState("");
  const [apartmentNumber, setApartmentNumber] = useState("");
  const [whatsAppNumber, setWhatsAppNumber] = useState("");
  const [focusedLocationField, setFocusedLocationField] = useState<
    "tower" | "apartment" | "whatsapp" | "name" | null
  >(null);
  const [donationRecordMissing, setDonationRecordMissing] = useState(false);
  const [donationSelected, setDonationSelected] = useState(false);
  const [donationDeclined, setDonationDeclined] = useState(false);
  const [donorName, setDonorName] = useState("");
  const [eligibilityError, setEligibilityError] = useState("");
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [manageError, setManageError] = useState("");
  const [isLoadingManagedBookings, setIsLoadingManagedBookings] =
    useState(false);
  const [managedBookings, setManagedBookings] = useState<ManagedBooking[]>([]);
  const [upgradeQuantities, setUpgradeQuantities] = useState<
    Record<string, number>
  >({});
  const [upgradeReference, setUpgradeReference] = useState("");
  const [adminSummary, setAdminSummary] = useState<AdminSummary | null>(null);
  const [activeAdminDashboard, setActiveAdminDashboard] =
    useState<AdminDashboardView>(1);
  const [adminError, setAdminError] = useState("");
  const [isLoadingAdminSummary, setIsLoadingAdminSummary] = useState(false);
  const [days, setDays] = useState<Day[]>([]);
  const [seasonPassConfig, setSeasonPassConfig] =
    useState<SeasonPassConfig | null>(null);
  const [isMenuLoading, setIsMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");
  const [seasonPasses, setSeasonPasses] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, MealQuantities>>(
    {}
  );
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashInputFocused, setCashInputFocused] = useState(false);
  const [chequeNumber, setChequeNumber] = useState("");
  const [upiTransactionId, setUpiTransactionId] = useState("");
  const [upiPaymentReported, setUpiPaymentReported] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null
  );
  const [paymentPurpose, setPaymentPurpose] =
    useState<PaymentPurpose>("booking");
  const [bookingReference, setBookingReference] = useState("");
  const [bookingSubmissionError, setBookingSubmissionError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creatorContactOpen, setCreatorContactOpen] = useState(false);

  useEffect(() => {
    let active = true;

    const loadFoodMenu = async () => {
      if (!BOOKINGS_API_URL) {
        if (active) {
          setMenuError(
            "Menu service is not configured yet. Please try again later."
          );
          setIsMenuLoading(false);
        }
        return;
      }

      try {
        const result = await callBookingsApi<FoodMenuResponse>({
          action: "getFoodMenu",
        });

        if (!result.ok || !Array.isArray(result.menu?.days)) {
          throw new Error(result.error || "Unable to load food menu.");
        }

        if (active) {
          setDays(result.menu.days.filter((day) => !isPastEventDate(day.date)));
          const normalizedSeasonPass = normalizeSeasonPassConfig(
            result.menu.seasonPass
          );
          setSeasonPassConfig(normalizedSeasonPass);
          if (!normalizedSeasonPass) setSeasonPasses(0);
          setMenuError("");
        }
      } catch (error) {
        if (active)
          setMenuError(
            error instanceof Error ? error.message : "Unable to load food menu."
          );
      } finally {
        if (active) setIsMenuLoading(false);
      }
    };

    void loadFoodMenu();
    return () => {
      active = false;
    };
  }, []);

  const getMealQuantities = (mealId: string) =>
    quantities[mealId] ?? { dineIn: 0, takeaway: 0 };
  const hasSeasonPass = seasonPassConfig !== null;
  const activeSeasonPasses = hasSeasonPass ? seasonPasses : 0;
  const currentSeasonPassPrice = seasonPassConfig?.price ?? 0;
  const seasonPassLunchDays = seasonPassConfig?.includedDays ?? [];
  const seasonPassMealType =
    seasonPassConfig?.mealType || DEFAULT_SEASON_PASS_CONFIG.mealType;
  const seasonPassSubtitle =
    seasonPassConfig?.description ||
    `Includes ${seasonPassMealType.toLowerCase()} for ${seasonPassLunchDays.join(
      ", "
    )}`;
  const granularCount = Object.values(quantities).reduce(
    (sum, quantity) => sum + quantity.dineIn + quantity.takeaway,
    0
  );
  const granularTotal = days
    .flatMap((day) => day.meals)
    .reduce((sum, meal) => {
      const quantity = getMealQuantities(meal.id);
      return (
        sum +
        meal.dineInPrice * quantity.dineIn +
        meal.takeawayPrice * quantity.takeaway
      );
    }, 0);
  const couponTotal = activeSeasonPasses * currentSeasonPassPrice + granularTotal;
  const total = couponTotal + (donationSelected ? DONATION_AMOUNT : 0);
  const individualBookingItems: BookingItemPayload[] = days
    .flatMap((day) =>
      day.meals.flatMap((meal) => {
        const mealQuantities = getMealQuantities(meal.id);
        const rows: BookingItemPayload[] = [];

        if (mealQuantities.dineIn > 0) {
          rows.push({
            dayName: day.name,
            dayDate: day.date,
            mealType: meal.mealTime,
            foodType: meal.foodType,
            serviceType: "Dine-In",
            quantity: mealQuantities.dineIn,
            unitPrice: meal.dineInPrice,
            lineTotal: meal.dineInPrice * mealQuantities.dineIn,
            source: "Individual" as const,
          });
        }

        if (mealQuantities.takeaway > 0) {
          rows.push({
            dayName: day.name,
            dayDate: day.date,
            mealType: meal.mealTime,
            foodType: meal.foodType,
            serviceType: "Takeaway",
            quantity: mealQuantities.takeaway,
            unitPrice: meal.takeawayPrice,
            lineTotal: meal.takeawayPrice * mealQuantities.takeaway,
            source: "Individual" as const,
          });
        }

        return rows;
      })
    )
    .filter((item) => item.quantity > 0);
  const seasonPassUnitPrice =
    seasonPassLunchDays.length > 0
      ? currentSeasonPassPrice / seasonPassLunchDays.length
      : 0;
  const seasonPassBookingItems: BookingItemPayload[] =
    activeSeasonPasses > 0
      ? seasonPassLunchDays.map((dayName) => ({
          dayName,
          dayDate: days.find((day) => day.name === dayName)?.date || "",
          mealType: seasonPassMealType,
          quantity: activeSeasonPasses,
          unitPrice: seasonPassUnitPrice,
          lineTotal: seasonPassUnitPrice * activeSeasonPasses,
          source: "Season Pass" as const,
        }))
      : [];
  const bookingItems = [...seasonPassBookingItems, ...individualBookingItems];
  const mealItems: ReviewItem[] = individualBookingItems.map((item) => ({
    id: `${item.dayName}-${item.mealType}-${item.foodType}-${item.serviceType}`,
    label: `${item.dayName}: ${item.mealType} (${item.foodType}, ${item.serviceType})`,
    quantity: item.quantity,
    subtotal: item.lineTotal,
  }));
  const selectedItems: ReviewItem[] = [
    ...(donationSelected
      ? [
          {
            id: "pujo-donation",
            label: "Pujo donation",
            quantity: 1,
            subtotal: DONATION_AMOUNT,
          },
        ]
      : []),
    ...(activeSeasonPasses > 0
      ? [
          {
            id: "season-pass",
            label: "Season pass",
            quantity: activeSeasonPasses,
            subtotal: activeSeasonPasses * currentSeasonPassPrice,
          },
        ]
      : []),
    ...mealItems,
  ];
  const managedItems = managedBookings.flatMap((booking) => booking.items);
  const selectedUpgradeItems: ReviewItem[] = managedItems
    .filter(
      (item) => item.upgradeable && (upgradeQuantities[item.id] ?? 0) > 0
    )
    .map((item) => ({
      id: item.id,
      label: `${item.bookingReference}: ${item.dayName} ${item.mealType} (${item.foodType}) to Takeaway`,
      quantity: upgradeQuantities[item.id] ?? 0,
      subtotal: item.extraUnitPrice * (upgradeQuantities[item.id] ?? 0),
    }));
  const upgradeTotal = selectedUpgradeItems.reduce(
    (sum, item) => sum + item.subtotal,
    0
  );
  const paymentTotal = paymentPurpose === "upgrade" ? upgradeTotal : total;
  const paymentItems =
    paymentPurpose === "upgrade" ? selectedUpgradeItems : selectedItems;
  const cashAmountValue = Number(cashAmount.replace(/,/g, "").trim());
  const hasCashAmount = cashAmount.trim().length > 0;
  const isCashAmountValid =
    Number.isFinite(cashAmountValue) && cashAmountValue >= paymentTotal;
  const cashChange = isCashAmountValid ? cashAmountValue - paymentTotal : 0;
  const cashShortfall =
    hasCashAmount &&
    Number.isFinite(cashAmountValue) &&
    cashAmountValue < paymentTotal
      ? paymentTotal - cashAmountValue
      : 0;
  const mealBookingDetails = days
    .map((day) => {
      const mealDetails = day.meals
        .flatMap((meal) => {
          const mealQuantities = getMealQuantities(meal.id);
          return [
            mealQuantities.dineIn > 0
              ? `${meal.mealTime} (${meal.foodType}, Dine-In) x ${mealQuantities.dineIn}`
              : null,
            mealQuantities.takeaway > 0
              ? `${meal.mealTime} (${meal.foodType}, Takeaway) x ${mealQuantities.takeaway}`
              : null,
          ];
        })
        .filter((detail): detail is string => detail !== null)
        .join(", ");
      return mealDetails ? `${day.name}: ${mealDetails}` : null;
    })
    .filter((detail): detail is string => detail !== null);
  const bookingDetails = [
    donationSelected
      ? `Pujo donation x 1 (${currency(DONATION_AMOUNT)})`
      : null,
    activeSeasonPasses > 0 ? `Season pass x ${activeSeasonPasses}` : null,
    ...mealBookingDetails,
  ]
    .filter((detail): detail is string => detail !== null)
    .join("; ");
  const selectionSummary =
    [
      donationSelected ? "Pujo donation" : null,
      activeSeasonPasses > 0
        ? `${activeSeasonPasses} season ${activeSeasonPasses === 1 ? "pass" : "passes"}`
        : null,
      granularCount > 0
        ? `${granularCount} meal ${granularCount === 1 ? "coupon" : "coupons"}`
        : null,
    ]
      .filter((detail): detail is string => detail !== null)
      .join(", ") || "No coupons selected";
  const upiPaymentUri = `upi://pay?pa=${encodeURIComponent(
    UPI_ID
  )}&pn=${encodeURIComponent(UPI_PAYEE_NAME)}&am=${paymentTotal.toFixed(
    2
  )}&cu=INR&tn=${encodeURIComponent(
    paymentPurpose === "upgrade"
      ? "UUC Pujo takeaway upgrade"
      : "UUC Pujo food coupons"
  )}`;

  const changeSeasonPasses = (next: number) => {
    setSeasonPasses(next);
  };

  const changeMealQuantity = (mealId: string, next: number) => {
    setQuantities((current) => ({
      ...current,
      [mealId]: {
        ...(current[mealId] ?? { dineIn: 0, takeaway: 0 }),
        dineIn: next,
      },
    }));
  };

  const changeTakeawayQuantity = (mealId: string, next: number) => {
    setQuantities((current) => ({
      ...current,
      [mealId]: {
        ...(current[mealId] ?? { dineIn: 0, takeaway: 0 }),
        takeaway: next,
      },
    }));
  };

  const loadManagedBookings = async () => {
    if (!BOOKINGS_API_URL) {
      setManageError(
        "Booking service is not configured yet. Please try again later."
      );
      return;
    }

    setDonationRecordMissing(false);
    setDonationSelected(false);
    setDonationDeclined(false);
    setEligibilityError("");
    setManageError("");
    setManagedBookings([]);
    setUpgradeQuantities({});
    setIsLoadingManagedBookings(true);

    try {
      const result = await callBookingsApi<ManagedBookingsResponse>({
        action: "getBookingsForApartment",
        towerNumber,
        apartmentNumber,
      });

      if (!result.ok || !Array.isArray(result.bookings)) {
        throw new Error(result.error || "Unable to load bookings.");
      }

      if (result.bookings.length === 0) {
        setManageError("No bookings found for this tower and apartment.");
        return;
      }

      setManagedBookings(result.bookings);
      setScreen("manage");
    } catch (error) {
      setManageError(
        error instanceof Error ? error.message : "Unable to load bookings."
      );
    } finally {
      setIsLoadingManagedBookings(false);
    }
  };

  const loadAdminSummary = async () => {
    if (!BOOKINGS_API_URL) {
      setAdminError(
        "Booking service is not configured yet. Please try again later."
      );
      return;
    }

    setAdminError("");
    setAdminSummary(null);
    setIsLoadingAdminSummary(true);

    try {
      const result = await callBookingsApi<AdminSummaryResponse>({
        action: "getAdminSummary",
      });

      if (!result.ok || !result.summary) {
        throw new Error(result.error || "Unable to load admin summary.");
      }

      setAdminSummary(result.summary);
      setScreen("admin");
    } catch (error) {
      setAdminError(
        error instanceof Error ? error.message : "Unable to load admin summary."
      );
    } finally {
      setIsLoadingAdminSummary(false);
    }
  };

  const changeUpgradeQuantity = (
    itemId: string,
    nextQuantity: number,
    availableQuantity: number
  ) => {
    const safeQuantity = Math.max(
      0,
      Math.min(Math.floor(nextQuantity), availableQuantity)
    );
    setUpgradeQuantities((current) => {
      if (safeQuantity === 0) {
        const updated = { ...current };
        delete updated[itemId];
        return updated;
      }

      return { ...current, [itemId]: safeQuantity };
    });
  };

  const completeBooking = async (method: PaymentMethod) => {
    if (submissionInFlightRef.current) return;
    if (!TOWER_OPTIONS.includes(towerNumber)) {
      setBookingSubmissionError("Choose a valid tower.");
      return;
    }
    if (!isValidApartmentNumber(apartmentNumber)) {
      setBookingSubmissionError("Enter a valid apartment number.");
      return;
    }
    if (!isValidWhatsAppNumber(whatsAppNumber)) {
      setBookingSubmissionError("Enter a valid 10-digit WhatsApp number.");
      return;
    }
    if (donationSelected && !isValidDonorName(donorName)) {
      setBookingSubmissionError("Enter a valid name beginning with a letter.");
      return;
    }

    if (!BOOKINGS_API_URL) {
      setBookingSubmissionError(
        "Booking service is not configured yet. Please try again later."
      );
      return;
    }

    setBookingSubmissionError("");
    submissionInFlightRef.current = true;
    setIsSubmitting(true);
    if (!bookingRequestIdRef.current) {
      bookingRequestIdRef.current = createClientRequestId("booking");
    }

    try {
      const result = await callBookingsApi<{
        ok?: boolean;
        booking?: { bookingReference?: string };
        error?: string;
      }>({
        bookingRequestId: bookingRequestIdRef.current,
        towerNumber,
        apartmentNumber,
        whatsAppNumber,
        paymentMethod: method,
        payableAmount: total,
        paymentReference:
          method === "cash"
            ? ""
            : method === "cheque"
            ? chequeNumber
            : upiTransactionId,
        bookingDetails,
        bookingItems,
        donation: donationSelected
          ? { name: donorName, amount: DONATION_AMOUNT }
          : null,
      });

      if (!result.ok || !result.booking?.bookingReference) {
        throw new Error(result.error || "Unable to save booking.");
      }

      setPaymentMethod(method);
      setBookingReference(result.booking.bookingReference);
      setScreen("success");
    } catch (error) {
      setBookingSubmissionError(
        error instanceof Error ? error.message : "Unable to save booking."
      );
    } finally {
      submissionInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const completeUpgrade = async (method: PaymentMethod) => {
    if (submissionInFlightRef.current) return;
    const itemUpgrades = selectedUpgradeItems.map((item) => ({
      itemId: item.id,
      quantity: item.quantity,
    }));
    if (!BOOKINGS_API_URL) {
      setBookingSubmissionError(
        "Booking service is not configured yet. Please try again later."
      );
      return;
    }
    if (itemUpgrades.length === 0 || upgradeTotal <= 0) {
      setBookingSubmissionError(
        "Select at least one dine-in item to switch to takeaway."
      );
      return;
    }

    setBookingSubmissionError("");
    submissionInFlightRef.current = true;
    setIsSubmitting(true);
    if (!upgradeRequestIdRef.current) {
      upgradeRequestIdRef.current = createClientRequestId("upgrade");
    }

    try {
      const result = await callBookingsApi<{
        ok?: boolean;
        upgrade?: { upgradeReference?: string };
        error?: string;
      }>({
        action: "upgradeToTakeaway",
        towerNumber,
        apartmentNumber,
        itemUpgrades,
        upgradeRequestId: upgradeRequestIdRef.current,
        paymentMethod: method,
        payableAmount: upgradeTotal,
        paymentReference:
          method === "cash"
            ? ""
            : method === "cheque"
            ? chequeNumber
            : upiTransactionId,
      });

      if (!result.ok || !result.upgrade?.upgradeReference) {
        throw new Error(result.error || "Unable to save takeaway upgrade.");
      }

      setPaymentMethod(method);
      setUpgradeReference(result.upgrade.upgradeReference);
      setBookingReference(result.upgrade.upgradeReference);
      setScreen("success");
    } catch (error) {
      setBookingSubmissionError(
        error instanceof Error
          ? error.message
          : "Unable to save takeaway upgrade."
      );
    } finally {
      submissionInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const completePayment = (method: PaymentMethod) =>
    paymentPurpose === "upgrade"
      ? completeUpgrade(method)
      : completeBooking(method);

  const startNewBooking = () => {
    setTowerNumber("");
    setApartmentNumber("");
    setWhatsAppNumber("");
    setDonationRecordMissing(false);
    setDonationSelected(false);
    setDonationDeclined(false);
    setDonorName("");
    setEligibilityError("");
    setIsCheckingEligibility(false);
    setManageError("");
    setIsLoadingManagedBookings(false);
    setManagedBookings([]);
    setUpgradeQuantities({});
    bookingRequestIdRef.current = "";
    upgradeRequestIdRef.current = "";
    setUpgradeReference("");
    setAdminSummary(null);
    setAdminError("");
    setIsLoadingAdminSummary(false);
    setSeasonPasses(0);
    setQuantities({});
    setCashAmount("");
    setCashInputFocused(false);
    setChequeNumber("");
    setUpiTransactionId("");
    setUpiPaymentReported(false);
    setPaymentMethod(null);
    setPaymentPurpose("booking");
    setBookingReference("");
    setBookingSubmissionError("");
    setCreatorContactOpen(false);
    setScreen("phone");
  };

  if (screen === "phone") {
    const canLocateApartment =
      TOWER_OPTIONS.includes(towerNumber) &&
      isValidApartmentNumber(apartmentNumber);
    const canCheckApartment =
      canLocateApartment && isValidWhatsAppNumber(whatsAppNumber);
    const canContinueWithDonation =
      donationSelected &&
      isValidDonorName(donorName) &&
      isValidWhatsAppNumber(whatsAppNumber);
    const canManageBookings = canLocateApartment && !isLoadingManagedBookings;

    const checkEligibility = async () => {
      if (!BOOKINGS_API_URL) {
        setEligibilityError(
          "Eligibility service is not configured yet. Please try again later."
        );
        return;
      }

      setDonationRecordMissing(false);
      setDonationSelected(false);
      setDonationDeclined(false);
      setEligibilityError("");
      setIsCheckingEligibility(true);

      try {
        const result = await callBookingsApi<DonationCheckResponse>({
          action: "checkDonation",
          towerNumber,
          apartmentNumber,
        });

        if (
          !result.ok ||
          typeof result.eligible !== "boolean"
        ) {
          throw new Error(result.error || "Unable to check donation records.");
        }

        if (result.eligible) {
          if (result.donorName) setDonorName(result.donorName);
          setScreen("booking");
        } else setDonationRecordMissing(true);
      } catch (error) {
        setEligibilityError(
          error instanceof Error
            ? error.message
            : "Unable to check donation records."
        );
      } finally {
        setIsCheckingEligibility(false);
      }
    };

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={[
            styles.welcomeScreen,
            isPhoneWidth && styles.phoneWelcomeScreen,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sun} />
          <View
            style={[
              styles.homeLogoBadge,
              isPhoneWidth && styles.phoneHomeLogoBadge,
            ]}
          >
            <Image
              source={require("./assets/udita-logo-transparent.png")}
              resizeMode="contain"
              style={[styles.homeLogo, isPhoneWidth && styles.phoneHomeLogo]}
            />
          </View>
          <View
            style={[
              styles.welcomeStack,
              isPhoneWidth && styles.phoneWelcomeStack,
            ]}
          >
            <View style={styles.welcomeContent}>
              <View
                style={[styles.homeHero, isPhoneWidth && styles.phoneHomeHero]}
              >
                <Text
                  style={[
                    styles.homeHeroTitle,
                    isPhoneWidth && styles.phoneHomeHeroTitle,
                    homeFontsLoaded && styles.avigeaFont,
                  ]}
                >
                  Petpujor{"\n"}Bandobasto
                </Text>
                <View
                  style={[
                    styles.homeYearSeal,
                    isPhoneWidth && styles.phoneHomeYearSeal,
                  ]}
                >
                  <Text
                    style={[
                      styles.homeYearText,
                      isPhoneWidth && styles.phoneHomeYearText,
                      homeFontsLoaded && styles.baloodaExtraBoldFont,
                    ]}
                  >
                    2026
                  </Text>
                  <Text
                    style={[
                      styles.homeYearText,
                      isPhoneWidth && styles.phoneHomeYearText,
                      homeFontsLoaded && styles.baloodaExtraBoldFont,
                    ]}
                  >
                    2027
                  </Text>
                </View>
              </View>
              <Text
                style={[
                  styles.homeSubhero,
                  isPhoneWidth && styles.phoneHomeSubhero,
                  homeFontsLoaded && styles.baloodaFont,
                ]}
              >
                Joy in every meal!
              </Text>
              <View style={styles.phoneCard}>
                <View style={locationStyles.inputs}>
                  <View style={locationStyles.towerField}>
                    <Text style={styles.phoneCardLabel}>YOUR TOWER</Text>
                    <View
                      style={[
                        locationStyles.locationInputShell,
                        focusedLocationField === "tower" && inputFocusStyle,
                      ]}
                    >
                      <Picker<string>
                        selectedValue={towerNumber}
                        onValueChange={(value) => {
                          if (!value) return;
                          setTowerNumber(value);
                          setDonationRecordMissing(false);
                          setDonationSelected(false);
                          setDonationDeclined(false);
                          setDonorName("");
                          setEligibilityError("");
                          setManageError("");
                        }}
                        mode="dropdown"
                        dropdownIconColor="#7C1D19"
                        onFocus={() => setFocusedLocationField("tower")}
                        onBlur={() => setFocusedLocationField(null)}
                        style={[locationStyles.towerPicker, pickerWebStyle]}
                        itemStyle={locationStyles.towerPickerItem}
                      >
                        <Picker.Item
                          label="Select"
                          value=""
                          enabled={false}
                          color="#B68473"
                        />
                        {TOWER_OPTIONS.map((tower) => (
                          <Picker.Item
                            key={tower}
                            label={tower}
                            value={tower}
                          />
                        ))}
                      </Picker>
                      {Platform.OS === "web" ? (
                        <Text
                          pointerEvents="none"
                          style={locationStyles.towerPickerChevron}
                        >
                          ⌄
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={locationStyles.apartmentField}>
                    <Text style={styles.phoneCardLabel}>
                      YOUR APARTMENT NUMBER
                    </Text>
                    <View
                      style={[
                        locationStyles.locationInputShell,
                        focusedLocationField === "apartment" && inputFocusStyle,
                      ]}
                    >
                      <TextInput
                        value={apartmentNumber}
                        onChangeText={(value) => {
                          setApartmentNumber(value.slice(0, APARTMENT_NUMBER_MAX_LENGTH));
                          setDonationRecordMissing(false);
                          setDonationSelected(false);
                          setDonationDeclined(false);
                          setDonorName("");
                          setEligibilityError("");
                          setManageError("");
                        }}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={APARTMENT_NUMBER_MAX_LENGTH}
                        onFocus={() => setFocusedLocationField("apartment")}
                        onBlur={() => {
                          setApartmentNumber(normalizeApartmentInput(apartmentNumber));
                          setFocusedLocationField(null);
                        }}
                        placeholder="e.g. 204 II"
                        placeholderTextColor="#B68473"
                        style={[
                          styles.phoneInput,
                          inputWebStyle,
                          locationStyles.locationTextInput,
                        ]}
                      />
                    </View>
                    {apartmentNumber.length > 0 &&
                    !isValidApartmentNumber(apartmentNumber) ? (
                      <Text style={locationStyles.validationText}>
                        Use only letters, numbers, spaces, or hyphens.
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={locationStyles.whatsAppField}>
                  <Text style={styles.phoneCardLabel}>WHATSAPP NUMBER</Text>
                  <View
                    style={[
                      locationStyles.locationInputShell,
                      focusedLocationField === "whatsapp" && inputFocusStyle,
                    ]}
                  >
                    <View style={locationStyles.phoneNumberRow}>
                      <Text style={locationStyles.countryCode}>+91</Text>
                      <TextInput
                        value={whatsAppNumber}
                        onChangeText={(value) => {
                          setWhatsAppNumber(normalizeWhatsAppInput(value));
                          setEligibilityError("");
                        }}
                        autoComplete="tel"
                        keyboardType="phone-pad"
                        maxLength={20}
                        onFocus={() => setFocusedLocationField("whatsapp")}
                        onBlur={() => setFocusedLocationField(null)}
                        placeholder="9876543210"
                        placeholderTextColor="#B68473"
                        style={[
                          styles.phoneInput,
                          inputWebStyle,
                          locationStyles.locationTextInput,
                          locationStyles.phoneNumberInput,
                        ]}
                      />
                    </View>
                  </View>
                  {whatsAppNumber.length > 0 &&
                  !isValidWhatsAppNumber(whatsAppNumber) ? (
                    <Text style={locationStyles.validationText}>
                      Enter a valid 10-digit Indian mobile number.
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.phoneHint}>
                  We will check your Pujo donation status before booking and
                  send the confirmation on WhatsApp.
                </Text>
                {donationRecordMissing ? (
                  <View>
                    <View style={styles.notFoundMessage}>
                      <Text style={styles.notFoundTitle}>
                        No donation records found.
                      </Text>
                      <Text style={styles.notFoundText}>
                        Would you like to make the Pujo donation now and book
                        coupons together?
                      </Text>
                    </View>
                    {!donationSelected && !donationDeclined ? (
                      <View style={donationStyles.choiceRow}>
                        <Pressable
                          onPress={() => setDonationSelected(true)}
                          style={({ pressed }) => [
                            donationStyles.addButton,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={donationStyles.addButtonText}>
                            Yes, add {currency(DONATION_AMOUNT)}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setDonationDeclined(true)}
                          style={({ pressed }) => [
                            donationStyles.declineButton,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={donationStyles.declineButtonText}>
                            No, not now
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                    {donationSelected ? (
                      <View style={donationStyles.selectedDonation}>
                        <Text style={donationStyles.donationTitle}>
                          Pujo donation added
                        </Text>
                        <Text style={donationStyles.donationBody}>
                          {currency(DONATION_AMOUNT)} will be included with your
                          coupon payment.
                        </Text>
                        <Text style={styles.phoneCardLabel}>YOUR NAME</Text>
                        <TextInput
                          value={donorName}
                          onChangeText={(value) =>
                            setDonorName(value.slice(0, DONOR_NAME_MAX_LENGTH))
                          }
                          autoCapitalize="words"
                          autoCorrect={false}
                          maxLength={DONOR_NAME_MAX_LENGTH}
                          onFocus={() => setFocusedLocationField("name")}
                          onBlur={() => {
                            setDonorName(normalizeDonorName(donorName));
                            setFocusedLocationField(null);
                          }}
                          placeholder="Enter your name"
                          placeholderTextColor="#B68473"
                          style={[
                            styles.phoneInput,
                            inputWebStyle,
                            focusedLocationField === "name" && inputFocusStyle,
                          ]}
                        />
                        {donorName.length > 0 && !isValidDonorName(donorName) ? (
                          <Text style={locationStyles.validationText}>
                            Start with a letter and use only name characters.
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                    {donationDeclined ? (
                      <Text style={donationStyles.declinedText}>
                        A Pujo donation record is required before food coupons
                        can be booked.
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {eligibilityError ? (
                  <View style={styles.notFoundMessage}>
                    <Text style={styles.notFoundTitle}>
                      Unable to check eligibility.
                    </Text>
                    <Text style={styles.notFoundText}>{eligibilityError}</Text>
                  </View>
                ) : null}
                {manageError ? (
                  <View style={styles.notFoundMessage}>
                    <Text style={styles.notFoundTitle}>
                      Unable to load bookings.
                    </Text>
                    <Text style={styles.notFoundText}>{manageError}</Text>
                  </View>
                ) : null}
                {adminError ? (
                  <View style={styles.notFoundMessage}>
                    <Text style={styles.notFoundTitle}>
                      Unable to load admin summary.
                    </Text>
                    <Text style={styles.notFoundText}>{adminError}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View
              style={[
                styles.welcomeActions,
                isPhoneWidth && styles.phoneWelcomeActions,
                shouldStackHomeActions && styles.stackedWelcomeActions,
              ]}
            >
              <Pressable
                disabled={
                  donationSelected
                    ? !canContinueWithDonation
                    : !canCheckApartment || isCheckingEligibility
                }
                onPress={() =>
                  donationSelected
                    ? setScreen("booking")
                    : void checkEligibility()
                }
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.actionButton,
                  styles.primaryActionButton,
                  shouldStackHomeActions && styles.stackedActionButton,
                  (donationSelected
                    ? !canContinueWithDonation
                    : !canCheckApartment || isCheckingEligibility) &&
                    styles.primaryButtonDisabled,
                  pressed &&
                    (donationSelected
                      ? canContinueWithDonation
                      : canCheckApartment && !isCheckingEligibility) &&
                    styles.pressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {donationSelected
                    ? "Continue to coupons"
                    : isCheckingEligibility
                    ? "Checking..."
                    : "Check eligibility"}
                </Text>
                <Text style={styles.buttonArrow}>→</Text>
              </Pressable>
              <Pressable
                disabled={!canManageBookings}
                onPress={() => void loadManagedBookings()}
                style={({ pressed }) => [
                  styles.secondaryActionButton,
                  shouldStackHomeActions && styles.stackedActionButton,
                  !canManageBookings && styles.secondaryActionButtonDisabled,
                  pressed && canManageBookings && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryActionButtonText}>
                  {isLoadingManagedBookings ? "Loading..." : "Manage bookings"}
                </Text>
              </Pressable>
              <Pressable
                disabled={isLoadingAdminSummary}
                onPress={() => {
                  setActiveAdminDashboard(1);
                  void loadAdminSummary();
                }}
                style={({ pressed }) => [
                  styles.secondaryActionButton,
                  shouldStackHomeActions && styles.stackedActionButton,
                  isLoadingAdminSummary && styles.secondaryActionButtonDisabled,
                  pressed && !isLoadingAdminSummary && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryActionButtonText}>
                  {isLoadingAdminSummary ? "Loading..." : "Dashboards"}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
        <View style={styles.creatorFooter}>
          {creatorContactOpen ? (
            <View style={styles.creatorContactBubble}>
              <Text style={styles.creatorContactTitle}>Contact</Text>
              <Text style={styles.creatorContactText}>{CREATOR_EMAIL}</Text>
              <Text style={styles.creatorContactText}>{CREATOR_PHONE}</Text>
            </View>
          ) : null}
          <View style={styles.creatorFooterRow}>
            <Text style={styles.creatorFooterText}>Made with ♥️ by </Text>
            <Pressable
              hitSlop={8}
              onPress={() => setCreatorContactOpen((isOpen) => !isOpen)}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.creatorName}>{CREATOR_NAME}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "admin") {
    const totals = adminSummary?.totals;
    const updatedAt = adminSummary?.generatedAt
      ? new Date(adminSummary.generatedAt).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "";
    const totalCards = totals
      ? [
          {
            label: "Amount collected",
            value: currency(totals.amountCollected),
          },
          { label: "Meal coupons", value: String(totals.quantity) },
          { label: "Bookings", value: String(totals.bookings) },
          { label: "Apartments", value: String(totals.apartments) },
        ]
      : [];
    const mixCards = totals
      ? [
          { label: "Veg", value: totals.veg },
          { label: "Non-Veg", value: totals.nonVeg },
          { label: "Dine-in", value: totals.dineIn },
          { label: "Takeaway", value: totals.takeaway },
          { label: "Season pass", value: totals.seasonPass },
          { label: "Individual", value: totals.individual },
        ]
      : [];
    const dashboardOneData = adminSummary
      ? buildDashboardOneData(days, adminSummary)
      : { columns: [], rows: [] };

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.bookingHeader}>
          <Pressable onPress={() => setScreen("phone")} hitSlop={12}>
            <Text style={styles.backButton}>‹ Home</Text>
          </Pressable>
          <View>
            <Text style={styles.headerKicker}>ADMIN</Text>
            <Text style={styles.headerTitle}>Dashboards</Text>
          </View>
          <HeaderLogo />
        </View>
        <ScrollView
          contentContainerStyle={styles.bookingContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.adminDashboardTabs}>
            {([1, 2] as const).map((dashboardNumber) => {
              const selected = activeAdminDashboard === dashboardNumber;
              return (
                <Pressable
                  key={dashboardNumber}
                  onPress={() => setActiveAdminDashboard(dashboardNumber)}
                  style={({ pressed }) => [
                    styles.adminDashboardTab,
                    selected && styles.adminDashboardTabSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.adminDashboardTabText,
                      selected && styles.adminDashboardTabTextSelected,
                    ]}
                  >
                    Dashboard {dashboardNumber}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.introBlock}>
            <Text style={styles.introTitle}>
              Dashboard {activeAdminDashboard}
            </Text>
            <Text style={styles.introBody}>
              {activeAdminDashboard === 1
                ? "Quantity and amount matrix by event, service, meal, and food type."
                : "Detailed coupon totals and day-wise meal breakdown."}
            </Text>
            {updatedAt ? (
              <Text style={styles.adminTimestamp}>Updated {updatedAt}</Text>
            ) : null}
          </View>
          {adminError ? (
            <Text style={styles.submissionError}>{adminError}</Text>
          ) : null}
          {!adminSummary ? (
            <Text style={styles.menuStateMessage}>
              No admin summary is loaded yet.
            </Text>
          ) : null}
          {adminSummary && activeAdminDashboard === 1 ? (
            <>
              <DashboardMatrix
                title="Quantity"
                columns={dashboardOneData.columns}
                rows={dashboardOneData.rows}
                valueType="quantity"
              />
              <DashboardMatrix
                title="Amount"
                columns={dashboardOneData.columns}
                rows={dashboardOneData.rows}
                valueType="amount"
              />
            </>
          ) : null}
          {adminSummary && activeAdminDashboard === 2 ? (
            <>
              <View style={styles.adminMetricGrid}>
                {totalCards.map((card) => (
                  <View key={card.label} style={styles.adminMetricCard}>
                    <Text style={styles.adminMetricLabel}>{card.label}</Text>
                    <Text style={styles.adminMetricValue}>{card.value}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.adminMixGrid}>
                {mixCards.map((card) => (
                  <View key={card.label} style={styles.adminMixCard}>
                    <Text style={styles.adminMixValue}>{card.value}</Text>
                    <Text style={styles.adminMixLabel}>{card.label}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Day-wise meals</Text>
                <Text style={styles.sectionCaption}>
                  Breakdown by veg/non-veg, dine-in/takeaway, and source.
                </Text>
              </View>
              {adminSummary.days.length === 0 ? (
                <Text style={styles.menuStateMessage}>
                  No booking items have been saved yet.
                </Text>
              ) : null}
              {adminSummary.days.map((day) => (
                <View
                  key={`${day.dayDate}-${day.dayName}`}
                  style={styles.adminDayCard}
                >
                  <View style={styles.adminDayHeader}>
                    <View>
                      <Text style={styles.dayDate}>
                        {day.dayDate ? displayDayDate(day.dayDate) : "No date"}
                      </Text>
                      <Text style={styles.dayName}>{day.dayName}</Text>
                    </View>
                    <View style={styles.adminDayAmountBlock}>
                      <Text style={styles.adminDayAmount}>
                        {currency(day.amountCollected)}
                      </Text>
                      <Text style={styles.adminDayQuantity}>
                        {day.quantity} coupons
                      </Text>
                    </View>
                  </View>
                  <View style={styles.adminDayStats}>
                    <Text style={styles.adminStatPill}>Veg {day.veg}</Text>
                    <Text style={styles.adminStatPill}>
                      Non-Veg {day.nonVeg}
                    </Text>
                    <Text style={styles.adminStatPill}>
                      Dine-in {day.dineIn}
                    </Text>
                    <Text style={styles.adminStatPill}>
                      Takeaway {day.takeaway}
                    </Text>
                    <Text style={styles.adminStatPill}>
                      Season {day.seasonPass}
                    </Text>
                    <Text style={styles.adminStatPill}>
                      Individual {day.individual}
                    </Text>
                  </View>
                  {day.meals.map((meal) => (
                    <View
                      key={`${meal.mealType}-${meal.foodType}-${meal.serviceType}`}
                      style={styles.adminMealRow}
                    >
                      <View style={styles.adminMealMain}>
                        <Text style={styles.adminMealTitle}>
                          {meal.mealType}
                        </Text>
                        <Text style={styles.adminMealMeta}>
                          {meal.foodType} · {meal.serviceType}
                        </Text>
                      </View>
                      <View style={styles.adminMealNumbers}>
                        <Text style={styles.adminMealQty}>{meal.quantity}</Text>
                        <Text style={styles.adminMealAmount}>
                          {currency(meal.amountCollected)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
        <View style={styles.summaryBar}>
          <View>
            <Text style={styles.summaryLabel}>Coupon bookings only</Text>
            <Text style={styles.summaryTotal}>
              {totals ? currency(totals.amountCollected) : currency(0)}
            </Text>
          </View>
          <Pressable
            disabled={isLoadingAdminSummary}
            onPress={() => void loadAdminSummary()}
            style={({ pressed }) => [
              styles.paymentNext,
              isLoadingAdminSummary && styles.paymentNextDisabled,
              pressed && !isLoadingAdminSummary && styles.pressed,
            ]}
          >
            <Text style={styles.paymentNextText}>
              {isLoadingAdminSummary ? "Refreshing..." : "Refresh"}
            </Text>
            <Text style={styles.continueArrow}>↻</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "manage") {
    const selectedUpgradeCount = selectedUpgradeItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
    const upgradeableCount = managedItems.filter(
      (item) => item.upgradeable
    ).length;

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.bookingHeader}>
          <Pressable onPress={() => setScreen("phone")} hitSlop={12}>
            <Text style={styles.backButton}>‹ Home</Text>
          </Pressable>
          <View>
            <Text style={styles.headerKicker}>MANAGE BOOKINGS</Text>
            <Text style={styles.headerTitle}>
              {towerNumber}/{apartmentNumber}
            </Text>
          </View>
          <HeaderLogo />
        </View>
        <ScrollView
          contentContainerStyle={styles.bookingContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.introBlock}>
            <Text style={styles.introTitle}>
              Switch dine-in meals to takeaway
            </Text>
            <Text style={styles.introBody}>
              For each eligible dine-in meal, choose how many coupons to switch
              to takeaway. Existing takeaway meals and season passes cannot be
              changed here.
            </Text>
          </View>
          {managedBookings.map((booking) => (
            <View key={booking.bookingReference} style={styles.manageCard}>
              <View style={styles.manageCardHeader}>
                <View>
                  <Text style={styles.reviewEyebrow}>BOOKING</Text>
                  <Text style={styles.manageReference}>
                    {booking.bookingReference}
                  </Text>
                </View>
                <View style={styles.manageMetaBlock}>
                  <Text style={styles.manageMeta}>{booking.createdAt}</Text>
                  <Text style={styles.manageMeta}>
                    {booking.paymentMethod} · {currency(booking.payableAmount)}
                  </Text>
                </View>
              </View>
              {booking.items.length === 0 ? (
                <Text style={styles.manageEmptyText}>
                  No itemized rows were found for this booking.
                </Text>
              ) : null}
              {booking.items.map((item) => {
                const selectedQuantity = upgradeQuantities[item.id] ?? 0;
                const selected = selectedQuantity > 0;
                const isDineIn = item.serviceType === "Dine-In";
                const statusText = item.upgradeable
                  ? selected
                    ? `${selectedQuantity} of ${item.quantity} selected · ${currency(
                        item.extraUnitPrice * selectedQuantity
                      )} extra`
                    : `${currency(item.extraUnitPrice)} extra per coupon`
                  : item.serviceType === "Takeaway"
                  ? "Already takeaway"
                  : item.source === "Season Pass"
                  ? "Season pass cannot be modified"
                  : isDineIn
                  ? "No takeaway price difference"
                  : "Not eligible";

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.manageItem,
                      selected && styles.manageItemSelected,
                      !item.upgradeable && styles.manageItemDisabled,
                    ]}
                  >
                    <View style={styles.manageItemMain}>
                      <View style={styles.mealTitleRow}>
                        <Text style={styles.manageItemTitle}>
                          {item.dayName} · {item.mealType}
                        </Text>
                        {item.foodType ? (
                          <Text style={styles.foodTypeBadge}>
                            {item.foodType}
                          </Text>
                        ) : null}
                        {item.serviceType ? (
                          <Text style={styles.serviceTypeBadge}>
                            {item.serviceType}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.manageItemDetail}>
                        Qty {item.quantity} · Current {currency(item.unitPrice)}{" "}
                        each
                        {item.upgradeable
                          ? ` · Takeaway ${currency(
                              item.takeawayUnitPrice
                            )} each`
                          : ""}
                      </Text>
                      <Text style={styles.manageItemStatus}>{statusText}</Text>
                    </View>
                    {item.upgradeable ? (
                      <View style={styles.manageUpgradeControl}>
                        <Text style={styles.manageUpgradeLabel}>
                          Change to takeaway
                        </Text>
                        <QuantityControl
                          quantity={selectedQuantity}
                          onChange={(next) =>
                            changeUpgradeQuantity(item.id, next, item.quantity)
                          }
                          disabled={false}
                          maxQuantity={item.quantity}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
          {upgradeableCount === 0 ? (
            <Text style={styles.menuStateMessage}>
              No dine-in individual meals are currently eligible for takeaway
              upgrade.
            </Text>
          ) : null}
        </ScrollView>
        <View style={styles.summaryBar}>
          <View>
            <Text style={styles.summaryLabel}>
              {selectedUpgradeCount > 0
                ? `${selectedUpgradeCount} ${
                    selectedUpgradeCount === 1 ? "coupon" : "coupons"
                  } selected`
                : "No upgrades selected"}
            </Text>
            <Text style={styles.summaryTotal}>{currency(upgradeTotal)}</Text>
          </View>
          <Pressable
            disabled={upgradeTotal <= 0}
            onPress={() => {
              upgradeRequestIdRef.current = createClientRequestId("upgrade");
              setPaymentPurpose("upgrade");
              setBookingSubmissionError("");
              setCashAmount("");
              setChequeNumber("");
              setUpiTransactionId("");
              setUpiPaymentReported(false);
              setScreen("payment");
            }}
            style={({ pressed }) => [
              styles.paymentNext,
              upgradeTotal <= 0 && styles.paymentNextDisabled,
              pressed && upgradeTotal > 0 && styles.pressed,
            ]}
          >
            <Text style={styles.paymentNextText}>Pay upgrade</Text>
            <Text style={styles.continueArrow}>→</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "payment") {
    const paymentBackScreen: Screen =
      paymentPurpose === "upgrade" ? "manage" : "booking";

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.bookingHeader}>
          <Pressable onPress={() => setScreen(paymentBackScreen)} hitSlop={12}>
            <Text style={styles.backButton}>
              {paymentPurpose === "upgrade" ? "‹ Manage" : "‹ Coupons"}
            </Text>
          </Pressable>
          <View>
            <Text style={styles.headerKicker}>
              {paymentPurpose === "upgrade"
                ? "TAKEAWAY UPGRADE"
                : "STEP 3 OF 3"}
            </Text>
            <Text style={styles.headerTitle}>Complete payment</Text>
          </View>
          <HeaderLogo />
        </View>
        <ScrollView
          contentContainerStyle={styles.paymentContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.paymentTitle}>
            {paymentPurpose === "upgrade"
              ? "Pay the extra amount"
              : "One last thing"}
          </Text>
          <Text style={styles.paymentLead}>
            {paymentPurpose === "upgrade"
              ? "Review the dine-in meals being switched to takeaway, then collect only the price difference."
              : "Review your booking and choose how you would like to pay."}
          </Text>
          {bookingSubmissionError ? (
            <Text style={styles.submissionError}>{bookingSubmissionError}</Text>
          ) : null}
          <View style={styles.reviewCard}>
            <Text style={styles.reviewEyebrow}>
              {paymentPurpose === "upgrade"
                ? "TAKEAWAY UPGRADES"
                : "YOUR COUPONS"}
            </Text>
            {paymentItems.map((item) => (
              <View key={item.id} style={styles.reviewRow}>
                <Text style={styles.reviewItem}>
                  {item.label} × {item.quantity}
                </Text>
                <Text style={styles.reviewPrice}>
                  {currency(item.subtotal)}
                </Text>
              </View>
            ))}
            <View style={styles.reviewTotalRow}>
              <Text style={styles.reviewTotalLabel}>
                {paymentPurpose === "upgrade"
                  ? "Extra payable"
                  : "Total payable"}
              </Text>
              <Text style={styles.reviewTotal}>{currency(paymentTotal)}</Text>
            </View>
          </View>
          <Text style={styles.paymentSectionLabel}>PAYMENT METHOD</Text>
          <Pressable
            disabled={isSubmitting}
            onPress={() => {
              setBookingSubmissionError("");
              setCashAmount("");
              setScreen("cash");
            }}
            style={({ pressed }) => [
              styles.paymentOption,
              isSubmitting && styles.paymentOptionDisabled,
              pressed && !isSubmitting && styles.pressed,
            ]}
          >
            <View style={styles.paymentIcon}>
              <Text style={styles.paymentIconText}>₹</Text>
            </View>
            <View style={styles.paymentOptionText}>
              <Text style={styles.paymentOptionTitle}>Cash</Text>
              <Text style={styles.paymentOptionHint}>
                Pay at the Pujo committee counter.
              </Text>
            </View>
            <Text style={styles.optionArrow}>›</Text>
          </Pressable>
          <Pressable
            disabled={isSubmitting}
            onPress={() => {
              setBookingSubmissionError("");
              setScreen("cheque");
            }}
            style={({ pressed }) => [
              styles.paymentOption,
              isSubmitting && styles.paymentOptionDisabled,
              pressed && !isSubmitting && styles.pressed,
            ]}
          >
            <View style={styles.paymentIcon}>
              <Text style={styles.paymentIconText}>⌁</Text>
            </View>
            <View style={styles.paymentOptionText}>
              <Text style={styles.paymentOptionTitle}>Cheque</Text>
              <Text style={styles.paymentOptionHint}>
                Enter your cheque number next.
              </Text>
            </View>
            <Text style={styles.optionArrow}>›</Text>
          </Pressable>
          <Pressable
            disabled={isSubmitting}
            onPress={() => {
              setBookingSubmissionError("");
              setUpiPaymentReported(false);
              setUpiTransactionId("");
              setScreen("upi");
            }}
            style={({ pressed }) => [
              styles.paymentOption,
              isSubmitting && styles.paymentOptionDisabled,
              pressed && !isSubmitting && styles.pressed,
            ]}
          >
            <View style={styles.paymentIcon}>
              <Text style={styles.paymentIconText}>QR</Text>
            </View>
            <View style={styles.paymentOptionText}>
              <Text style={styles.paymentOptionTitle}>UPI</Text>
              <Text style={styles.paymentOptionHint}>
                Scan a QR code for the exact amount.
              </Text>
            </View>
            <Text style={styles.optionArrow}>›</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "cash") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.bookingHeader}>
          <Pressable onPress={() => setScreen("payment")} hitSlop={12}>
            <Text style={styles.backButton}>‹ Payment</Text>
          </Pressable>
          <View>
            <Text style={styles.headerKicker}>CASH PAYMENT</Text>
            <Text style={styles.headerTitle}>Cash received</Text>
          </View>
          <HeaderLogo />
        </View>
        <View style={styles.singlePageContent}>
          <Text style={styles.paymentTitle}>{currency(paymentTotal)}</Text>
          <Text style={styles.paymentLead}>
            Enter the cash received from the resident.
          </Text>
          {bookingSubmissionError ? (
            <Text style={styles.submissionError}>{bookingSubmissionError}</Text>
          ) : null}
          <View style={styles.entryCard}>
            <Text style={styles.entryLabel}>CASH RECEIVED</Text>
            <TextInput
              value={cashAmount}
              onChangeText={setCashAmount}
              keyboardType="decimal-pad"
              placeholder="Enter amount"
              placeholderTextColor="#B68473"
              onFocus={() => setCashInputFocused(true)}
              onBlur={() => setCashInputFocused(false)}
              style={[
                styles.entryInput,
                inputWebStyle,
                cashInputFocused && inputFocusStyle,
              ]}
            />
          </View>
          {cashShortfall > 0 ? (
            <View style={cashStyles.shortfallNotice}>
              <Text style={cashStyles.shortfallText}>
                Collect {currency(cashShortfall)} more to complete this payment.
              </Text>
            </View>
          ) : null}
          {isCashAmountValid && cashChange > 0 ? (
            <View style={cashStyles.changeNotice}>
              <Text style={cashStyles.changeText}>
                Collect {currency(cashChange)} in change.
              </Text>
            </View>
          ) : null}
          <Pressable
            disabled={!isCashAmountValid || isSubmitting}
            onPress={() => void completePayment("cash")}
            style={({ pressed }) => [
              styles.widePrimaryButton,
              (!isCashAmountValid || isSubmitting) &&
                styles.widePrimaryButtonDisabled,
              pressed && isCashAmountValid && !isSubmitting && styles.pressed,
            ]}
          >
            <Text style={styles.widePrimaryText}>
              {isSubmitting
                ? paymentPurpose === "upgrade"
                  ? "Saving upgrade..."
                  : "Saving booking..."
                : "Confirm cash payment"}
            </Text>
            <Text style={styles.buttonArrow}>→</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "cheque") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.bookingHeader}>
          <Pressable onPress={() => setScreen("payment")} hitSlop={12}>
            <Text style={styles.backButton}>‹ Payment</Text>
          </Pressable>
          <View>
            <Text style={styles.headerKicker}>CHEQUE PAYMENT</Text>
            <Text style={styles.headerTitle}>Cheque details</Text>
          </View>
          <HeaderLogo />
        </View>
        <View style={styles.singlePageContent}>
          <Text style={styles.paymentTitle}>{currency(paymentTotal)}</Text>
          <Text style={styles.paymentLead}>
            Enter the cheque number before handing it to the Pujo committee.
          </Text>
          {bookingSubmissionError ? (
            <Text style={styles.submissionError}>{bookingSubmissionError}</Text>
          ) : null}
          <View style={styles.entryCard}>
            <Text style={styles.entryLabel}>CHEQUE NUMBER</Text>
            <TextInput
              value={chequeNumber}
              onChangeText={setChequeNumber}
              autoCapitalize="characters"
              placeholder="Enter cheque number"
              placeholderTextColor="#B68473"
              style={styles.entryInput}
            />
          </View>
          <Pressable
            disabled={!chequeNumber.trim() || isSubmitting}
            onPress={() => void completePayment("cheque")}
            style={({ pressed }) => [
              styles.widePrimaryButton,
              (!chequeNumber.trim() || isSubmitting) &&
                styles.widePrimaryButtonDisabled,
              pressed && chequeNumber.trim() && !isSubmitting && styles.pressed,
            ]}
          >
            <Text style={styles.widePrimaryText}>
              {isSubmitting
                ? paymentPurpose === "upgrade"
                  ? "Saving upgrade..."
                  : "Saving booking..."
                : "Confirm cheque payment"}
            </Text>
            <Text style={styles.buttonArrow}>→</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "upi") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.bookingHeader}>
          <Pressable onPress={() => setScreen("payment")} hitSlop={12}>
            <Text style={styles.backButton}>‹ Payment</Text>
          </Pressable>
          <View>
            <Text style={styles.headerKicker}>UPI PAYMENT</Text>
            <Text style={styles.headerTitle}>Scan to pay</Text>
          </View>
          <HeaderLogo />
        </View>
        <ScrollView
          contentContainerStyle={styles.singlePageContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.paymentTitle}>{currency(paymentTotal)}</Text>
          <Text style={styles.paymentLead}>
            Scan this QR code with any UPI app. The payment amount is already
            filled in.
          </Text>
          {bookingSubmissionError ? (
            <Text style={styles.submissionError}>{bookingSubmissionError}</Text>
          ) : null}
          <View style={styles.qrCard}>
            <QRCode
              value={upiPaymentUri}
              size={218}
              color="#4A1815"
              backgroundColor="#FFFDF8"
            />
            <Text style={styles.qrRecipient}>Paying to</Text>
            <Text style={styles.qrUpiId}>{UPI_ID}</Text>
          </View>
          {!upiPaymentReported ? (
            <Pressable
              onPress={() => setUpiPaymentReported(true)}
              style={({ pressed }) => [
                styles.widePrimaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.widePrimaryText}>I've paid</Text>
              <Text style={styles.buttonArrow}>→</Text>
            </Pressable>
          ) : (
            <View style={styles.entryCard}>
              <Text style={styles.entryLabel}>UPI TRANSACTION ID</Text>
              <TextInput
                value={upiTransactionId}
                onChangeText={setUpiTransactionId}
                autoCapitalize="characters"
                placeholder="Enter transaction ID"
                placeholderTextColor="#B68473"
                style={styles.entryInput}
              />
              <Pressable
                disabled={!upiTransactionId.trim() || isSubmitting}
                onPress={() => void completePayment("upi")}
                style={({ pressed }) => [
                  styles.widePrimaryButton,
                  styles.inlineButton,
                  (!upiTransactionId.trim() || isSubmitting) &&
                    styles.widePrimaryButtonDisabled,
                  pressed &&
                    upiTransactionId.trim() &&
                    !isSubmitting &&
                    styles.pressed,
                ]}
              >
                <Text style={styles.widePrimaryText}>
                  {isSubmitting
                    ? paymentPurpose === "upgrade"
                      ? "Saving upgrade..."
                      : "Saving booking..."
                    : "Confirm payment details"}
                </Text>
                <Text style={styles.buttonArrow}>→</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "success") {
    const paymentDetail =
      paymentMethod === "cash"
        ? "Cash payment received."
        : paymentMethod === "cheque"
        ? `Cheque no. ${chequeNumber}`
        : `UPI transaction ID: ${upiTransactionId}`;
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={[styles.successScreen, successLayoutStyles.screen]}>
          <View style={styles.successSun} />
          <View style={styles.successLogoBadge}>
            <Image
              accessibilityLabel="Udita Utsav Committee"
              resizeMode="contain"
              source={require("./assets/udita-logo-transparent.png")}
              style={styles.successLogo}
            />
          </View>
          <View style={successLayoutStyles.stack}>
            <View style={[styles.successContent, successLayoutStyles.content]}>
              <Text style={styles.successKicker}>UUC PUJO 2026</Text>
              <View style={styles.successMark}>
                <Text style={styles.successMarkText}>✓</Text>
              </View>
              <Text style={styles.successTitle}>Thank you!</Text>
              <Text style={styles.successBody}>
                {paymentPurpose === "upgrade"
                  ? "Your takeaway upgrade is confirmed."
                  : "Your food coupon booking is confirmed."}
              </Text>
              <View style={styles.successReference}>
                <Text style={styles.successReferenceLabel}>
                  {paymentPurpose === "upgrade"
                    ? "UPDATED BOOKING"
                    : "BOOKING REFERENCE"}
                </Text>
                <Text style={styles.successReferenceValue}>
                  {paymentPurpose === "upgrade"
                    ? upgradeReference
                    : bookingReference}
                </Text>
              </View>
              <Text style={styles.successPaymentDetail}>{paymentDetail}</Text>
              <Text style={styles.successAmount}>{currency(paymentTotal)}</Text>
            </View>
            <Pressable
              onPress={startNewBooking}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                Start another booking
              </Text>
              <Text style={styles.buttonArrow}>→</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.bookingHeader}>
        <Pressable onPress={() => setScreen("phone")} hitSlop={12}>
          <Text style={styles.backButton}>‹ Back</Text>
        </Pressable>
        <View>
          <Text style={styles.headerKicker}>STEP 2 OF 3</Text>
          <Text style={styles.headerTitle}>Choose your feast</Text>
        </View>
        <HeaderLogo />
      </View>
      <ScrollView
        contentContainerStyle={styles.bookingContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introBlock}>
          <Text style={styles.introTitle}>Book for the whole family</Text>
          <Text
            style={styles.introBody}
          >{hasSeasonPass
              ? `Book season passes, individual meals, or both. Each selection can include up to ${MAX_QUANTITY} people.`
              : `Book individual meals for up to ${MAX_QUANTITY} people per selection.`
            }</Text>
        </View>
        {hasSeasonPass ? (
          <View style={styles.seasonCard}>
            <Text style={styles.seasonTitle}>Season pass</Text>
            <Text style={styles.seasonSubtitle}>{seasonPassSubtitle}</Text>
            <Text style={styles.seasonPrice}>
              {currency(currentSeasonPassPrice)} per person
            </Text>
            <QuantityControl
              quantity={seasonPasses}
              onChange={changeSeasonPasses}
              disabled={false}
            />
          </View>
        ) : null}
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Individual meals</Text>
          <Text style={styles.sectionCaption}>
            Tap “View menu” to see what is being served.
          </Text>
        </View>
        {isMenuLoading ? (
          <Text style={styles.menuStateMessage}>Loading food menu...</Text>
        ) : null}
        {menuError ? (
          <Text style={styles.submissionError}>{menuError}</Text>
        ) : null}
        {!isMenuLoading && !menuError && days.length === 0 ? (
          <Text style={styles.menuStateMessage}>
            No food menu is available yet.
          </Text>
        ) : null}
        {days.map((day) => (
          <View key={`${day.date}-${day.name}`} style={styles.dayCard}>
            <View style={styles.dayHeading}>
              <Text style={styles.dayDate}>{displayDayDate(day.date)}</Text>
              <Text style={styles.dayName}>{day.name}</Text>
            </View>
            {day.meals.map((meal) => {
              const quantity = getMealQuantities(meal.id);
              const expanded = expandedMenu === meal.id;
              const takeawayExtra = meal.takeawayPrice - meal.dineInPrice;
              const takeawayPriceHint =
                takeawayExtra > 0
                  ? `${currency(takeawayExtra)} extra`
                  : takeawayExtra < 0
                  ? `${currency(Math.abs(takeawayExtra))} less`
                  : "no extra";
              return (
                <View key={meal.id} style={styles.mealRow}>
                  <View style={styles.mealDetails}>
                    <View style={styles.mealTitleRow}>
                      <Text style={styles.mealLabel}>{meal.mealTime}</Text>
                      <Text style={styles.foodTypeBadge}>{meal.foodType}</Text>
                    </View>
                    <Pressable
                      onPress={() => setExpandedMenu(expanded ? null : meal.id)}
                      hitSlop={8}
                    >
                      <Text style={styles.menuToggle}>
                        {expanded ? "Hide menu" : "View menu"}
                      </Text>
                    </Pressable>
                    {expanded && (
                      <Text style={styles.menuText}>{meal.menu}</Text>
                    )}
                  </View>
                  <View style={styles.serviceChoices}>
                    <View style={styles.serviceChoice}>
                      <View>
                        <Text style={styles.serviceLabel}>Dine-in</Text>
                        <Text style={styles.servicePrice}>
                          {currency(meal.dineInPrice)}
                        </Text>
                      </View>
                      <QuantityControl
                        quantity={quantity.dineIn}
                        onChange={(next) => changeMealQuantity(meal.id, next)}
                        disabled={false}
                      />
                    </View>
                    <View style={styles.serviceChoice}>
                      <View>
                        <Text style={styles.serviceLabel}>Takeaway</Text>
                        <Text style={styles.servicePrice}>
                          {currency(meal.takeawayPrice)} ({takeawayPriceHint})
                        </Text>
                      </View>
                      <QuantityControl
                        quantity={quantity.takeaway}
                        onChange={(next) =>
                          changeTakeawayQuantity(meal.id, next)
                        }
                        disabled={false}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View style={styles.summaryBar}>
        <View>
          <Text style={styles.summaryLabel}>{selectionSummary}</Text>
          <Text style={styles.summaryTotal}>{currency(total)}</Text>
        </View>
        <Pressable
          disabled={
            (activeSeasonPasses === 0 && granularCount === 0) ||
            isMenuLoading ||
            !!menuError
          }
          onPress={() => {
            setPaymentPurpose("booking");
            setScreen("payment");
          }}
          style={({ pressed }) => [
            styles.paymentNext,
            ((activeSeasonPasses === 0 && granularCount === 0) ||
              isMenuLoading ||
              !!menuError) &&
              styles.paymentNextDisabled,
            pressed &&
              (activeSeasonPasses > 0 || granularCount > 0) &&
              !isMenuLoading &&
              !menuError &&
              styles.pressed,
          ]}
        >
          <Text style={styles.paymentNextText}>Review & pay</Text>
          <Text style={styles.continueArrow}>→</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const displayFont = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia",
});
const inputWebStyle = Platform.select({
  web: { outlineStyle: "solid" as const, outlineWidth: 0 },
  default: {},
});
const pickerWebStyle = Platform.select({
  web: {
    appearance: "none" as const,
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderWidth: 0,
    outlineStyle: "solid" as const,
    outlineWidth: 0,
    paddingHorizontal: 0,
  },
  default: {},
});
const inputFocusStyle = { borderBottomColor: "#A36A15", borderBottomWidth: 2 };
const locationStyles = StyleSheet.create({
  inputs: { flexDirection: "row", gap: 12 },
  towerField: { flex: 0.7 },
  locationInputShell: {
    borderBottomColor: "#D5A53D",
    borderBottomWidth: 1,
    height: 49,
    justifyContent: "center",
    marginTop: 8,
  },
  locationTextInput: { borderBottomWidth: 0, height: 48, marginTop: 0 },
  towerPicker: {
    color: "#4B1815",
    fontFamily: displayFont,
    fontSize: 25,
    height: 48,
    width: "100%",
  },
  towerPickerChevron: {
    color: "#7C1D19",
    fontSize: 22,
    lineHeight: 22,
    position: "absolute",
    right: 2,
    top: 12,
  },
  towerPickerItem: { color: "#4B1815", fontFamily: displayFont, fontSize: 25 },
  apartmentField: { flex: 1.3 },
  whatsAppField: { marginTop: 14 },
  phoneNumberRow: { alignItems: "center", flexDirection: "row" },
  countryCode: {
    color: "#4B1815",
    fontFamily: displayFont,
    fontSize: 25,
    marginRight: 8,
  },
  phoneNumberInput: { flex: 1 },
  validationText: {
    color: "#942F27",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
});
const donationStyles = StyleSheet.create({
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  addButton: {
    backgroundColor: "#7C1D19",
    borderRadius: 5,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  addButtonText: { color: "#FFF8EC", fontSize: 12, fontWeight: "800" },
  declineButton: {
    borderColor: "#B68473",
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  declineButtonText: { color: "#79584B", fontSize: 12, fontWeight: "800" },
  selectedDonation: {
    backgroundColor: "#FFF9ED",
    borderColor: "#E4C27D",
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 12,
    padding: 11,
  },
  donationTitle: { color: "#7C1D19", fontSize: 13, fontWeight: "900" },
  donationBody: {
    color: "#79584B",
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
    marginTop: 3,
  },
  declinedText: {
    color: "#942F27",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 12,
  },
});
const cashStyles = StyleSheet.create({
  changeNotice: {
    backgroundColor: "#EEF7E8",
    borderColor: "#7CAA67",
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 14,
    padding: 11,
  },
  changeText: { color: "#356329", fontSize: 13, fontWeight: "800" },
  shortfallNotice: {
    backgroundColor: "#FFF0EE",
    borderColor: "#D87869",
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 14,
    padding: 11,
  },
  shortfallText: { color: "#942F27", fontSize: 13, fontWeight: "800" },
});
const successLayoutStyles = StyleSheet.create({
  screen: { alignItems: "center", justifyContent: "center" },
  stack: { maxWidth: 620, width: "100%" },
  content: { marginTop: 0 },
});

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFF8EC" },
  welcomeScreen: {
    alignItems: "center",
    backgroundColor: "#7C1D19",
    flexGrow: 1,
    justifyContent: "center",
    minHeight: "100%",
    overflow: "hidden",
    padding: 24,
    paddingBottom: 104,
  },
  sun: {
    position: "absolute",
    width: 430,
    height: 430,
    borderRadius: 215,
    backgroundColor: "#EAA221",
    top: -205,
    right: -115,
    opacity: 0.98,
  },
  welcomeStack: { maxWidth: 700, width: "100%" },
  welcomeContent: { maxWidth: 700 },
  homeLogoBadge: {
    alignItems: "center",
    height: 150,
    justifyContent: "center",
    overflow: "hidden",
    position: "absolute",
    right: 32,
    top: 28,
    width: 254,
    zIndex: 2,
  },
  homeLogo: {
    height: 146,
    width: 248,
  },
  phoneHomeLogoBadge: {
    right: 20,
    top: 32,
  },
  phoneHomeLogo: {
    height: 132,
    width: 224,
  },
  kicker: {
    color: "#F7DFA7",
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: "800",
    marginBottom: 18,
  },
  avigeaFont: {
    fontFamily: "Avigea",
  },
  baloodaFont: {
    fontFamily: "Balooda2Medium",
  },
  baloodaExtraBoldFont: {
    fontFamily: "Balooda2ExtraBold",
  },
  homeHero: {
    alignSelf: "flex-start",
    paddingRight: 96,
    position: "relative",
  },
  phoneWelcomeScreen: {
    paddingHorizontal: 34,
    justifyContent: "flex-start",
    paddingTop: 250,
  },
  phoneWelcomeStack: {
    marginTop: 0,
  },
  phoneHomeHero: {
    paddingRight: 104,
  },
  homeHeroTitle: {
    color: "#FFF7E9",
    fontFamily: displayFont,
    fontSize: 68,
    letterSpacing: 2.2,
    lineHeight: 61,
    position: "relative",
    zIndex: 1,
  },
  phoneHomeHeroTitle: {
    fontSize: 58,
    lineHeight: 52,
  },
  homeYearSeal: {
    alignItems: "center",
    backgroundColor: "#EA2D22",
    borderRadius: 75,
    height: 150,
    justifyContent: "center",
    position: "absolute",
    right: 72,
    top: -42,
    width: 150,
    zIndex: 0,
  },
  phoneHomeYearSeal: {
    borderRadius: 67,
    height: 134,
    right: 68,
    top: -34,
    width: 134,
  },
  homeYearText: {
    color: "#FFE048",
    fontFamily: displayFont,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  phoneHomeYearText: {
    fontSize: 28,
    lineHeight: 29,
  },
  homeSubhero: {
    color: "#F7DFA7",
    fontFamily: displayFont,
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 38,
    marginTop: 13,
  },
  phoneHomeSubhero: {
    fontSize: 28,
    lineHeight: 34,
    marginTop: 16,
  },
  welcomeTitle: {
    color: "#FFF7E9",
    fontFamily: displayFont,
    fontSize: 51,
    lineHeight: 56,
  },
  welcomeTitleAccent: {
    color: "#F7DFA7",
    fontFamily: displayFont,
    fontSize: 51,
    lineHeight: 56,
    fontStyle: "italic",
  },
  welcomeBody: {
    color: "#F9E8C8",
    fontSize: 18,
    lineHeight: 27,
    marginTop: 26,
    maxWidth: 470,
  },
  phoneCard: {
    backgroundColor: "#FFF3DE",
    borderColor: "#EAA221",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 24,
    maxWidth: 480,
    padding: 16,
  },
  phoneCardLabel: {
    color: "#7C1D19",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  phoneInput: {
    borderBottomColor: "#D5A53D",
    borderBottomWidth: 1,
    color: "#4B1815",
    fontFamily: displayFont,
    fontSize: 25,
    marginTop: 8,
    paddingBottom: 9,
    paddingTop: 4,
  },
  phoneHint: { color: "#79584B", fontSize: 12, lineHeight: 18, marginTop: 10 },
  notFoundMessage: {
    backgroundColor: "#FFF5F3",
    borderColor: "#D87869",
    borderRadius: 5,
    borderWidth: 1,
    marginTop: 13,
    padding: 10,
  },
  notFoundTitle: { color: "#942F27", fontSize: 13, fontWeight: "900" },
  notFoundText: {
    color: "#775651",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  welcomeRule: {
    width: 50,
    height: 3,
    backgroundColor: "#EAA221",
    marginTop: 23,
    marginBottom: 15,
  },
  welcomeNote: {
    color: "#F7DFA7",
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 400,
  },
  welcomeActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 28,
    width: "100%",
  },
  phoneWelcomeActions: {
    gap: 12,
  },
  stackedWelcomeActions: {
    alignItems: "stretch",
    flexDirection: "column",
  },
  creatorFooter: {
    alignItems: "center",
    bottom: 20,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 3,
  },
  creatorFooterRow: {
    alignItems: "center",
    backgroundColor: "rgba(84, 23, 21, 0.22)",
    borderColor: "rgba(244, 192, 91, 0.35)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  creatorFooterText: { color: "#F7DFA7", fontSize: 12, fontWeight: "800" },
  creatorName: {
    color: "#FFF7E9",
    fontSize: 12,
    fontWeight: "900",
    textDecorationLine: "underline",
  },
  creatorContactBubble: {
    alignItems: "center",
    backgroundColor: "#FFF8EC",
    borderColor: "#F4C05B",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    minWidth: 220,
    paddingHorizontal: 13,
    paddingVertical: 10,
    shadowColor: "#2A0908",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  creatorContactTitle: {
    color: "#A36A15",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 4,
    textAlign: "center",
    textTransform: "uppercase",
  },
  creatorContactText: {
    color: "#5D211A",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    textAlign: "center",
  },
  primaryButton: {
    alignSelf: "flex-start",
    alignItems: "center",
    flexDirection: "row",
    gap: 18,
    backgroundColor: "#F4C05B",
    borderRadius: 4,
    minHeight: 72,
    paddingHorizontal: 22,
    paddingVertical: 0,
    marginBottom: 18,
    marginTop: 28,
  },
  actionButton: { marginBottom: 0, marginTop: 0 },
  primaryActionButton: { alignSelf: "stretch", flex: 1.35, justifyContent: "center" },
  stackedActionButton: {
    flex: undefined,
    width: "100%",
  },
  primaryButtonDisabled: { backgroundColor: "#CBAF72" },
  primaryButtonText: { color: "#541715", fontSize: 16, fontWeight: "800" },
  secondaryActionButton: {
    alignItems: "center",
    borderColor: "#F4C05B",
    borderRadius: 4,
    borderWidth: 1,
    flex: 1,
    minHeight: 72,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 0,
  },
  secondaryActionButtonDisabled: { borderColor: "#B98D73", opacity: 0.55 },
  secondaryActionButtonText: {
    color: "#FFF7E9",
    fontSize: 16,
    fontWeight: "800",
  },
  buttonArrow: { color: "#541715", fontSize: 23, lineHeight: 21 },
  pressed: { opacity: 0.76 },
  bookingHeader: {
    alignItems: "center",
    backgroundColor: "#FFF8EC",
    borderBottomColor: "#EEDDC5",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    color: "#7C1D19",
    fontSize: 15,
    fontWeight: "700",
    minWidth: 62,
  },
  headerKicker: {
    color: "#A36A15",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    textAlign: "center",
  },
  headerTitle: {
    color: "#5D211A",
    fontFamily: displayFont,
    fontSize: 25,
    marginTop: 2,
    textAlign: "center",
  },
  headerLogo: {
    height: 40,
    width: 62,
  },
  bookingContent: {
    alignSelf: "center",
    maxWidth: 900,
    padding: 20,
    paddingBottom: 128,
    width: "100%",
  },
  introBlock: { marginBottom: 20 },
  introTitle: { color: "#5D211A", fontFamily: displayFont, fontSize: 29 },
  introBody: {
    color: "#6F5A4D",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 7,
    maxWidth: 580,
  },
  seasonCard: {
    backgroundColor: "#7C1D19",
    borderColor: "#7C1D19",
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
  },
  lockedCard: { backgroundColor: "#A65748", borderColor: "#A65748" },
  seasonBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#F4C05B",
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  seasonBadgeText: {
    color: "#571814",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  seasonTitle: {
    color: "#FFF8EC",
    fontFamily: displayFont,
    fontSize: 28,
    marginTop: 14,
  },
  seasonSubtitle: { color: "#F9E5BD", fontSize: 14, marginTop: 3 },
  seasonPrice: {
    color: "#F4C05B",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 17,
  },
  lockedMessage: {
    color: "#FFF5D8",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 16,
  },
  pendingMessage: {
    color: "#F9E5BD",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  sectionHeading: { marginBottom: 12, marginTop: 30 },
  sectionTitle: { color: "#5D211A", fontFamily: displayFont, fontSize: 25 },
  sectionCaption: { color: "#806B5A", fontSize: 13, marginTop: 4 },
  lockBanner: {
    backgroundColor: "#F8E2B9",
    borderColor: "#E6BC68",
    borderRadius: 7,
    borderWidth: 1,
    marginBottom: 12,
    padding: 11,
  },
  lockBannerText: { color: "#70441A", fontSize: 13, fontWeight: "700" },
  dayCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#EBDCC7",
    borderRadius: 11,
    borderWidth: 1,
    marginBottom: 14,
    overflow: "hidden",
  },
  dayHeading: {
    alignItems: "baseline",
    backgroundColor: "#FFF3DF",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  dayDate: {
    color: "#A36A15",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  dayName: { color: "#5D211A", fontFamily: displayFont, fontSize: 21 },
  mealRow: {
    borderTopColor: "#F0E6D7",
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "space-between",
    padding: 15,
  },
  previewMeal: { backgroundColor: "#FCFAF5" },
  mealDetails: { flex: 1, minWidth: 220 },
  mealTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mealLabel: { color: "#3F2A24", fontSize: 16, fontWeight: "800" },
  foodTypeBadge: {
    backgroundColor: "#FFF3DF",
    borderColor: "#E2C89B",
    borderRadius: 4,
    borderWidth: 1,
    color: "#70441A",
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  serviceTypeBadge: {
    backgroundColor: "#F8E2B9",
    borderColor: "#E0C183",
    borderRadius: 4,
    borderWidth: 1,
    color: "#7C1D19",
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  mealPrice: { color: "#8B391B", fontSize: 14, fontWeight: "800" },
  serviceChoices: { gap: 8, minWidth: 310 },
  serviceChoice: {
    alignItems: "center",
    backgroundColor: "#FFFDF8",
    borderColor: "#EAD6B6",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  serviceLabel: { color: "#3F2A24", fontSize: 13, fontWeight: "900" },
  servicePrice: {
    color: "#806B5A",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  previewLabel: { color: "#856E5C", fontSize: 12, fontStyle: "italic" },
  takeawayToggle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    marginLeft: 2,
    paddingVertical: 2,
  },
  takeawayBox: {
    alignItems: "center",
    borderColor: "#C89C56",
    borderRadius: 3,
    borderWidth: 1.5,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  takeawayBoxSelected: { backgroundColor: "#7C1D19", borderColor: "#7C1D19" },
  takeawayCheck: {
    color: "#FFF8EC",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 12,
  },
  takeawayText: { color: "#7A6554", fontSize: 12, fontWeight: "800" },
  takeawayTextSelected: { color: "#7C1D19" },
  menuStateMessage: {
    backgroundColor: "#FFFDF8",
    borderColor: "#EBDCC7",
    borderRadius: 8,
    borderWidth: 1,
    color: "#6F5A4D",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 14,
    padding: 14,
  },
  menuToggle: {
    color: "#A36A15",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 7,
    textDecorationLine: "underline",
  },
  menuText: { color: "#6C5C51", fontSize: 13, lineHeight: 19, marginTop: 8 },
  quantityControl: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#FFF6E7",
    borderColor: "#E5CDA6",
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  quantityControlDisabled: {
    backgroundColor: "#F4F0E8",
    borderColor: "#E4DDD2",
  },
  quantityButton: {
    alignItems: "center",
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  inactiveButton: { opacity: 0.3 },
  quantitySymbol: { color: "#7C1D19", fontSize: 22, fontWeight: "700" },
  quantityText: {
    color: "#40241D",
    fontSize: 15,
    fontWeight: "800",
    minWidth: 27,
    textAlign: "center",
  },
  manageCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#EBDCC7",
    borderRadius: 11,
    borderWidth: 1,
    marginBottom: 14,
    overflow: "hidden",
  },
  manageCardHeader: {
    alignItems: "flex-start",
    backgroundColor: "#FFF3DF",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
    padding: 15,
  },
  manageReference: { color: "#5D211A", fontFamily: displayFont, fontSize: 21 },
  manageMetaBlock: { alignItems: "flex-end" },
  manageMeta: {
    color: "#806B5A",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  manageEmptyText: {
    color: "#806B5A",
    fontSize: 13,
    lineHeight: 19,
    padding: 15,
  },
  manageItem: {
    alignItems: "center",
    borderTopColor: "#F0E6D7",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    padding: 15,
  },
  manageItemSelected: { backgroundColor: "#FFF7E6" },
  manageItemDisabled: { opacity: 0.72 },
  manageItemMain: { flex: 1 },
  manageItemTitle: { color: "#3F2A24", fontSize: 16, fontWeight: "900" },
  manageItemDetail: {
    color: "#6F5A4D",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  manageItemStatus: {
    color: "#A36A15",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 6,
  },
  manageUpgradeControl: {
    alignItems: "center",
    gap: 7,
  },
  manageUpgradeLabel: {
    color: "#6F5A4D",
    fontSize: 11,
    fontWeight: "800",
  },
  adminTimestamp: {
    color: "#A36A15",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 10,
  },
  adminMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 14,
  },
  adminMetricCard: {
    backgroundColor: "#7C1D19",
    borderRadius: 11,
    flex: 1,
    minWidth: 180,
    padding: 16,
  },
  adminMetricLabel: {
    color: "#F7DFA7",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  adminMetricValue: {
    color: "#FFF8EC",
    fontFamily: displayFont,
    fontSize: 28,
    marginTop: 8,
  },
  adminMixGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  adminMixCard: {
    backgroundColor: "#FFFDF8",
    borderColor: "#EBDCC7",
    borderRadius: 9,
    borderWidth: 1,
    minWidth: 120,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  adminMixValue: { color: "#5D211A", fontSize: 18, fontWeight: "900" },
  adminMixLabel: {
    color: "#806B5A",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3,
  },
  adminDayCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#EBDCC7",
    borderRadius: 11,
    borderWidth: 1,
    marginBottom: 14,
    overflow: "hidden",
  },
  adminDayHeader: {
    alignItems: "flex-start",
    backgroundColor: "#FFF3DF",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
    padding: 15,
  },
  adminDayAmountBlock: { alignItems: "flex-end" },
  adminDayAmount: { color: "#7C1D19", fontFamily: displayFont, fontSize: 22 },
  adminDayQuantity: {
    color: "#806B5A",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  adminDayStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 15,
    paddingBottom: 8,
  },
  adminStatPill: {
    backgroundColor: "#FFF6E7",
    borderColor: "#E5CDA6",
    borderRadius: 999,
    borderWidth: 1,
    color: "#70441A",
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  adminMealRow: {
    alignItems: "center",
    borderTopColor: "#F0E6D7",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  adminMealMain: { flex: 1 },
  adminMealTitle: { color: "#3F2A24", fontSize: 15, fontWeight: "900" },
  adminMealMeta: {
    color: "#806B5A",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  adminMealNumbers: { alignItems: "flex-end" },
  adminMealQty: { color: "#5D211A", fontSize: 16, fontWeight: "900" },
  adminMealAmount: {
    color: "#8B391B",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  summaryBar: {
    alignItems: "center",
    backgroundColor: "#FFFDF8",
    borderTopColor: "#E4D4BE",
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 13,
    position: "absolute",
    width: "100%",
  },
  summaryLabel: { color: "#7A6554", fontSize: 12, fontWeight: "700" },
  summaryTotal: {
    color: "#5D211A",
    fontFamily: displayFont,
    fontSize: 22,
    marginTop: 2,
  },
  paymentNext: {
    alignItems: "center",
    backgroundColor: "#7C1D19",
    borderRadius: 5,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  paymentNextDisabled: { backgroundColor: "#BEAAA0" },
  paymentNextText: { color: "#FFF8EC", fontSize: 14, fontWeight: "800" },
  continueArrow: { color: "#F4C05B", fontSize: 20, lineHeight: 18 },
  paymentContent: {
    alignSelf: "center",
    maxWidth: 720,
    padding: 20,
    paddingBottom: 36,
    width: "100%",
  },
  paymentTitle: { color: "#5D211A", fontFamily: displayFont, fontSize: 31 },
  paymentLead: {
    color: "#6F5A4D",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    maxWidth: 510,
  },
  reviewCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#EBDCC7",
    borderRadius: 11,
    borderWidth: 1,
    marginTop: 24,
    padding: 16,
  },
  reviewEyebrow: {
    color: "#A36A15",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 9,
  },
  reviewRow: {
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  reviewItem: { color: "#4D392F", flex: 1, fontSize: 14, lineHeight: 19 },
  reviewPrice: { color: "#5D211A", fontSize: 14, fontWeight: "800" },
  reviewTotalRow: {
    alignItems: "baseline",
    borderTopColor: "#EADAC3",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 14,
  },
  reviewTotalLabel: { color: "#5D211A", fontFamily: displayFont, fontSize: 19 },
  reviewTotal: { color: "#7C1D19", fontFamily: displayFont, fontSize: 24 },
  paymentSectionLabel: {
    color: "#A36A15",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 10,
    marginTop: 28,
  },
  paymentOption: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#EBDCC7",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    marginBottom: 10,
    padding: 14,
  },
  paymentIcon: {
    alignItems: "center",
    backgroundColor: "#F8E2B9",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  paymentIconText: { color: "#7C1D19", fontSize: 16, fontWeight: "900" },
  paymentOptionText: { flex: 1 },
  paymentOptionTitle: { color: "#4A221B", fontSize: 16, fontWeight: "900" },
  paymentOptionHint: { color: "#806B5A", fontSize: 13, marginTop: 3 },
  optionArrow: { color: "#A36A15", fontSize: 27, lineHeight: 25 },
  singlePageContent: {
    alignSelf: "center",
    maxWidth: 620,
    padding: 24,
    width: "100%",
  },
  entryCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#EBDCC7",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 26,
    padding: 17,
  },
  entryLabel: {
    color: "#A36A15",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  entryInput: {
    borderBottomColor: "#D5A53D",
    borderBottomWidth: 1,
    color: "#4B1815",
    fontFamily: displayFont,
    fontSize: 22,
    marginTop: 10,
    paddingBottom: 9,
    paddingTop: 4,
  },
  widePrimaryButton: {
    alignItems: "center",
    backgroundColor: "#7C1D19",
    borderRadius: 5,
    flexDirection: "row",
    gap: 13,
    justifyContent: "center",
    marginTop: 22,
    paddingHorizontal: 18,
    paddingVertical: 17,
  },
  widePrimaryButtonDisabled: { backgroundColor: "#BEAAA0" },
  widePrimaryText: { color: "#FFF8EC", fontSize: 15, fontWeight: "800" },
  inlineButton: { marginTop: 16 },
  qrCard: {
    alignItems: "center",
    backgroundColor: "#FFFDF8",
    borderColor: "#E0C89B",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 25,
    padding: 22,
  },
  qrRecipient: { color: "#806B5A", fontSize: 12, marginTop: 18 },
  qrUpiId: {
    color: "#5D211A",
    fontFamily: displayFont,
    fontSize: 17,
    marginTop: 3,
  },
  successScreen: {
    flex: 1,
    backgroundColor: "#7C1D19",
    justifyContent: "space-between",
    overflow: "hidden",
    padding: 24,
  },
  successSun: {
    backgroundColor: "#EAA221",
    borderRadius: 190,
    height: 380,
    opacity: 0.98,
    position: "absolute",
    right: -145,
    top: -170,
    width: 380,
  },
  successLogoBadge: {
    alignItems: "center",
    height: 130,
    justifyContent: "center",
    position: "absolute",
    right: 18,
    top: 18,
    width: 220,
    zIndex: 2,
  },
  successLogo: { height: 124, width: 214 },
  successContent: { alignItems: "flex-start", marginTop: "18%", maxWidth: 520 },
  successKicker: {
    color: "#F7DFA7",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  successMark: {
    alignItems: "center",
    backgroundColor: "#F4C05B",
    borderRadius: 29,
    height: 58,
    justifyContent: "center",
    marginTop: 27,
    width: 58,
  },
  successMarkText: { color: "#641B17", fontSize: 32, fontWeight: "900" },
  successTitle: {
    color: "#FFF8EC",
    fontFamily: displayFont,
    fontSize: 48,
    marginTop: 20,
  },
  successBody: {
    color: "#F9E8C8",
    fontSize: 18,
    lineHeight: 27,
    marginTop: 10,
  },
  successReference: {
    backgroundColor: "#8E2B24",
    borderColor: "#C25B4E",
    borderRadius: 7,
    borderWidth: 1,
    marginTop: 25,
    padding: 14,
    width: "100%",
  },
  successReferenceLabel: {
    color: "#F7DFA7",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  successReferenceValue: {
    color: "#FFF8EC",
    fontFamily: displayFont,
    fontSize: 23,
    marginTop: 5,
  },
  successPaymentDetail: {
    color: "#F9E8C8",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 18,
  },
  successAmount: {
    color: "#F4C05B",
    fontFamily: displayFont,
    fontSize: 28,
    marginTop: 8,
  },
  submissionError: {
    backgroundColor: "#FFF0EE",
    borderColor: "#D87869",
    borderRadius: 6,
    borderWidth: 1,
    color: "#942F27",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 16,
    padding: 11,
  },
  paymentOptionDisabled: { opacity: 0.55 },
});
