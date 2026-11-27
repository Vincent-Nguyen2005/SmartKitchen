import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, ReceiptText, RefreshCw, Users, Wallet, X } from "lucide-react-native";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget, type LucideIcon } from "../../theme";
import UserAvatar from "../../components/UserAvatar";
import { useSession } from "../../services/session";
import { shoppingApi } from "../shopping-cart/shoppingApi";
import {
  barFractions, buyerOf, canGoNext, comparisonLine, currentMonth, itemCountText, lineQuantity, monthTitle, purchaseTime, shiftMonth, vnd, vndSpoken,
  type Member, type MonthSpending, type SpendingGroup, type SpendingPurchase,
} from "./spending";
import { discountText } from "../shopping-cart/checkoutSummary";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Without a family: "Đến Gia đình". */
  onOpenFamily: () => void;
};

const ANIMATION_MS = 200;

/**
 * "Chi tiêu" (capture bar): what the family spent in Đi chợ in a Vietnam month, from completed purchases only
 * (shopping-list-service GET /spending; totals computed there with the checkout's rounding). Every member sees it.
 * Top to bottom: month switcher (no future months) → summary card (total, comparison with the previous month) →
 * "Theo nhóm" bars → "Đơn đã mua" list (virtualized); a purchase opens a detail sheet.
 */
