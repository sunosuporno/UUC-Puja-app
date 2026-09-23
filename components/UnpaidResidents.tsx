import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { callBookingsApi } from "../src/api";

import {
  unpaidColumns as columns,
  type UnpaidReport as Report,
} from "../src/unpaidReport";
import { downloadUnpaidExcel } from "../src/unpaidExcel";

export function UnpaidResidents({ refreshKey }: { refreshKey: number }) {
  const [tower, setTower] = useState("1");
  const [revision, setRevision] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setExportError("");
    setReport(null);
    void callBookingsApi<{ report: Report }>({
      action: "getUnpaidResidents",
      towerNumber: tower,
    })
      .then((result) => {
        if (active) setReport(result.report);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Unable to load unpaid residents.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [tower, revision, refreshKey]);
  const current = report?.towerNumber === tower ? report : null;
  async function exportExcel() {
    if (!current || busy || exporting || !current.contacts.length) return;
    setExporting(true);
    setExportError("");
    try {
      await downloadUnpaidExcel(current);
    } catch {
      setExportError("Unable to download Excel. Please try again.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <View style={s.section}>
      <Text style={s.title}>Unpaid apartment contacts</Text>
      <Text style={s.note}>
        Tenants are shown first. Where no tenant is listed, only owners marked
        as the primary contact are shown. Apartments with any Paid member are
        excluded.
      </Text>
      <View style={s.toolbar}>
        <View style={s.field}>
          <Text style={s.label}>Tower</Text>
          <Picker
            accessibilityLabel="Unpaid residents tower"
            selectedValue={tower}
            onValueChange={setTower}
            style={s.picker}
          >
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "TH"].map((t) => (
              <Picker.Item
                key={t}
                label={t === "TH" ? "TH" : `Tower ${t}`}
                value={t}
              />
            ))}
          </Picker>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => setRevision((v) => v + 1)}
          style={[s.button, busy && { opacity: 0.5 }]}
        >
          <Text style={s.buttonText}>
            {busy ? "Loading…" : "Refresh contacts"}
          </Text>
        </Pressable>
        {Platform.OS === "web" && (
          <Pressable
            accessibilityRole="button"
            disabled={busy || exporting || !current?.contacts.length}
            onPress={() => void exportExcel()}
            style={[
              s.button,
              (busy || exporting || !current?.contacts.length) && {
                opacity: 0.5,
              },
            ]}
          >
            <Text style={s.buttonText}>
              {exporting ? "Preparing Excel…" : "Download Excel"}
            </Text>
          </Pressable>
        )}
      </View>
      {!!exportError && (
        <Text accessibilityRole="alert" style={s.error}>
          {exportError}
        </Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {busy && (
        <ActivityIndicator
          accessibilityLabel="Loading unpaid residents"
          color="#7C1D19"
        />
      )}
      {current && (
        <>
          <Text style={s.count}>
            {current.unpaidApartments} unpaid apartments ·{" "}
            {current.contacts.length} contacts across{" "}
            {current.contactApartments} apartments
          </Text>
          <Text style={s.note}>
            Updated{" "}
            {new Date(current.generatedAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            })}{" "}
            IST
          </Text>
          {current.unpaidApartments > current.contactApartments && (
            <Text style={s.notice}>
              {current.unpaidApartments - current.contactApartments} unpaid
              apartment(s) have no Tenant or primary Owner contact. Check their
              Resident Master records.
            </Text>
          )}
          {current.contacts.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={s.table}>
                <View style={[s.row, s.header]}>
                  {columns.map((column) => (
                    <Text
                      key={column.key}
                      style={[s.cell, s.headerText, { width: column.width }]}
                    >
                      {column.label}
                    </Text>
                  ))}
                </View>
                {current.contacts.map((contact, index) => (
                  <View
                    key={`${contact.unit}-${index}`}
                    style={[s.row, index % 2 === 1 && s.alternate]}
                  >
                    {columns.map((column) => (
                      <Text
                        selectable
                        key={column.key}
                        style={[s.cell, { width: column.width }]}
                      >
                        {contact[column.key]?.trim() || "—"}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : (
            <Text style={s.note}>
              {current.unpaidApartments
                ? "No matching contacts for this tower."
                : "No unpaid apartments in this tower."}
            </Text>
          )}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  section: {
    marginTop: 24,
    paddingTop: 28,
    borderTopWidth: 1,
    borderTopColor: "#E8D5BD",
    gap: 16,
  },
  title: { color: "#5D211A", fontSize: 26, fontWeight: "700" },
  note: { color: "#79584B", fontSize: 15, lineHeight: 23 },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    alignItems: "flex-end",
  },
  field: { minWidth: 190 },
  label: { color: "#5D211A", fontSize: 16, fontWeight: "700", marginBottom: 8 },
  picker: {
    padding: 12,
    backgroundColor: "#fff",
    color: "#5D211A",
    borderWidth: 1,
    borderColor: "#BCA78C",
    borderRadius: 8,
  },
  button: {
    backgroundColor: "#7C1D19",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 8,
  },
  buttonText: { color: "#FFF8EC", fontSize: 16, fontWeight: "700" },
  count: { color: "#5D211A", fontSize: 18, fontWeight: "600" },
  notice: {
    backgroundColor: "#FFF0DC",
    color: "#79502A",
    padding: 14,
    borderRadius: 8,
  },
  error: { color: "#AE2525", fontSize: 16 },
  table: {
    borderWidth: 1,
    borderColor: "#E8D5BD",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E8D5BD",
  },
  header: { backgroundColor: "#7C1D19" },
  headerText: { color: "#FFF8EC", fontWeight: "700" },
  cell: { padding: 14, color: "#5D211A", fontSize: 15, lineHeight: 22 },
  alternate: { backgroundColor: "#FFFBF5" },
});
