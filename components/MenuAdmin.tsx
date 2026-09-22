import { createElement, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { apiRequest } from "../src/api";
import { s } from "./AdminAccess";
type Row = {
  Day: string;
  "Meal Time": string;
  "Menu Veg": string;
  "Menu Non-Veg": string;
  "Veg Takeaway Price": number | null;
  "Veg Dine-In Price": number | null;
  "Non-veg Takeaway Price": number | null;
  "Non-Veg Dine-In Price": number | null;
  Date: string | null;
};
const blank: Row = {
  Day: "",
  "Meal Time": "Lunch",
  "Menu Veg": "",
  "Menu Non-Veg": "",
  "Veg Takeaway Price": null,
  "Veg Dine-In Price": null,
  "Non-veg Takeaway Price": null,
  "Non-Veg Dine-In Price": null,
  Date: null,
};
const prices = [
  "Veg Dine-In Price",
  "Veg Takeaway Price",
  "Non-Veg Dine-In Price",
  "Non-veg Takeaway Price",
] as const;
export function MenuAdmin({
  onBack,
  onChanged,
}: {
  onBack: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [row, setRow] = useState<Row>({ ...blank }),
    [original, setOriginal] = useState<Pick<Row, "Day" | "Meal Time"> | null>(
      null,
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [editorOpen, setEditorOpen] = useState(false),
    [editorAtTop, setEditorAtTop] = useState(false);
  async function load() {
    try {
      const r = await apiRequest<{ rows: Row[] }>("/admin/menu");
      setRows(r.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load menu");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const pass = row.Day === "Season Pass";
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest("/admin/menu", { row, original });
      await load();
      setOriginal({ Day: row.Day, "Meal Time": row["Meal Time"] });
      setNotice("Saved. The menu is available to residents.");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!original || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/admin/menu/delete", original);
      await load();
      setRow({ ...blank });
      setOriginal(null);
      setConfirmDelete(false);
      setEditorOpen(false);
      setNotice("Menu removed.");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to remove");
    } finally {
      setBusy(false);
    }
  }
  const field = (key: keyof Row, label: string, multiline = false) => (
    <View style={s.field} key={key}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={String(row[key] ?? "")}
        multiline={multiline}
        style={[s.input, multiline ? { minHeight: 90 } : {}]}
        onChangeText={(value) => setRow({ ...row, [key]: value || null })}
      />
    </View>
  );
  const editor = (
    <View
      style={{
        padding: 16,
        gap: 16,
        backgroundColor: "#FFF8EF",
        borderRadius: 10,
      }}
    >
      <Text style={s.title}>
        {original ? "Edit" : "Add"} {pass ? "season pass" : "event meal"}
      </Text>
      <View style={s.row}>
        {field("Day", "Event name")}
        {field("Meal Time", "Meal time")}
        {!pass && (
          <View style={s.field}>
            <Text style={s.label}>Event date</Text>
            {Platform.OS === "web" ? (
              createElement("input", {
                type: "date",
                "aria-label": "Event date",
                value: row.Date || "",
                onChange: (event: { target: { value: string } }) =>
                  setRow({ ...row, Date: event.target.value || null }),
                style: {
                  width: "100%",
                  minWidth: 0,
                  boxSizing: "border-box",
                  border: "1px solid #BCA78C",
                  borderRadius: 8,
                  padding: 12,
                  backgroundColor: "#fff",
                  color: "#302319",
                  fontFamily: "inherit",
                  fontSize: 14,
                  minHeight: 44,
                },
              })
            ) : (
              <TextInput
                accessibilityLabel="Event date"
                placeholder="YYYY-MM-DD"
                maxLength={10}
                value={row.Date || ""}
                style={s.input}
                onChangeText={(value) =>
                  setRow({ ...row, Date: value || null })
                }
              />
            )}
          </View>
        )}
      </View>
      {field(
        "Menu Veg",
        pass ? "Included event names (comma-separated)" : "Veg menu",
        !pass,
      )}
      {!pass && field("Menu Non-Veg", "Non-veg menu", true)}
      <View style={s.row}>
        {(pass ? (["Veg Dine-In Price"] as const) : prices).map((key) => (
          <View key={key} style={s.field}>
            <Text style={s.label}>{pass ? "Season pass price" : key}</Text>
            <TextInput
              accessibilityLabel={pass ? "Season pass price" : key}
              keyboardType="decimal-pad"
              value={row[key] === null ? "" : String(row[key])}
              style={s.input}
              onChangeText={(v) =>
                setRow({ ...row, [key]: v === "" ? null : Number(v) })
              }
            />
          </View>
        ))}
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {!!notice && <Text style={s.notice}>{notice}</Text>}
      <Pressable disabled={busy} style={s.button} onPress={() => void save()}>
        <Text style={s.buttonText}>{busy ? "Saving…" : "Save menu"}</Text>
      </Pressable>
      {original && (
        <Pressable onPress={() => setConfirmDelete(true)}>
          <Text style={s.error}>Remove this meal</Text>
        </Pressable>
      )}
      {confirmDelete && (
        <View>
          <Text>
            Remove {original?.Day} {original?.["Meal Time"]}? Booked meals
            cannot be removed.
          </Text>
          <View style={s.row}>
            <Pressable onPress={() => void remove()} disabled={busy}>
              <Text style={s.link}>Confirm removal</Text>
            </Pressable>
            <Pressable onPress={() => setConfirmDelete(false)}>
              <Text style={s.link}>Keep meal</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.card}>
        <Pressable onPress={onBack}>
          <Text style={s.link}>‹ Back to reports</Text>
        </Pressable>
        <Text style={s.title}>Events & menus</Text>
        <Text>
          Each row is one event meal. Saving makes it available immediately.
          Past events automatically disappear from the booking menu.
        </Text>
        <View style={s.row}>
          <Pressable
            style={s.button}
            disabled={busy}
            onPress={() => {
              setEditorOpen(true);
              setEditorAtTop(true);
              setError("");
              setNotice("");
              setRow({ ...blank });
              setOriginal(null);
              setConfirmDelete(false);
              setNotice("");
            }}
          >
            <Text style={s.buttonText}>New event meal</Text>
          </Pressable>
          <Pressable
            style={s.button}
            disabled={busy}
            onPress={() => {
              setEditorOpen(true);
              setEditorAtTop(true);
              setError("");
              setNotice("");
              const existing = rows.find((r) => r.Day === "Season Pass");
              setRow(
                existing || {
                  ...blank,
                  Day: "Season Pass",
                  "Menu Veg": "Saptami 1, Saptami 2, Nabami",
                  "Veg Dine-In Price": 1200,
                },
              );
              setOriginal(
                existing
                  ? { Day: existing.Day, "Meal Time": existing["Meal Time"] }
                  : null,
              );
              setConfirmDelete(false);
            }}
          >
            <Text style={s.buttonText}>Season pass</Text>
          </Pressable>
        </View>
        {!editorOpen && !!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {!editorOpen && !!notice && <Text style={s.notice}>{notice}</Text>}
        {editorOpen && editorAtTop && editor}
        {rows.map((r) => {
          const selected =
            editorOpen &&
            !editorAtTop &&
            original?.Day === r.Day &&
            original?.["Meal Time"] === r["Meal Time"];
          return (
            <View key={JSON.stringify([r.Day, r["Meal Time"]])}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  selected,
                  expanded: selected,
                  disabled: busy,
                }}
                disabled={busy}
                onPress={() => {
                  setRow({ ...r });
                  setOriginal({ Day: r.Day, "Meal Time": r["Meal Time"] });
                  setEditorOpen(true);
                  setEditorAtTop(false);
                  setConfirmDelete(false);
                  setError("");
                  setNotice("");
                }}
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: selected ? "#7D211B" : "#EBDDC9",
                  borderLeftWidth: 4,
                  borderLeftColor: selected ? "#7D211B" : "transparent",
                  backgroundColor: selected ? "#F8E8DB" : "transparent",
                  paddingVertical: 14,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "600",
                      color: selected ? "#7D211B" : "#241A17",
                      flex: 1,
                    }}
                  >
                    {r.Day} · {r["Meal Time"]}
                  </Text>
                  {selected && (
                    <Text style={{ color: "#7D211B", fontWeight: "600" }}>
                      Editing
                    </Text>
                  )}
                </View>
                <Text>{r.Date || "Season pass configuration"}</Text>
              </Pressable>
              {selected && editor}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
