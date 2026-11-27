import React, { useCallback, useEffect, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Eye, EyeOff, KeyRound, Lock, LockOpen, Mail, Phone, Plus, Truck, UserRound } from "lucide-react-native";
import { AppIcon, radius, spacing, textStyles, touchTarget } from "../../theme";
import { useConfirm } from "../../components/ConfirmDialog";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { errorMessage } from "../notifications/gatewayApi";
import { Badge, Button, colors, Field, ScreenState, styles, useLayout } from "../notifications/ui";
import { deliveredText, newShipperProblem, passwordProblem, type NewShipper, type ShipperAccount } from "./shippers";

const EMPTY: NewShipper = { name: "", phone: "", email: "", password: "" };

/**
 * Quản trị › "Người giao hàng": shipper accounts (role SHIPPER, verified, no family). Add with a password the admin
 * types (never shown again), lock / unlock (a locked shipper cannot sign in; their deliveries go back to waiting),
 * reset password. admin-service checks the ADMIN role and writes the audit log.
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
    const ok = await confirm(locking
      ? { title: `Khóa tài khoản ${account.name ?? account.email}?`, message: "Người này sẽ không đăng nhập được nữa. Đơn họ đang giao sẽ quay lại danh sách chờ cho người khác nhận.", confirmLabel: "Khóa", destructive: true }
      : { title: `Mở khóa ${account.name ?? account.email}?`, message: "Người này sẽ đăng nhập và nhận đơn được trở lại.", confirmLabel: "Mở khóa" });
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
          <View style={local.card}>
            <View style={local.cardTop}>
              <View style={local.avatar}><AppIcon icon={Truck} color={colors.primary} /></View>
              <View style={local.flex}>
                <Text style={local.name} numberOfLines={1}>{item.name ?? "Chưa có tên"}</Text>
                <Text style={local.meta} numberOfLines={1}>{item.phone ?? "—"} · {item.email}</Text>
              </View>
              <Badge label={item.active ? "Đang hoạt động" : "Đã khóa"} color={item.active ? colors.success : colors.danger} background={item.active ? colors.successSoft : colors.dangerSoft} icon={item.active ? LockOpen : Lock} />
            </View>
            <Text style={local.meta}>{deliveredText(item.deliveredCount)}</Text>
            <View style={local.actions}>
              <Button variant="secondary" icon={KeyRound} label="Đặt lại mật khẩu" onPress={() => { setNotice(null); setResetFor(item); }} style={local.flex} />
              <Button variant={item.active ? "danger" : "secondary"} icon={item.active ? Lock : LockOpen} label={item.active ? "Khóa" : "Mở khóa"} busy={busyId === item.id} onPress={() => void toggle(item)} style={local.flex} />
            </View>
          </View>
        )}
      />
      <CreateSheet form={form} onChange={setForm} onClose={() => setForm(null)} onCreated={(account) => { setForm(null); setNotice(`Đã tạo tài khoản cho ${account.name ?? account.email}. Gửi mật khẩu cho họ trực tiếp.`); void load(); }} />
      <ResetSheet account={resetFor} onClose={() => setResetFor(null)} onDone={() => { setNotice("Đã đặt lại mật khẩu. Các phiên đăng nhập cũ đã kết thúc."); setResetFor(null); }} />
      {dialog}
    </View>
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
  avatar: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.pill, height: 40, justifyContent: "center", width: 40 },
  flex: { flex: 1, minWidth: 0 },
  name: { ...textStyles.label },
  meta: { ...textStyles.bodySmall, color: colors.muted },
  actions: { flexDirection: "row", gap: spacing.sm },
  backdrop: { backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" },
  sheet: { alignSelf: "center", backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.sm, maxWidth: 720, padding: spacing.lg, width: "100%" },
  sheetTitle: { ...textStyles.subheading },
  eye: { alignItems: "center", bottom: 0, justifyContent: "center", minHeight: touchTarget, minWidth: touchTarget, position: "absolute", right: 0 },
});
