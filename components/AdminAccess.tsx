import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { apiRequest, setAdminToken } from "../src/api";
export function AdminAccess({
  onSignedIn,
  onBack,
}: {
  onSignedIn: () => void;
  onBack: () => void;
}) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function login() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ token: string }>("/admin/login", {
        password,
      });
      setAdminToken(result.token);
      setPassword("");
      onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.card}>
        <Text style={s.title}>Admin sign in</Text>
        <Text>Manage events, menus and booking reports.</Text>
        <TextInput
          accessibilityLabel="Admin password"
          placeholder="Admin password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={s.input}
          autoCapitalize="none"
          onSubmitEditing={() => void login()}
        />
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        <Pressable
          disabled={busy || !password}
          onPress={() => void login()}
          style={s.button}
        >
          <Text style={s.buttonText}>{busy ? "Signing in…" : "Sign in"}</Text>
        </Pressable>
        <Pressable onPress={onBack}>
          <Text style={s.link}>Back to bookings</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
export const s = StyleSheet.create({
  page: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: "#FFF8EC",
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 850,
    padding: 24,
    gap: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
  },
  title: { fontSize: 26, fontWeight: "700", color: "#5D211A" },
  input: {
    borderWidth: 1,
    borderColor: "#BCA78C",
    padding: 12,
    borderRadius: 8,
    color: "#302319",
    backgroundColor: "#fff",
  },
  button: {
    backgroundColor: "#7C1D19",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "700" },
  error: { color: "#AE2525" },
  link: { color: "#7C1D19", paddingVertical: 10 },
  row: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  label: { fontWeight: "600", marginBottom: 6 },
  field: { flexGrow: 1, minWidth: 180 },
  notice: { color: "#33603D" },
});
