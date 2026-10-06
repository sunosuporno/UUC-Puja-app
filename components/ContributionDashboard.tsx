import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { callBookingsApi } from "../src/api";

type Filter = "All" | "Apartment" | "Corporate";
type Row = {
  id: string; contributorType: string; tower: string | null; apartment: string | null;
  corporateName: string | null; contributionType: string; amount: number; paidDate: string; eventName: string;
};
type Report = {
  generatedAt: string; contributorType: Filter; rows: Row[];
  totals: { entries: number; donations: number; sponsorships: number; amount: number };
};
const money = (amount: number) => "Rs. " + amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const columns = [
  ["Record", 90], ["Contributor", 120], ["Tower", 80], ["Apartment", 110],
  ["Corporate name", 280], ["Type", 140], ["Amount", 150], ["Paid date", 140], ["Event", 280],
] as const;

export function ContributionDashboard() {
  const [filter, setFilter] = useState<Filter>("All");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true); setError(""); setReport(null);
    callBookingsApi<{ report: Report }>({ action: "getContributionReport", contributorType: filter })
      .then(r => { if (active) setReport(r.report); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Unable to load contributions."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [filter, revision]);
  const visible = report?.contributorType === filter ? report : null;
  return <View style={s.page}>
    <View style={s.toolbar}>
      <View style={s.filter}>
        <Text style={s.label}>Contributor</Text>
        <Picker accessibilityLabel="Filter contributions by contributor" selectedValue={filter} onValueChange={setFilter} style={s.picker}>
          <Picker.Item label="All" value="All" />
          <Picker.Item label="Apartment" value="Apartment" />
          <Picker.Item label="Corporate" value="Corporate" />
        </Picker>
      </View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => setRevision(v => v + 1)} style={[s.button, busy && { opacity: 0.5 }]}>
        <Text style={s.buttonText}>{busy ? "Refreshing…" : "Refresh"}</Text>
      </Pressable>
    </View>
    <Text style={s.note}>Apartments are sorted by tower and flat number, followed by corporates alphabetically. Payments from the same contributor show newest paid date first.</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {busy && <ActivityIndicator accessibilityLabel="Loading contributions" color="#7C1D19" />}
    {visible && <>
      <View style={s.cards}>
        {[
          ["Total collected", money(visible.totals.amount)],
          ["Donations", money(visible.totals.donations)],
          ["Sponsorships", money(visible.totals.sponsorships)],
          ["Entries", String(visible.totals.entries)],
        ].map(([label, value]) => <View style={s.card} key={label}><Text style={s.label}>{label}</Text><Text style={s.value}>{value}</Text></View>)}
      </View>
      <Text style={s.note}>Updated {new Date(visible.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST · Totals reflect the selected contributor filter.</Text>
      {visible.rows.length === 0 ? <Text style={s.note}>No contributions found for this selection.</Text> :
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={s.table}>
            <View style={[s.row, s.header]}>{columns.map(([label, width]) => <Text key={label} style={[s.cell, s.headerText, { width }]}>{label}</Text>)}</View>
            {visible.rows.map((row, index) => <View key={row.id} style={[s.row, index % 2 === 1 && s.alternate]}>
              {[
                row.id, row.contributorType, row.tower || "—", row.apartment || "—",
                row.corporateName || "—", row.contributionType, money(row.amount),
                new Date(row.paidDate + "T00:00:00+05:30").toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" }),
                row.eventName,
              ].map((value, i) => <Text key={columns[i][0]} style={[s.cell, { width: columns[i][1] }, i === 6 && s.amount]}>{value}</Text>)}
            </View>)}
          </View>
        </ScrollView>}
    </>}
  </View>;
}
const s = StyleSheet.create({
  page: { gap: 18 }, toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 16 },
  filter: { minWidth: 210, gap: 8 }, label: { color: "#632719", fontSize: 15, fontWeight: "700" },
  picker: { minHeight: 48, backgroundColor: "#fff", color: "#632719", borderWidth: 1, borderColor: "#C9AA90", borderRadius: 8, padding: 10 },
  button: { backgroundColor: "#7C1D19", padding: 16, borderRadius: 8 }, buttonText: { color: "#fff", fontWeight: "700" },
  note: { color: "#795E50", fontSize: 15, lineHeight: 23 }, error: { color: "#B42318" },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: 14 }, card: { flexGrow: 1, minWidth: 160, backgroundColor: "#F5E8D3", padding: 20, borderRadius: 12, gap: 10 },
  value: { fontSize: 26, fontWeight: "800", color: "#632719" },
  table: { borderWidth: 1, borderColor: "#E7D2B7", borderRadius: 12, overflow: "hidden" },
  row: { flexDirection: "row", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E7D2B7" },
  alternate: { backgroundColor: "#FFFBF5" }, header: { backgroundColor: "#7C1D19" },
  cell: { padding: 14, fontSize: 15, color: "#632719" }, headerText: { color: "#fff", fontWeight: "800" },
  amount: { textAlign: "right", fontWeight: "700" },
});
