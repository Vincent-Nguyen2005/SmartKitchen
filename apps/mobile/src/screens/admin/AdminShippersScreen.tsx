import React, { useCallback, useEffect, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Eye, EyeOff, KeyRound, Lock, LockOpen, Mail, Phone, Plus, Truck, UserRound } from "lucide-react-native";
import { AppIcon, radius, spacing, textStyles, touchTarget } from "../../theme";
import { useConfirm } from "../../components/ConfirmDialog";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { errorMessage } from "../notifications/gatewayApi";
import { Badge, Button, colors, Field, ScreenState, styles, useLayout } from "../notifications/ui";
import { deliveredText, newShipperProblem, passwordProblem, shipperActions, shipperDetailRows, statusText, toggleConfirm, type NewShipper, type ShipperAccount } from "./shippers";
import { Avatar } from "./directoryUi";

const EMPTY: NewShipper = { name: "", phone: "", email: "", password: "" };

/**
 * Quản trị › "Người giao hàng": shipper accounts (role SHIPPER, verified, no family). Cards show avatar, name, phone,
 * status and "<n> đơn đã giao"; tapping one opens a detail sheet (name, phone, email, status, delivered count, created
 * date) with "Đặt lại mật khẩu" and "Khóa" / "Mở khóa" (a locked shipper cannot sign in; their deliveries go back to
 * waiting). Add with a password the admin types (never shown again). admin-service checks the ADMIN role and writes
 * the audit log.
 */
