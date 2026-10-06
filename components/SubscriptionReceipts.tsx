import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { callBookingsApi } from "../src/api";

import { downloadSubscriptionReceiptExcel, receiptColumns as columns, type ReceiptReport as Report } from "../src/subscriptionReceiptExcel";

const money = (value: number) => "Rs. " + value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
export function SubscriptionReceipts() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const exportInFlight = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const edit = (value: string, setter: (value: string) => void) => {
    generation.current++; setter(value); setBusy(false); setReport(null); setError("");
  };
  const search = async () => {
    const current = ++generation.current;
    setReport(null); setError("");
    if (![from, to].every(v => /^[0-9]{1,15}$/.test(v.trim()) && Number(v) > 0)) {
      setError("Enter positive receipt numbers containing up to 15 digits."); return;
    }
    if (Number(from) > Number(to)) {
      setError("From receipt must be less than or equal to To receipt."); return;
    }
    setBusy(true);
    try {
      const result = await callBookingsApi<{ report: Report }>({
        action: "getSubscriptionReceipts", fromReceipt: from.trim(), toReceipt: to.trim(),
      });
      if (generation.current === current) setReport(result.report);
    } catch (e) {
      if (generation.current === current) setError(e instanceof Error ? e.message : "Unable to load receipts.");
    } finally { if (generation.current === current) setBusy(false); }
  };
  const download = async () => {
    if (!report?.rows.length || busy || exportInFlight.current) return;
    exportInFlight.current = true; setExporting(true);
    const current = generation.current;
    try {
      await downloadSubscriptionReceiptExcel(report);
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : "Unable to download Excel.");
    } finally { exportInFlight.current = false; setExporting(false); }
  };
  return <View style={s.section}>
    <Text style={s.heading}>Subscriptions by receipt number</Text>
    <Text style={s.note}>Search an inclusive range, such as 100–200. Use the same number in both fields to find one receipt. All matching records are shown, including duplicate receipt numbers.</Text>
    <View style={s.toolbar}>
      <View style={s.field}><Text style={s.label}>From receipt</Text>
        <TextInput accessibilityLabel="From receipt number" value={from} onChangeText={v => edit(v, setFrom)} keyboardType="number-pad" maxLength={15} placeholder="100" style={s.input} />
      </View>
      <View style={s.field}><Text style={s.label}>To receipt</Text>
        <TextInput accessibilityLabel="To receipt number" value={to} onChangeText={v => edit(v, setTo)} keyboardType="number-pad" maxLength={15} placeholder="200" style={s.input} />
      </View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void search()} style={[s.button, busy && { opacity: 0.5 }]}>
        <Text style={s.buttonText}>{busy ? "Searching…" : "Search receipts"}</Text>
      </Pressable>
      {Platform.OS === "web" && <Pressable
        accessibilityRole="button"
        disabled={busy || exporting || !report?.rows.length}
        onPress={() => void download()}
        style={[s.button, (busy || exporting || !report?.rows.length) && { opacity: 0.5 }]}
      >
        <Text style={s.buttonText}>{exporting ? "Downloading…" : "Download Excel"}</Text>
      </Pressable>}
    </View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {busy && <ActivityIndicator accessibilityLabel="Loading subscription receipts" color="#7C1D19" />}
    {report && <>
      <Text style={s.label}>Receipts {report.fromReceipt}–{report.toReceipt} · {report.count} records · Total {money(report.totalAmount)}</Text>
      {report.count === 0 ? <Text style={s.note}>No subscription records found in this receipt range.</Text> :
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={s.table}>
            <View style={[s.row, s.header]}>{columns.map(([label, width]) => <Text key={label} style={[s.cell, s.headerText, { width }]}>{label}</Text>)}</View>
            {report.rows.map((row, index) => <View key={index} style={[s.row, index % 2 === 1 && s.alternate]}>
              {[row.receiptNumber, row.tower, row.apartment, row.name, row.phone,
                row.amount === null ? "—" : money(row.amount), row.paidDate, row.paymentReference].map((value, i) =>
                <Text key={columns[i][0]} style={[s.cell, { width: columns[i][1] }]}>{value || "—"}</Text>)}
            </View>)}
          </View>
        </ScrollView>}
    </>}
  </View>;
}
const s = StyleSheet.create({
  section: { borderTopWidth: 1, borderTopColor: "#E7D2B7", paddingTop: 28, gap: 16 },
  heading: { color: "#632719", fontSize: 24, fontWeight: "800" }, note: { color: "#795E50", fontSize: 15, lineHeight: 23 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 14 },
  field: { minWidth: 160, gap: 8 }, label: { color: "#632719", fontSize: 16, fontWeight: "700" },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#C9AA90", borderRadius: 8, padding: 12, minHeight: 48, color: "#632719", fontSize: 16 },
  button: { backgroundColor: "#7C1D19", padding: 16, borderRadius: 8 }, buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#B42318" }, table: { borderWidth: 1, borderColor: "#E7D2B7", borderRadius: 12, overflow: "hidden" },
  row: { flexDirection: "row", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E7D2B7" },
  header: { backgroundColor: "#7C1D19" }, headerText: { color: "#fff", fontWeight: "800" }, alternate: { backgroundColor: "#FFFBF5" },
  cell: { padding: 14, fontSize: 15, color: "#632719" },
});
