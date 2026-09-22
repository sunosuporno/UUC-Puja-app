import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { callBookingsApi } from "../src/api";
import { s } from "./AdminAccess";
type Meal = {
  dayDate: string;
  dayName: string;
  mealType: string;
  foodType: string;
  serviceType: string;
  source: string;
  quantity: number;
};
type Report = {
  apartment: string;
  totalCoupons: number;
  totalBookings: number;
  meals: Meal[];
};
export function ApartmentCoupons() {
  const [tower, setTower] = useState(""),
    [flat, setFlat] = useState("");
  const [report, setReport] = useState<Report | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function search() {
    if (busy) return;
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const result = await callBookingsApi<{ report: Report }>({
        action: "getApartmentCoupons",
        towerNumber: tower,
        apartmentNumber: flat.trim(),
      });
      setReport(result.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load coupons.");
    } finally {
      setBusy(false);
    }
  }
  const days =
    report?.meals.reduce<Record<string, Meal[]>>((all, meal) => {
      const key = JSON.stringify([meal.dayDate, meal.dayName]);
      (all[key] ||= []).push(meal);
      return all;
    }, {}) || {};
  return (
    <View style={{ gap: 18 }}>
      <View style={[s.row, { alignItems: "flex-end" }]}>
        <View style={s.field}>
          <Text style={s.label}>Tower</Text>
          <Picker
            accessibilityLabel="Apartment lookup tower"
            enabled={!busy}
            selectedValue={tower}
            onValueChange={(v) => {
              setTower(v);
              setReport(null);
              setError("");
            }}
            style={s.input}
          >
            <Picker.Item label="Select tower" value="" />
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "TH"].map((t) => (
              <Picker.Item key={t} label={t} value={t} />
            ))}
          </Picker>
        </View>
        <View style={s.field}>
          <Text style={s.label}>Apartment number</Text>
          <TextInput
            accessibilityLabel="Apartment lookup flat number"
            editable={!busy}
            value={flat}
            maxLength={20}
            autoCapitalize="characters"
            placeholder="e.g. 1005"
            style={s.input}
            onChangeText={(v) => {
              setFlat(v);
              setReport(null);
              setError("");
            }}
            onSubmitEditing={() => {
              if (tower && flat.trim()) void search();
            }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={busy || !tower || !flat.trim()}
          onPress={() => void search()}
          style={[
            s.button,
            (busy || !tower || !flat.trim()) && { opacity: 0.5 },
          ]}
        >
          <Text style={s.buttonText}>
            {busy ? "Searching…" : "Search coupons"}
          </Text>
        </Pressable>
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {report && (
        <>
          <Text style={[s.title, { fontSize: 22 }]}>
            Apartment {report.apartment}
          </Text>
          <View
            style={[
              s.row,
              { padding: 18, backgroundColor: "#F4E6D2", borderRadius: 10 },
            ]}
          >
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#5D211A" }}>
              {report.totalCoupons} total coupons
            </Text>
            <Text style={{ fontSize: 16, color: "#79584B" }}>
              Across {report.totalBookings} bookings
            </Text>
          </View>
          <Text style={{ color: "#79584B" }}>
            Each included season-pass meal counts as one coupon per person.
            Donations are excluded.
          </Text>
          {!report.meals.length && (
            <Text>No coupons booked for this apartment.</Text>
          )}
          {Object.entries(days).map(([key, meals]) => (
            <View
              key={key}
              style={{
                backgroundColor: "white",
                padding: 18,
                borderRadius: 10,
                gap: 12,
              }}
            >
              <Text
                style={{ fontSize: 19, fontWeight: "700", color: "#5D211A" }}
              >
                {meals[0].dayName} · {meals[0].dayDate}
              </Text>
              <Text style={{ fontWeight: "700" }}>
                {meals.reduce((sum, m) => sum + m.quantity, 0)} coupons
              </Text>
              {meals.map((m, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: "row",
                    gap: 16,
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ flex: 1, color: "#79584B" }}>
                    {m.mealType} · {m.foodType || "Season pass"} ·{" "}
                    {m.serviceType}
                    {m.foodType ? ` · ${m.source}` : ""}
                  </Text>
                  <Text style={{ fontWeight: "700", color: "#5D211A" }}>
                    {m.quantity}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </>
      )}
    </View>
  );
}