export default function AdminShippersScreen(): React.JSX.Element {
  const { api } = useGatewayApi();
  const { gutter } = useLayout();
  const [items, setItems] = useState<ShipperAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState<NewShipper | null>(null);
  const [resetFor, setResetFor] = useState<ShipperAccount | null>(null);
  const [detail, setDetail] = useState<ShipperAccount | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      setItems((await api.get<{ items: ShipperAccount[] }>("/api/admin/shippers")).items);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setRefreshing(false);
    }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (account: ShipperAccount) => {
    const locking = account.active;
    const ok = await confirm(toggleConfirm(account));
    if (!ok) return;
    setBusyId(account.id);
    try {
      const result = await api.patch<{ releasedOrders: number | null }>(`/api/admin/shippers/${encodeURIComponent(account.id)}/status`, { active: !locking });
      setNotice(locking ? `Đã khóa tài khoản${result.releasedOrders ? `, ${result.releasedOrders} đơn quay lại danh sách chờ` : ""}.` : "Đã mở khóa tài khoản.");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[local.content, { paddingHorizontal: gutter }]}
        ListHeaderComponent={
          <View style={local.headerBlock}>
            <Button label="Thêm người giao hàng" icon={Plus} onPress={() => { setNotice(null); setForm({ ...EMPTY }); }} />
            {notice ? <Text style={local.notice} accessibilityLiveRegion="polite">{notice}</Text> : null}
            {error && items ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={<ScreenState loading={items === null && !error} error={items === null ? error : null} empty={items !== null} emptyText="Chưa có người giao hàng" emptyIcon={Truck} onRetry={() => void load()} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.name ?? "Chưa có tên"}, ${statusText(item)}, ${deliveredText(item.deliveredCount)}`} accessibilityHint="Mở chi tiết người giao hàng" onPress={() => { setNotice(null); setDetail(item); }} style={({ pressed }) => [local.card, pressed && local.pressed]}>
            <View style={local.cardTop}>
              <Avatar name={item.name} email={item.email} />
              <View style={local.flex}>
                <Text style={local.name} numberOfLines={1}>{item.name ?? "Chưa có tên"}</Text>
                <Text style={local.meta} numberOfLines={1}>{item.phone ?? "—"}</Text>
              </View>
              {busyId === item.id ? null : <AppIcon icon={ChevronRight} size="sm" color={colors.muted} />}
            </View>
            <View style={local.cardBottom}>
              <StatusBadge account={item} />
              <Text style={local.meta}>{deliveredText(item.deliveredCount)}</Text>
            </View>
          </Pressable>
        )}
      />
      <DetailSheet
        account={detail}
        busy={detail !== null && busyId === detail.id}
        onClose={() => setDetail(null)}
        onReset={(account) => { setDetail(null); setResetFor(account); }}
        onToggle={(account) => { setDetail(null); void toggle(account); }}
      />
      <CreateSheet form={form} onChange={setForm} onClose={() => setForm(null)} onCreated={(account) => { setForm(null); setNotice(`Đã tạo tài khoản cho ${account.name ?? account.email}. Gửi mật khẩu cho họ trực tiếp.`); void load(); }} />
      <ResetSheet account={resetFor} onClose={() => setResetFor(null)} onDone={() => { setNotice("Đã đặt lại mật khẩu. Các phiên đăng nhập cũ đã kết thúc."); setResetFor(null); }} />
      {dialog}
    </View>
  );
}

function StatusBadge({ account }: { account: ShipperAccount }): React.JSX.Element {
  return <Badge label={statusText(account)} color={account.active ? colors.success : colors.danger} background={account.active ? colors.successSoft : colors.dangerSoft} icon={account.active ? LockOpen : Lock} />;
}

/** Tapping a card: the account's details and its two actions (each closes the sheet, then runs the usual flow). */
function DetailSheet({ account, busy, onClose, onReset, onToggle }: { account: ShipperAccount | null; busy: boolean; onClose: () => void; onReset: (account: ShipperAccount) => void; onToggle: (account: ShipperAccount) => void }): React.JSX.Element {
  return (
    <Modal animationType="slide" transparent visible={account !== null} onRequestClose={onClose}>
      <View style={local.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose} style={StyleSheet.absoluteFill} />
        {account ? (
          <View style={local.sheet}>
            <View style={local.cardTop}>
              <Avatar name={account.name} email={account.email} />
              <Text style={[local.sheetTitle, local.flex]} accessibilityRole="header" numberOfLines={1}>{account.name ?? "Chưa có tên"}</Text>
              <StatusBadge account={account} />
            </View>
            {shipperDetailRows(account).map((row) => (
              <View key={row.label} style={local.detailRow}>
                <Text style={local.meta}>{row.label}</Text>
                <Text style={local.detailValue} numberOfLines={1} selectable>{row.value}</Text>
              </View>
            ))}
            <View style={local.actions}>
              {shipperActions(account).map((action) => action.key === "reset"
                ? <Button key={action.key} variant="secondary" icon={KeyRound} label={action.label} onPress={() => onReset(account)} style={local.flex} />
                : <Button key={action.key} variant={action.destructive ? "danger" : "secondary"} icon={account.active ? Lock : LockOpen} label={action.label} busy={busy} onPress={() => onToggle(account)} style={local.flex} />)}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function PasswordField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <Field label={label} icon={KeyRound} value={value} onChangeText={onChange} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} textContentType="newPassword" placeholder="Tối thiểu 8 ký tự, có chữ hoa, chữ thường và số" />
      <Pressable accessibilityRole="button" accessibilityLabel={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onPress={() => setVisible((current) => !current)} style={local.eye}>
        <AppIcon icon={visible ? EyeOff : Eye} size="sm" color={colors.muted} />
      </Pressable>
    </View>
  );
}

function CreateSheet({ form, onChange, onClose, onCreated }: { form: NewShipper | null; onChange: (form: NewShipper) => void; onClose: () => void; onCreated: (account: ShipperAccount) => void }): React.JSX.Element {
  const { api } = useGatewayApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (form === null) setError(null); }, [form]);
  const submit = async () => {
    if (!form) return;
    const problem = newShipperProblem(form);
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      const { shipper } = await api.post<{ shipper: ShipperAccount }>("/api/admin/shippers", { ...form, email: form.email.trim() });
      onCreated(shipper);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal animationType="slide" transparent visible={form !== null} onRequestClose={onClose}>
      <KeyboardAvoidingView style={local.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose} style={StyleSheet.absoluteFill} />
        {form ? (
          <View style={local.sheet}>
            <Text style={local.sheetTitle} accessibilityRole="header">Thêm người giao hàng</Text>
            <Field label="Họ tên" icon={UserRound} value={form.name} onChangeText={(name) => onChange({ ...form, name })} />
            <Field label="Số điện thoại" icon={Phone} value={form.phone} onChangeText={(phone) => onChange({ ...form, phone })} keyboardType="phone-pad" />
            <Field label="Email đăng nhập" icon={Mail} value={form.email} onChangeText={(email) => onChange({ ...form, email })} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            <PasswordField label="Mật khẩu ban đầu" value={form.password} onChange={(password) => onChange({ ...form, password })} />
            {error ? <Text style={styles.errorText} accessibilityRole="alert">{error}</Text> : null}
            <View style={local.actions}>
              <Button variant="secondary" label="Hủy" onPress={onClose} style={local.flex} />
              <Button label="Tạo tài khoản" busy={busy} onPress={() => void submit()} style={local.flex} />
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ResetSheet({ account, onClose, onDone }: { account: ShipperAccount | null; onClose: () => void; onDone: () => void }): React.JSX.Element {
  const { api } = useGatewayApi();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setPassword(""); setError(null); }, [account]);
  const submit = async () => {
    if (!account) return;
    const problem = passwordProblem(password);
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      await api.post(`/api/admin/shippers/${encodeURIComponent(account.id)}/password`, { password });
      setPassword("");
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal animationType="slide" transparent visible={account !== null} onRequestClose={onClose}>
      <KeyboardAvoidingView style={local.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose} style={StyleSheet.absoluteFill} />
        {account ? (
          <View style={local.sheet}>
            <Text style={local.sheetTitle} accessibilityRole="header">Đặt lại mật khẩu</Text>
            <Text style={local.meta}>{account.name ?? account.email}. Các phiên đăng nhập hiện tại sẽ kết thúc.</Text>
            <PasswordField label="Mật khẩu mới" value={password} onChange={setPassword} />
            {error ? <Text style={styles.errorText} accessibilityRole="alert">{error}</Text> : null}
            <View style={local.actions}>
              <Button variant="secondary" label="Hủy" onPress={onClose} style={local.flex} />
              <Button label="Lưu mật khẩu" busy={busy} onPress={() => void submit()} style={local.flex} />
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const local = StyleSheet.create({
  content: { gap: 0, paddingBottom: spacing.xl, paddingTop: spacing.md },
  headerBlock: { gap: spacing.sm, marginBottom: spacing.md },
  notice: { ...textStyles.bodySmall, backgroundColor: colors.successSoft, borderRadius: radius.sm, color: colors.success, padding: spacing.md },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  cardTop: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  cardBottom: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between" },
  pressed: { opacity: 0.85 },
  detailRow: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.md, justifyContent: "space-between", paddingVertical: spacing.sm },
  detailValue: { ...textStyles.body, flexShrink: 1, textAlign: "right" },
  flex: { flex: 1, minWidth: 0 },
  name: { ...textStyles.label },
  meta: { ...textStyles.bodySmall, color: colors.muted },
  actions: { flexDirection: "row", gap: spacing.sm },
  backdrop: { backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" },
  sheet: { alignSelf: "center", backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.sm, maxWidth: 720, padding: spacing.lg, width: "100%" },
  sheetTitle: { ...textStyles.subheading },
  eye: { alignItems: "center", bottom: 0, justifyContent: "center", minHeight: touchTarget, minWidth: touchTarget, position: "absolute", right: 0 },
});
