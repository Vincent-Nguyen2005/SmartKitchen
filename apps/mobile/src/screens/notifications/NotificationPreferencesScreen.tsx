import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { errorMessage } from "./gatewayApi";
import { useGatewayApi } from "./useGatewayApi";
import { Button, colors, Field, ScreenState, styles, useLayout } from "./ui";

type Preferences = {
  pushEnabled: boolean;
  promotionEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function NotificationPreferencesScreen(): React.JSX.Element {
  const { api, userId } = useGatewayApi();
  const { gutter, isWide } = useLayout();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const path = userId ? `/api/notifications/preferences/${encodeURIComponent(userId)}` : null;

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const result = await api.get<Preferences>(path);
      setPrefs(result);
      setStart(result.quietHoursStart ?? "");
      setEnd(result.quietHoursEnd ?? "");
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api, path]);

  useEffect(() => { void load(); }, [load]);

  const quietError = (start || end) && (!TIME.test(start) || !TIME.test(end))
    ? "Giờ yên tĩnh phải có cả giờ bắt đầu và kết thúc theo dạng HH:mm (ví dụ 22:00)."
    : null;

  const save = async () => {
    if (!path || !prefs || quietError) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await api.put<Preferences>(path, {
        pushEnabled: prefs.pushEnabled,
        promotionEnabled: prefs.promotionEnabled,
        quietHoursStart: start || null,
        quietHoursEnd: end || null,
      });
      setPrefs(result);
      setNotice("Đã lưu cài đặt thông báo.");
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !prefs) return <ScreenState loading={loading} error={error} onRetry={() => void load()} />;

  const toggle = (key: "pushEnabled" | "promotionEnabled", label: string, hint: string) => (
    <View style={[styles.card, styles.row, { justifyContent: "space-between" }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[styles.title, { fontSize: 16 }]}>{label}</Text>
        <Text style={{ color: colors.muted, marginTop: 2 }}>{hint}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={prefs[key]}
        onValueChange={(value) => setPrefs({ ...prefs, [key]: value })}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ alignSelf: "center", gap: 12, maxWidth: isWide ? 640 : undefined, padding: gutter, width: "100%" }}>
      {toggle("pushEnabled", "Thông báo đẩy", "Nhận thông báo trên điện thoại.")}
      {toggle("promotionEnabled", "Khuyến mãi", "Nhận khuyến mãi phù hợp với kho thực phẩm của bạn.")}
      <View style={styles.card}>
        <Text style={[styles.title, { fontSize: 16, marginBottom: 8 }]}>Giờ yên tĩnh</Text>
        <Text style={{ color: colors.muted, marginBottom: 8 }}>Không gửi khuyến mãi trong khoảng này. Có thể qua nửa đêm, ví dụ 22:00 – 06:00.</Text>
        <View style={[styles.wrapRow]}>
          <View style={{ flexGrow: 1, minWidth: 140 }}><Field label="Bắt đầu" placeholder="22:00" value={start} onChangeText={setStart} keyboardType="numbers-and-punctuation" maxLength={5} /></View>
          <View style={{ flexGrow: 1, minWidth: 140 }}><Field label="Kết thúc" placeholder="06:00" value={end} onChangeText={setEnd} keyboardType="numbers-and-punctuation" maxLength={5} /></View>
        </View>
        {quietError ? <Text style={styles.errorText} accessibilityLiveRegion="polite">{quietError}</Text> : null}
        {(start || end) ? <Button variant="secondary" label="Tắt giờ yên tĩnh" onPress={() => { setStart(""); setEnd(""); }} style={{ marginTop: 8 }} /> : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {notice ? <Text style={{ color: colors.success }} accessibilityLiveRegion="polite">{notice}</Text> : null}
      <Button label="Lưu cài đặt" onPress={() => void save()} busy={saving} disabled={Boolean(quietError)} />
    </ScrollView>
  );
}
