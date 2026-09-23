import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ResidentContacts } from "./ResidentContacts";
import { callBookingsApi } from "../src/api";

type Counts = { paid: number; unpaid: number; total: number };
type Report = {
  generatedAt: string;
  towers: (Counts & { tower: string })[];
  totals: Counts;
};
export function SubscriptionDashboard() {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    void callBookingsApi<{ report: Report }>({
      action: "getSubscriptionSummary",
    })
      .then((result) => {
        if (active) setReport(result.report);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Unable to load subscriptions.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const metrics = [
    { key: "paid", label: "Paid", style: styles.paid },
    { key: "unpaid", label: "Not Paid", style: styles.unpaid },
    { key: "total", label: "Total apartments", style: styles.total },
  ] as const;
  return (
    <View style={styles.page}>
      <View style={styles.toolbar}>
        <Text style={styles.note}>
          {report
            ? `Updated ${new Date(report.generatedAt).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Kolkata",
              })} IST`
            : "Apartment payment status"}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => setRevision((v) => v + 1)}
          style={[styles.button, busy && { opacity: 0.5 }]}
        >
          <Text style={styles.buttonText}>
            {busy ? "Refreshing…" : "Refresh"}
          </Text>
        </Pressable>
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
          {report ? " Showing the last loaded totals." : ""}
        </Text>
      )}
      {busy && !report && (
        <ActivityIndicator
          accessibilityLabel="Loading subscription summary"
          color="#7C1D19"
        />
      )}
      {report && (
        <>
          <View style={styles.cards}>
            {metrics.map((metric) => (
              <View key={metric.key} style={[styles.card, metric.style]}>
                <Text style={styles.cardLabel}>{metric.label}</Text>
                <Text style={styles.cardValue}>
                  {report.totals[metric.key].toLocaleString("en-IN")}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.heading}>Tower-wise payment status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={styles.table}>
              <View style={[styles.row, styles.header]}>
                <Text
                  style={[styles.cell, styles.labelCell, styles.headerText]}
                >
                  Status / Tower
                </Text>
                {report.towers.map((tower) => (
                  <Text
                    key={tower.tower}
                    style={[styles.cell, styles.headerText]}
                  >
                    {tower.tower}
                  </Text>
                ))}
                <Text style={[styles.cell, styles.headerText]}>Total</Text>
              </View>
              {metrics.map((metric) => (
                <View key={metric.key} style={[styles.row, metric.style]}>
                  <Text style={[styles.cell, styles.labelCell]}>
                    {metric.label}
                  </Text>
                  {report.towers.map((tower) => (
                    <Text
                      key={tower.tower}
                      style={styles.cell}
                      accessibilityLabel={`Tower ${tower.tower}, ${metric.label}: ${tower[metric.key]}`}
                    >
                      {tower[metric.key]}
                    </Text>
                  ))}
                  <Text style={[styles.cell, styles.totalCell]}>
                    {report.totals[metric.key]}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
          {!report.totals.total && (
            <Text style={styles.note}>
              No apartments with both a block and unit number were found.
            </Text>
          )}
          <Text style={styles.note}>
            Each block and unit number is counted once. Apartments with no
            resident marked Paid are Not Paid. Rows missing a block or unit
            number are excluded.
          </Text>
        </>
      )}
      <ResidentContacts refreshKey={revision} />
    </View>
  );
}
const styles = StyleSheet.create({
  page: { gap: 20 },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  note: { color: "#79584B", fontSize: 15, lineHeight: 23 },
  heading: { fontSize: 22, fontWeight: "700", color: "#5D211A" },
  button: {
    backgroundColor: "#7C1D19",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  buttonText: { color: "#FFF8EC", fontWeight: "700", fontSize: 16 },
  error: { color: "#AE2525", fontSize: 16 },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: { flexGrow: 1, flexBasis: 180, borderRadius: 12, padding: 22, gap: 10 },
  cardLabel: { color: "#5D211A", fontSize: 17, fontWeight: "600" },
  cardValue: { color: "#5D211A", fontSize: 34, fontWeight: "700" },
  paid: { backgroundColor: "#EDF5E8" },
  unpaid: { backgroundColor: "#FFF0DC" },
  total: { backgroundColor: "#F4E6D2" },
  table: {
    borderWidth: 1,
    borderColor: "#E8D5BD",
    borderRadius: 12,
    overflow: "hidden",
  },
  row: { flexDirection: "row" },
  header: { backgroundColor: "#7C1D19" },
  cell: {
    width: 82,
    paddingVertical: 18,
    paddingHorizontal: 8,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    color: "#5D211A",
  },
  labelCell: { width: 180, textAlign: "left", paddingLeft: 18 },
  headerText: { color: "#FFF8EC", fontWeight: "700" },
  totalCell: { fontWeight: "800" },
});
