import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { BellRing, CircleCheck, Moon, Save, Tag, X } from "lucide-react-native";
import { errorMessage } from "./gatewayApi";
import { useGatewayApi } from "./useGatewayApi";
import { AppIcon, type LucideIcon } from "../../theme";
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

  // The caller's own preferences: identity comes from the access token, not from the URL.
  const path = userId ? "/api/notifications/preferences" : null;

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

  const toggle = (key: "pushEnabled" | "promotionEnabled", icon: LucideIcon, label: string, hint: string) => (
    <View style={[styles.card, styles.spaceBetween]}>
      <View style={local.iconWrap}><AppIcon icon={icon} color={colors.primary} /></View>
      <View style={local.toggleText}>
        <Text style={styles.subtitle}>{label}</Text>
        <Text style={styles.muted}>{hint}</Text>
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
    <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={[local.content, { maxWidth: isWide ? 640 : undefined, padding: gutter }]}>
      {toggle("pushEnabled", BellRing, "Thông báo đẩy", "Nhận thông báo trên điện thoại.")}
      {toggle("promotionEnabled", Tag, "Khuyến mãi", "Nhận khuyến mãi phù hợp với kho thực phẩm của bạn.")}
      <View style={[styles.card, local.quiet]}>
        <View style={styles.row}>
          <View style={local.iconWrap}><AppIcon icon={Moon} color={colors.primary} /></View>
          <Text style={[styles.title, local.toggleText]} accessibilityRole="header">Giờ yên tĩnh</Text>
        </View>
        <Text style={styles.muted}>Không gửi khuyến mãi trong khoảng này. Có thể qua nửa đêm, ví dụ 22:00 – 06:00.</Text>
        <View style={styles.wrapRow}>
          <View style={local.timeField}><Field label="Bắt đầu" placeholder="22:00" value={start} onChangeText={setStart} keyboardType="numbers-and-punctuation" maxLength={5} /></View>
          <View style={local.timeField}><Field label="Kết thúc" placeholder="06:00" value={end} onChangeText={setEnd} keyboardType="numbers-and-punctuation" maxLength={5} /></View>
        </View>
        {quietError ? <Text style={styles.errorText} accessibilityLiveRegion="polite">{quietError}</Text> : null}
        {(start || end) ? <Button variant="secondary" icon={X} label="Tắt giờ yên tĩnh" onPress={() => { setStart(""); setEnd(""); }} /> : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {notice ? (
        <View style={styles.row} accessibilityLiveRegion="polite">
          <AppIcon icon={CircleCheck} size="sm" color={colors.success} />
          <Text style={styles.success}>{notice}</Text>
        </View>
      ) : null}
      <Button label="Lưu cài đặt" icon={Save} onPress={() => void save()} busy={saving} disabled={Boolean(quietError)} />
    </ScrollView>
  );
}

const local = StyleSheet.create({
  content: { alignSelf: "center", gap: 12, width: "100%" },
  iconWrap: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 999, height: 40, justifyContent: "center", width: 40 },
  toggleText: { flex: 1, gap: 2, paddingRight: 4 },
  quiet: { gap: 8 },
  timeField: { flexBasis: 140, flexGrow: 1 },
});
