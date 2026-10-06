import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { callBookingsApi } from "../src/api";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
type Apartment = { tower: string; apartment: string };

export function ContributionForm({ onBack }: { onBack: () => void }) {
  const [contributorType, setContributorType] = useState("Apartment");
  const [contributionType, setContributionType] = useState("Donation");
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [tower, setTower] = useState("");
  const [apartment, setApartment] = useState("");
  const [corporateName, setCorporateName] = useState("");
  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState(today);
  const [eventName, setEventName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState("");
  const busy = useRef(false);
  const requestId = useRef("contribution-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  // Preserve the submitted payload after a network error so Retry cannot create a duplicate.
  const pending = useRef<Record<string, unknown> | null>(null);
  const locked = saving || pending.current !== null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    callBookingsApi<{ apartments: Apartment[] }>({ action: "getContributionApartments" })
      .then(r => { if (active) setApartments(r.apartments); })
      .catch(e => { if (active) setLoadError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  const submit = async () => {
    if (busy.current) return;
    if (!pending.current) {
      if (contributorType === "Apartment" && (!tower || !apartment)) return setError("Select a tower and apartment.");
      if (contributorType === "Corporate" && !corporateName.trim()) return setError("Enter a corporate name.");
      if (!/^\d+(?:\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0 || Number(amount) > 10000000)
        return setError("Enter an amount greater than zero, up to Rs. 1,00,00,000, with at most two decimal places.");
      const d = new Date(paidDate + "T00:00:00Z");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate) || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== paidDate || paidDate > today())
        return setError("Enter a valid paid date in YYYY-MM-DD format, no later than today.");
      if (!eventName.trim()) return setError("Enter an event name.");
      pending.current = {
        action: "createContribution", requestId: requestId.current, contributorType, contributionType,
        tower: contributorType === "Apartment" ? tower : "",
        apartment: contributorType === "Apartment" ? apartment : "",
        corporateName: contributorType === "Corporate" ? corporateName.trim() : "",
        amount: Number(amount), paidDate, eventName: eventName.trim(),
      };
    }
    busy.current = true; setSaving(true); setError("");
    try {
      const result = await callBookingsApi<{ contribution: { id: string } }>(pending.current);
      setSavedId(result.contribution.id);
    } catch (e) {
      setError((e instanceof Error ? e.message : "Unable to save.") + " Retry to confirm this same entry.");
    } finally { busy.current = false; setSaving(false); }
  };
  const choices = (values: string[], current: string, select: (value: string) => void) => (
    <View style={s.choices}>
      {values.map(value => <Pressable key={value} disabled={locked} accessibilityRole="radio"
        accessibilityState={{ checked: value === current, disabled: locked }}
        onPress={() => select(value)} style={[s.choice, value === current && s.selected]}>
        <Text style={[s.choiceText, value === current && s.selectedText]}>{value === current ? "● " : "○ "}{value}</Text>
      </Pressable>)}
    </View>
  );
  return <ScrollView style={s.page} contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
    <View style={s.card}>
      <Pressable onPress={onBack} disabled={saving}><Text style={s.back}>‹ Home</Text></Pressable>
      <Text style={s.title}>Donations & sponsorships</Text>
      {savedId ? <>
        <Text style={s.label}>Contribution recorded</Text>
        <Text style={s.hint}>Record number: {savedId}</Text>
        <Text style={s.hint}>This contribution is separate from the apartment’s Pujo subscription.</Text>
        <Pressable style={s.button} onPress={onBack}><Text style={s.buttonText}>Back to home</Text></Pressable>
      </> : <>
        <Text style={s.hint}>Record a payment received for an event. This does not pay or change the apartment’s Pujo subscription.</Text>
        <Text style={s.label}>Contributor</Text>
        {choices(["Apartment", "Corporate"], contributorType, setContributorType)}
        {contributorType === "Apartment" ? <>
          {loading && <ActivityIndicator color="#7C1D19" />}
          {!!loadError && <><Text style={s.error}>{loadError}</Text><Pressable onPress={() => setRevision(v => v + 1)}><Text style={s.back}>Retry apartment list</Text></Pressable></>}
          {!loading && !loadError && apartments.length === 0 && <Text style={s.hint}>No apartments found in Resident Master.</Text>}
          <Text style={s.label}>Tower</Text>
          <Picker accessibilityLabel="Tower" enabled={!locked && !loading} selectedValue={tower} onValueChange={v => { setTower(v); setApartment(""); }} style={s.input}>
            <Picker.Item label="Select tower" value="" />
            {[...new Set(apartments.map(a => a.tower))].map(t => <Picker.Item key={t} label={t === "TH" ? "TH" : "Tower " + t} value={t} />)}
          </Picker>
          <Text style={s.label}>Apartment</Text>
          <Picker accessibilityLabel="Apartment" enabled={!locked && !!tower} selectedValue={apartment} onValueChange={setApartment} style={s.input}>
            <Picker.Item label="Select apartment" value="" />
            {apartments.filter(a => a.tower === tower).map(a => <Picker.Item key={a.apartment} label={a.apartment} value={a.apartment} />)}
          </Picker>
        </> : <>
          <Text style={s.label}>Corporate name</Text>
          <TextInput accessibilityLabel="Corporate name" editable={!locked} value={corporateName} onChangeText={setCorporateName} maxLength={200} style={s.input} placeholder="Company name" />
        </>}
        <Text style={s.label}>Contribution type</Text>
        {choices(["Donation", "Sponsorship"], contributionType, setContributionType)}
        <Text style={s.label}>Amount (Rs.)</Text>
        <TextInput accessibilityLabel="Amount" editable={!locked} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" maxLength={11} style={s.input} placeholder="Enter amount received" />
        <Text style={s.label}>Paid date</Text>
        <TextInput accessibilityLabel="Paid date" editable={!locked} value={paidDate} onChangeText={setPaidDate} maxLength={10} style={s.input} placeholder="YYYY-MM-DD" />
        <Text style={s.label}>Event name</Text>
        <TextInput accessibilityLabel="Event name" editable={!locked} value={eventName} onChangeText={setEventName} maxLength={200} style={s.input} placeholder="Enter event name" />
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        <Pressable disabled={saving} onPress={() => void submit()} style={[s.button, saving && { opacity: 0.5 }]}>
          <Text style={s.buttonText}>{saving ? "Saving…" : pending.current ? "Retry saving" : "Save contribution"}</Text>
        </Pressable>
      </>}
    </View>
  </ScrollView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFF8EC" },
  container: { padding: 24, alignItems: "center" },
  card: { width: "100%", maxWidth: 720, backgroundColor: "#fff", padding: 24, borderRadius: 18, gap: 12 },
  title: { fontSize: 30, fontWeight: "800", color: "#632719" },
  back: { color: "#7C1D19", fontWeight: "700", paddingVertical: 8 },
  label: { color: "#632719", fontWeight: "700", fontSize: 16, marginTop: 8 },
  hint: { color: "#795E50", fontSize: 16, lineHeight: 24 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  choice: { borderWidth: 1, borderColor: "#C9AA90", borderRadius: 8, padding: 14 },
  selected: { backgroundColor: "#7C1D19", borderColor: "#7C1D19" },
  choiceText: { color: "#632719", fontWeight: "700" },
  selectedText: { color: "#fff" },
  input: { borderWidth: 1, borderColor: "#C9AA90", borderRadius: 8, padding: 12, minHeight: 48, color: "#632719", fontSize: 16, backgroundColor: "#fff" },
  error: { color: "#B42318", fontSize: 15 },
  button: { backgroundColor: "#7C1D19", borderRadius: 8, padding: 16, alignItems: "center", marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