export default function SpendingScreen({ visible, onClose, onOpenFamily }: Props): React.JSX.Element {
  const session = useSession();
  const familyId = session.family?.id ?? null;
  const token = session.accessToken;
  const [month, setMonth] = useState(() => currentMonth());
  const [data, setData] = useState<MonthSpending | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<SpendingPurchase | null>(null);
  const listRef = useRef<FlatList<SpendingPurchase>>(null);
  const requestId = useRef(0);
  const reveal = useRef(new Animated.Value(1)).current;

  // Members as the family screen shows them (the signed-in member with their own profile name / avatar).
  const members = useMemo<Member[]>(() => {
    const user = session.user;
    return (session.family?.members ?? []).map((member) => (user && member.userId === user.id
      ? { userId: member.userId, displayName: user.fullName?.trim() || member.displayName, avatarUrl: user.avatarUrl || member.avatarUrl }
      : { userId: member.userId, displayName: member.displayName, avatarUrl: member.avatarUrl }));
  }, [session.family?.members, session.user]);

  const load = useCallback(async (forMonth: string, mode: "load" | "refresh") => {
    if (!token || !familyId) return;
    const id = ++requestId.current;
    if (mode === "refresh") setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const result = await shoppingApi.spending<MonthSpending>(token, familyId, forMonth);
      if (id !== requestId.current) return;
      setData(result);
      reveal.setValue(0);
      Animated.timing(reveal, { toValue: 1, duration: ANIMATION_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(caught instanceof Error ? caught.message : "Không tải được chi tiêu.");
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [token, familyId, reveal]);

  // Opening: the current month. Changing month: back to the top, then load.
  useEffect(() => { if (visible) setMonth(currentMonth()); }, [visible]);
  useEffect(() => {
    if (!visible) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    setData((current) => (current?.month === month ? current : null));
    void load(month, "load");
  }, [visible, month, load]);

  const shown = data?.month === month ? data : null;
  const purchases = shown?.purchases.items ?? [];
  const openPurchase = useCallback((purchase: SpendingPurchase) => setOpened(purchase), []);

  const header = (
    <View style={local.headerBlock}>
      <MonthSwitcher month={month} onChange={setMonth} />
      {error && shown ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${error}. Thử lại`} onPress={() => void load(month, "refresh")} style={local.inlineError}>
          <Text style={local.inlineErrorText} numberOfLines={2}>{error}</Text>
          <Text style={local.inlineErrorAction}>Thử lại</Text>
        </Pressable>
      ) : null}
      {shown ? <SummaryCard data={shown} reveal={reveal} /> : error ? null : <SummarySkeleton />}
      {shown ? (shown.groups.length > 0 ? <GroupsSection groups={shown.groups} month={month} /> : null) : error ? null : <GroupsSkeleton />}
      {(shown && purchases.length > 0) || (!shown && !error) ? <Text style={local.sectionTitle} accessibilityRole="header">Đơn đã mua</Text> : null}
    </View>
  );

  let empty: React.JSX.Element;
  if (error && !shown) empty = <StateView icon={RefreshCw} text={error} action="Thử lại" onAction={() => void load(month, "load")} />;
  else if (!shown || loading) empty = <PurchaseSkeleton />;
  else empty = <StateView icon={ReceiptText} text="Chưa có chi tiêu trong tháng này" />;

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={local.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={local.topBar}>
          <IconButton icon={X} accessibilityLabel="Đóng Chi tiêu" onPress={onClose} />
          <Text style={local.topTitle} accessibilityRole="header" numberOfLines={1}>Chi tiêu</Text>
          <View style={local.topSpacer} />
        </View>
        {!familyId ? (
          <StateView icon={Users} text="Bạn chưa có gia đình" action="Đến Gia đình" onAction={() => { onClose(); onOpenFamily(); }} />
        ) : (
          <FlatList
            ref={listRef}
            data={shown ? purchases : []}
            keyExtractor={(purchase) => purchase.id}
            renderItem={({ item, index }) => <PurchaseRow purchase={item} members={members} onOpen={openPurchase} first={index === 0} last={index === purchases.length - 1} />}
            ItemSeparatorComponent={Divider}
            ListHeaderComponent={header}
            ListEmptyComponent={empty}
            contentContainerStyle={local.content}
            showsVerticalScrollIndicator={false}
            initialNumToRender={12}
            windowSize={7}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(month, "refresh")} tintColor={colors.primary} colors={[colors.primary]} />}
          />
        )}
        <PurchaseSheet purchase={opened} members={members} onClose={() => setOpened(null)} />
      </SafeAreaView>
    </Modal>
  );
}

function MonthSwitcher({ month, onChange }: { month: string; onChange: (month: string) => void }): React.JSX.Element {
  const next = canGoNext(month);
  return (
    <View style={local.switcher}>
      <IconButton icon={ChevronLeft} accessibilityLabel={`Tháng trước, ${monthTitle(shiftMonth(month, -1))}`} color={colors.primary} onPress={() => onChange(shiftMonth(month, -1))} />
      <Text style={local.switcherTitle} accessibilityRole="header">{monthTitle(month)}</Text>
      <IconButton icon={ChevronRight} accessibilityLabel={next ? `Tháng sau, ${monthTitle(shiftMonth(month, 1))}` : "Không có tháng sau"} color={colors.primary} disabled={!next} onPress={() => onChange(shiftMonth(month, 1))} />
    </View>
  );
}

function SummaryCard({ data, reveal }: { data: MonthSpending; reveal: Animated.Value }): React.JSX.Element {
  const comparison = comparisonLine(data.changePercent, data.previousMonth);
  const tone = comparison?.tone === "up" ? colors.danger : comparison?.tone === "down" ? colors.success : colors.muted;
  const monthNumber = Number(data.month.split("-")[1]);
  return (
    <View style={local.card} accessible accessibilityLabel={`Tổng chi tháng ${monthNumber}: ${vndSpoken(data.total)}${comparison ? `. ${comparison.text.replace("↑", "Tăng").replace("↓", "Giảm")}` : ""}`}>
      <View style={local.summaryLabelRow}>
        <AppIcon icon={Wallet} size="sm" color={colors.primary} />
        <Text style={local.summaryLabel}>Tổng chi</Text>
      </View>
      <Animated.Text style={[local.total, { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] }]}>{vnd(data.total)}</Animated.Text>
      {comparison ? <Text style={[local.comparison, { color: tone }]}>{comparison.text}</Text> : null}
    </View>
  );
}

function GroupsSection({ groups, month }: { groups: SpendingGroup[]; month: string }): React.JSX.Element {
  const fractions = barFractions(groups);
  return (
    <View style={local.section}>
      <Text style={local.sectionTitle} accessibilityRole="header">Theo nhóm</Text>
      <View style={[local.card, local.groupsCard]}>
        {groups.map((group, index) => <GroupBar key={`${month}-${group.name}`} group={group} fraction={fractions[index]} />)}
      </View>
    </View>
  );
}

function GroupBar({ group, fraction }: { group: SpendingGroup; fraction: number }): React.JSX.Element {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: fraction, duration: ANIMATION_MS, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [fraction, width]);
  return (
    <View style={local.groupRow} accessible accessibilityLabel={`${group.name}: ${vndSpoken(group.amount)}, ${group.percent} phần trăm`}>
      <View style={local.groupText}>
        <Text style={local.groupName} numberOfLines={1}>{group.name}</Text>
        <Text style={local.groupAmount}>{vnd(group.amount)} <Text style={local.groupPercent}>· {group.percent}%</Text></Text>
      </View>
      <View style={local.track}>
        <Animated.View style={[local.bar, { width: width.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
      </View>
    </View>
  );
}

/** One purchase; first / last round the list's card corners. */
const PurchaseRow = memo(function PurchaseRow({ purchase, members, onOpen, first, last }: { purchase: SpendingPurchase; members: Member[]; onOpen: (purchase: SpendingPurchase) => void; first: boolean; last: boolean }): React.JSX.Element {
  const buyer = buyerOf(members, purchase.buyerUserId);
  const when = purchaseTime(purchase.purchasedAt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${buyer.name}, ${when.replace(" · ", " lúc ")}, ${itemCountText(purchase.itemCount)}, ${vndSpoken(purchase.total)}. Xem chi tiết`}
      onPress={() => onOpen(purchase)}
      style={({ pressed }) => [local.row, local.listRow, first && local.listFirst, last && local.listLast, pressed && local.rowPressed]}
    >
      <UserAvatar name={buyer.name} avatarUrl={buyer.avatarUrl} size={40} />
      <View style={local.rowText}>
        <Text style={local.rowName} numberOfLines={1}>{buyer.name}</Text>
        <Text style={local.rowMeta} numberOfLines={1}>{when} · {itemCountText(purchase.itemCount)}</Text>
      </View>
      <Text style={local.rowTotal}>{vnd(purchase.total)}</Text>
    </Pressable>
  );
});

function PurchaseSheet({ purchase, members, onClose }: { purchase: SpendingPurchase | null; members: Member[]; onClose: () => void }): React.JSX.Element {
  const buyer = purchase ? buyerOf(members, purchase.buyerUserId) : null;
  return (
    <Modal animationType="slide" transparent visible={purchase !== null} onRequestClose={onClose}>
      <View style={local.sheetBackdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng chi tiết" onPress={onClose} style={StyleSheet.absoluteFill} />
        {purchase && buyer ? (
          <SafeAreaView edges={["bottom"]} style={local.sheet}>
            <View style={local.sheetHeader}>
              <View style={local.sheetHeading}>
                <Text style={local.sheetTitle} accessibilityRole="header">Đơn {purchaseTime(purchase.purchasedAt)}</Text>
                <Text style={local.rowMeta}>{buyer.name} · {itemCountText(purchase.itemCount)}</Text>
              </View>
              <IconButton icon={X} accessibilityLabel="Đóng chi tiết" onPress={onClose} />
            </View>
            <ScrollView style={local.sheetList} contentContainerStyle={local.sheetListContent} showsVerticalScrollIndicator={false}>
              {purchase.lines.map((line, index) => (
                <View key={line.id} style={[local.line, index > 0 && local.lineDivider]} accessible
                  accessibilityLabel={`${line.name}, ${lineQuantity(line)}${line.lineTotal !== null ? `, ${vndSpoken(line.lineTotal)}` : ", chưa có giá"}`}>
                  <View style={local.lineLeft}>
                    <Text style={local.lineName}>{line.name}</Text>
                    <Text style={local.lineMeta}>
                      {lineQuantity(line)}
                      {line.unitPrice !== null ? ` × ${vnd(line.unitPrice)}` : ""}
                      {line.originalUnitPrice !== null ? <Text style={local.struck}>{`  ${vnd(line.originalUnitPrice)}`}</Text> : null}
                    </Text>
                  </View>
                  <Text style={line.lineTotal !== null ? local.lineTotal : local.noPrice}>{line.lineTotal !== null ? vnd(line.lineTotal) : "Chưa có giá"}</Text>
                </View>
              ))}
            </ScrollView>
            {purchase.discountAmount && purchase.promotionName ? (
              <View style={local.promoRow} accessible accessibilityLabel={`Khuyến mãi ${purchase.promotionName}, trừ ${vndSpoken(purchase.discountAmount)}`}>
                <Text style={local.promoLabel} numberOfLines={2}>Khuyến mãi: {purchase.promotionName}</Text>
                <Text style={local.promoValue}>{discountText(purchase.discountAmount)}</Text>
              </View>
            ) : null}
            <View style={local.totalRow} accessible accessibilityLabel={`Tổng cộng ${vndSpoken(purchase.total)}`}>
              <Text style={local.totalLabel}>Tổng cộng</Text>
              <Text style={local.totalValue}>{vnd(purchase.total)}</Text>
            </View>
          </SafeAreaView>
        ) : null}
      </View>
    </Modal>
  );
}

function StateView({ icon, text, action, onAction }: { icon: LucideIcon; text: string; action?: string; onAction?: () => void }): React.JSX.Element {
  return (
    <View style={local.state}>
      <View style={local.stateIcon}><AppIcon icon={icon} size="lg" color={colors.primary} /></View>
      <Text style={local.stateText}>{text}</Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [local.stateButton, pressed && local.rowPressed]}>
          <Text style={local.stateButtonText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Placeholder blocks while loading (soft pulse), in the shape of what will appear. */
function usePulse(): Animated.Value {
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.55, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
}
function Block({ width, height, style }: { width: number | `${number}%`; height: number; style?: object }): React.JSX.Element {
  const pulse = usePulse();
  return <Animated.View style={[local.block, { width, height, opacity: pulse }, style]} />;
}
function SummarySkeleton(): React.JSX.Element {
  return (
    <View style={local.card} accessibilityLabel="Đang tải chi tiêu" accessible>
      <Block width={80} height={14} />
      <Block width={180} height={30} style={{ marginTop: spacing.sm }} />
      <Block width={140} height={14} style={{ marginTop: spacing.sm }} />
    </View>
  );
}
function GroupsSkeleton(): React.JSX.Element {
  return (
    <View style={local.section}>
      <Block width={90} height={18} />
      <View style={[local.card, local.groupsCard]}>
        {[0.9, 0.6, 0.35].map((fraction) => (
          <View key={fraction} style={local.groupRow}>
            <Block width="40%" height={14} />
            <Block width={`${Math.round(fraction * 100)}%`} height={8} />
          </View>
        ))}
      </View>
    </View>
  );
}
function PurchaseSkeleton(): React.JSX.Element {
  return (
    <View>
      {[0, 1, 2].map((index) => (
        <View key={index} style={[local.row, local.listRow, index === 0 && local.listFirst, index === 2 && local.listLast, index > 0 && local.lineDivider]}>
          <Block width={40} height={40} style={{ borderRadius: 20 }} />
          <View style={local.rowText}><Block width="55%" height={14} /><Block width="40%" height={12} style={{ marginTop: spacing.xs }} /></View>
          <Block width={72} height={14} />
        </View>
      ))}
    </View>
  );
}
const Divider = (): React.JSX.Element => <View style={local.divider}><View style={local.dividerLine} /></View>;

const local = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  topBar: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  topTitle: { ...textStyles.subheading, flex: 1, textAlign: "center" },
  topSpacer: { width: touchTarget },
  content: { alignSelf: "center", maxWidth: 720, paddingBottom: spacing.xl, paddingHorizontal: spacing.lg, width: "100%" },
  headerBlock: { gap: spacing.lg, paddingTop: spacing.md },
  switcher: { alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  switcherTitle: { ...textStyles.subheading, minWidth: 150, textAlign: "center" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.lg },
  summaryLabelRow: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  summaryLabel: { ...textStyles.labelSmall, color: colors.muted },
  total: { ...textStyles.pageTitle, marginTop: spacing.xs },
  comparison: { ...textStyles.labelSmall, marginTop: spacing.xs },
  section: { gap: spacing.sm },
  sectionTitle: { ...textStyles.subheading },
  groupsCard: { gap: spacing.md },
  groupRow: { gap: spacing.xs },
  groupText: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  groupName: { ...textStyles.bodySmall, flexShrink: 1 },
  groupAmount: { ...textStyles.labelSmall },
  groupPercent: { ...textStyles.bodySmall, color: colors.muted },
  track: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, height: 8, overflow: "hidden" },
  bar: { backgroundColor: colors.primary, borderRadius: radius.pill, height: 8 },
  row: { alignItems: "center", backgroundColor: colors.surface, flexDirection: "row", gap: spacing.md, minHeight: 64, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  rowPressed: { opacity: 0.7 },
  listRow: { borderColor: colors.border, borderLeftWidth: 1, borderRightWidth: 1 },
  listFirst: { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, borderTopWidth: 1 },
  listLast: { borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md, borderBottomWidth: 1 },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { ...textStyles.label },
  rowMeta: { ...textStyles.caption, marginTop: 2 },
  rowTotal: { ...textStyles.label, textAlign: "right" },
  // Inset like a list (after the avatar), inside the card's side borders.
  divider: { backgroundColor: colors.surface, borderColor: colors.border, borderLeftWidth: 1, borderRightWidth: 1, height: StyleSheet.hairlineWidth, paddingLeft: spacing.md + 40 + spacing.md },
  dividerLine: { backgroundColor: colors.border, flex: 1 },
  state: { alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.xl * 2 },
  stateIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.pill, height: 56, justifyContent: "center", width: 56 },
  stateText: { ...textStyles.body, color: colors.muted, textAlign: "center" },
  stateButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.xl },
  stateButtonText: { ...textStyles.label, color: colors.primaryText },
  block: { backgroundColor: colors.border, borderRadius: radius.sm },
  inlineError: { alignItems: "center", backgroundColor: colors.dangerSoft, borderRadius: radius.sm, flexDirection: "row", gap: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.md },
  inlineErrorText: { ...textStyles.bodySmall, color: colors.danger, flex: 1 },
  inlineErrorAction: { ...textStyles.labelSmall, color: colors.danger },
  sheetBackdrop: { backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" },
  sheet: { alignSelf: "center", backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "86%", maxWidth: 720, width: "100%" },
  sheetHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.xs, paddingVertical: spacing.sm },
  sheetHeading: { flex: 1 },
  sheetTitle: { ...textStyles.subheading },
  sheetList: { flexGrow: 0 },
  sheetListContent: { paddingHorizontal: spacing.lg },
  line: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md },
  lineDivider: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  lineLeft: { flex: 1, minWidth: 0 },
  lineName: { ...textStyles.bodySmall, fontWeight: "600" },
  lineMeta: { ...textStyles.caption, marginTop: 2 },
  struck: { ...textStyles.caption, textDecorationLine: "line-through" },
  lineTotal: { ...textStyles.labelSmall, textAlign: "right" },
  noPrice: { ...textStyles.caption, textAlign: "right" },
  totalRow: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  totalLabel: { ...textStyles.label },
  promoRow: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.md, justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  promoLabel: { ...textStyles.bodySmall, color: colors.muted, flex: 1, minWidth: 0 },
  promoValue: { ...textStyles.labelSmall, color: colors.success, textAlign: "right" },
  totalValue: { ...textStyles.subheading },
});
