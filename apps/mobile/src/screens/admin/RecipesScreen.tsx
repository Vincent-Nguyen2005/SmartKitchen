import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { ChevronDown, ChevronUp, CookingPot, EyeOff, Pencil, Plus, Save, SearchX, Trash2, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon, AppText, IconButton } from "../../theme";
import { errorMessage } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { filterByName } from "../../services/localSearch";
import { Button, colors, Dropdown, Field, looksLikeImageUrl, RemoteImage, ScreenState, styles, useGridCell, useLayout } from "../notifications/ui";
import { INVENTORY_UNITS, UNIT_LABELS } from "../inventory/catalogSuggest";
import type { InventoryUnit } from "../inventory/inventoryApi";
import { useConfirm } from "../../components/ConfirmDialog";
import { safeDelete } from "./safeDelete";
import { AdminListHeader } from "./AdminListHeader";
import { AdminPager } from "./AdminPager";
import { PinnedHeader } from "./PinnedHeader";
import { DEFAULT_PER_PERSON, savedIngredient } from "./recipeIngredients";
import { StepIngredientTags } from "./StepIngredientTags";
import { recipeIngredientNames } from "./stepIngredients";
import { useSession } from "../../services/session";
import { isGatewayImage } from "../../services/authImage";
import type { UploadPhoto } from "../inventory/inventoryApi";
import { AdminPhotoField } from "./AdminPhotoField";
import { uploadRecipeImage } from "./adminMedia";
import type { CreateRequest } from "./AdminCreateFromPhoto";
import { confidenceText, duplicateDialog, findDuplicate, isAiValue, recipeValuesFrom, replacePhotoDialog, type RecipeAiValues, type RecipeSuggestion } from "./photoCreate";

/** AI suggestion → a new dish draft (name, cuisine, servings, kcal, catalog-mapped lines, draft steps). */
const draftFromSuggestion = (suggestion: RecipeSuggestion | null): Draft => {
  const base = emptyDraft();
  if (!suggestion) return base;
  const values = recipeValuesFrom(suggestion);
  return {
    ...base,
    name: values.name ?? "",
    cuisine: values.cuisine ?? base.cuisine,
    servings: values.servings ?? "",
    calories: values.calories ?? "",
    ingredients: suggestion.ingredients.length > 0 ? suggestion.ingredients.map((line) => newIngredient({ name: line.name, quantity: line.quantity, unit: line.unit })) : base.ingredients,
    steps: suggestion.steps.map((instruction, index) => newStep({ order: index + 1, instruction, durationSeconds: null, ingredients: [] })),
  };
};

type IngredientDetail = { name: string; quantity: number | null; unit: string | null; note?: string | null; isSeasoning?: boolean; perPerson?: boolean };
type Recipe = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  mealTypes: string[];
  calories: number | null;
  servings: number | null;
  preparationMinutes: number | null;
  ingredients: string[];
  ingredientDetails: IngredientDetail[] | null;
  isActive: boolean;
  role?: string | null;
  /** vietnam (default) | western | asian; menus mix in at most 1 non-Vietnamese dish per meal, 2 per day. */
  cuisine?: string | null;
  steps?: Array<{ order: number; instruction: string; durationSeconds: number | null; ingredients: IngredientDetail[] }> | null;
};

const MEALS = [
  { value: "breakfast", label: "Bữa sáng" },
  { value: "lunch", label: "Bữa trưa" },
  { value: "dinner", label: "Bữa tối" },
] as const;
/** Dish role in a family meal (menu-service composes lunch/dinner from it). */
const ROLE_OPTIONS = [
  { value: "none", label: "Chưa phân loại" },
  { value: "man", label: "Món mặn" },
  { value: "xao", label: "Món xào" },
  { value: "canh", label: "Canh" },
  { value: "rau", label: "Rau" },
  { value: "trang_mieng", label: "Tráng miệng" },
  { value: "sang", label: "Món sáng" },
  { value: "mot_mon", label: "Món một đĩa (phở, bún...)" },
  { value: "do_uong", label: "Đồ uống" },
];
/** "Ẩm thực": internal cuisine (menu-service balance rule for non-Vietnamese dishes). */
const CUISINE_OPTIONS = [
  { value: "vietnam", label: "Việt Nam" },
  { value: "western", label: "Âu Mỹ" },
  { value: "asian", label: "Châu Á khác (Hàn, Nhật...)" },
];
/** Same short Vietnamese unit labels as Kho / Đi chợ. */
const UNIT_OPTIONS = INVENTORY_UNITS.map((unit) => ({ value: unit, label: UNIT_LABELS[unit] }));
const PAGE_SIZE = 10;
/** Same limits as recipe-service: at most 30 steps, each timer 0-7200 s. */
const MAX_STEPS = 30;
const MAX_STEP_SECONDS = 7200;

/** quantity: a number ("300") or a free-text amount ("vừa ăn", "1 muỗng canh"). */
/** perPerson: "Theo người" (eaten one per person; menus scale it per person). */
type IngredientDraft = { key: string; name: string; quantity: string; unit: InventoryUnit; isSeasoning: boolean; perPerson: boolean };
/** A cooking step being edited: duration as minutes + seconds, ingredients as names from the dish's list. */
type StepDraft = { key: string; instruction: string; minutes: string; seconds: string; ingredients: string[] };
type Draft = {
  id?: string; name: string; description: string; imageUrl: string; mealTypes: string[];
  calories: string; servings: string; preparationMinutes: string; ingredients: IngredientDraft[]; steps: StepDraft[];
  /** The dish already had steps: an emptied list is sent (clears them); otherwise no steps are sent at all. */
  hadSteps: boolean;
  role: string;
  cuisine: string;
  isActive?: boolean;
};
let ingredientKey = 0;
let stepKey = 0;
const newStep = (step?: NonNullable<Recipe["steps"]>[number]): StepDraft => ({
  key: `step-${stepKey += 1}`,
  instruction: step?.instruction ?? "",
  minutes: step?.durationSeconds != null ? String(Math.floor(step.durationSeconds / 60)) : "",
  seconds: step?.durationSeconds != null ? String(step.durationSeconds % 60) : "",
  ingredients: step?.ingredients.map((ingredient) => ingredient.name) ?? [],
});
const newIngredient = (detail?: IngredientDetail): IngredientDraft => ({
  key: `ing-${ingredientKey += 1}`,
  name: detail?.name ?? "",
  quantity: detail?.quantity != null ? String(detail.quantity) : detail?.note ?? "",
  isSeasoning: detail?.isSeasoning ?? false,
  perPerson: detail?.perPerson ?? DEFAULT_PER_PERSON,
  unit: (INVENTORY_UNITS as string[]).includes(detail?.unit ?? "") ? detail?.unit as InventoryUnit : "GRAM",
});
const emptyDraft = (): Draft => ({ name: "", description: "", imageUrl: "", mealTypes: [], calories: "", servings: "", preparationMinutes: "", ingredients: [newIngredient()], steps: [], hadSteps: false, role: "none", cuisine: "vietnam" });
const toDraft = (recipe: Recipe): Draft => ({
  id: recipe.id,
  name: recipe.name,
  description: recipe.description ?? "",
  imageUrl: recipe.imageUrl ?? "",
  mealTypes: [...recipe.mealTypes],
  calories: recipe.calories?.toString() ?? "",
  servings: recipe.servings?.toString() ?? "",
  preparationMinutes: recipe.preparationMinutes?.toString() ?? "",
  ingredients: (recipe.ingredientDetails?.length ? recipe.ingredientDetails : recipe.ingredients.map((name) => ({ name, quantity: null, unit: null }))).map(newIngredient),
  steps: [...(recipe.steps ?? [])].sort((left, right) => left.order - right.order).map(newStep),
  hadSteps: (recipe.steps?.length ?? 0) > 0,
  role: recipe.role ?? "none",
  cuisine: recipe.cuisine ?? "vietnam",
  isActive: recipe.isActive,
});
const imageUrlError = (text: string): string | null =>
  !text.trim() || looksLikeImageUrl(text) || isGatewayImage(text) ? null : "Link phải bắt đầu bằng https://, là địa chỉ công khai và tối đa 2048 ký tự.";
const optionalNumber = (value: string): number | null => (value.trim() === "" ? null : Number(value.replace(",", ".")));

/** Quản trị > Món ăn: recipe catalog (recipe-service, admin-guarded routes). Hiding sets isActive=false. */
type ScreenProps = {
  /** "Chụp ảnh" (bottom bar): open the create form prefilled with the AI suggestion and the photo attached. */
  createRequest?: CreateRequest | null;
  onCreateHandled?: () => void;
};

export default function RecipesScreen({ createRequest = null, onCreateHandled }: ScreenProps = {}): React.JSX.Element {
  const { api } = useGatewayApi();
  const { accessToken } = useSession();
  const { columns, gutter, isWide } = useLayout();
  const grid = useGridCell(columns);
  const [search, setSearch] = useState("");
  const term = search.trim();
  // Every recipe (~77, hidden ones too, shown dimmed), loaded once; the search runs on the device.
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { confirm, choose, dialog } = useConfirm();
  const requestId = useRef(0);
  const listRef = useRef<FlatList<Recipe>>(null);
  // Photo chosen for a NEW dish (uploaded after "Lưu"); AI values ("Gợi ý AI" until edited) and notes.
  const [pendingPhoto, setPendingPhoto] = useState<UploadPhoto | null>(null);
  const [aiValues, setAiValues] = useState<RecipeAiValues>({});
  const [aiInfo, setAiInfo] = useState<{ note: string | null; confidence: string | null; notes: string | null; unmatched: string[]; aiLines: boolean } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const drafting = draft !== null;
  useEffect(() => { if (!drafting) { setPendingPhoto(null); setAiValues({}); setAiInfo(null); } }, [drafting]);
  const aiLabel = (label: string, field: keyof RecipeAiValues, current: string) => (isAiValue(field, current, aiValues) ? `${label} · Gợi ý AI` : label);

  // "Chụp ảnh" from the bottom bar: the create form, prefilled (nothing is saved until the admin taps Lưu).
  useEffect(() => {
    if (!createRequest) return;
    const suggestion = createRequest.recipe;
    setFormError(null);
    setDraft(draftFromSuggestion(suggestion));
    setTimeout(() => {
      setPendingPhoto(createRequest.photo);
      setAiValues(recipeValuesFrom(suggestion));
      setAiInfo({ note: createRequest.note, confidence: confidenceText(suggestion?.confidence ?? null), notes: suggestion?.notes ?? null, unmatched: suggestion?.unmatched ?? [], aiLines: Boolean(suggestion && (suggestion.ingredients.length > 0 || suggestion.steps.length > 0)) });
    }, 0);
    onCreateHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRequest?.key]);

  /** "Chụp / chọn ảnh": a new dish keeps the photo for "Lưu"; an existing one is updated now (replacing asks). */
  const pickPhoto = async (photo: UploadPhoto) => {
    if (!draft) return;
    if (!draft.id) { setPendingPhoto(photo); return; }
    if (draft.imageUrl.trim() && !(await confirm(replacePhotoDialog(draft.name || "món ăn")))) return;
    if (!accessToken) return;
    setPhotoBusy(true); setFormError(null);
    try {
      await uploadRecipeImage(accessToken, draft.id, photo);
      setNotice(`Đã cập nhật ảnh của ${draft.name}.`);
      setDraft(null);
      void load(true);
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setPhotoBusy(false);
    }
  };

  // recipe-service returns the whole (small) catalog in one request: loaded once (and on pull-to-refresh, retry and
  // after an edit). Typing in the search box or switching the filter sends no request; pages of 10 are cut here.
  const load = useCallback(async (refresh = false) => {
    const id = ++requestId.current;
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const result = await api.get<Recipe[]>("/api/recipes");
      if (id !== requestId.current) return;
      setAllRecipes(Array.isArray(result) ? result : []);
      setError(null);
    } catch (caught) {
      if (id === requestId.current) setError(errorMessage(caught));
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);
  // Accent-insensitive name search ("ca rot" finds "Cà rốt"); a new search starts on the first page.
  const recipes = useMemo(() => filterByName(allRecipes, term), [allRecipes, term]);
  useEffect(() => { setPage(1); }, [term]);

  const totalPages = Math.max(1, Math.ceil(recipes.length / PAGE_SIZE));
  const shownPage = Math.min(page, totalPages);
  const pageItems = recipes.slice((shownPage - 1) * PAGE_SIZE, shownPage * PAGE_SIZE);

  const save = async () => {
    if (!draft) return;
    const calories = optionalNumber(draft.calories);
    const servings = optionalNumber(draft.servings);
    const minutes = optionalNumber(draft.preparationMinutes);
    const ingredients = draft.ingredients.filter((row) => row.name.trim());
    if (!draft.name.trim()) return setFormError("Tên món là bắt buộc.");
    if (ingredients.length === 0) return setFormError("Thêm ít nhất một nguyên liệu.");
    const problem = imageUrlError(draft.imageUrl);
    if (problem) return setFormError(problem);
    if (calories !== null && (Number.isNaN(calories) || calories < 0 || calories > 10_000)) return setFormError("Calo mỗi phần là số từ 0 đến 10000.");
    if (servings !== null && (!Number.isInteger(servings) || servings < 1 || servings > 100)) return setFormError("Số phần là số nguyên từ 1 đến 100.");
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) return setFormError("Thời gian chuẩn bị là số phút nguyên từ 1 đến 1440.");
    const details: IngredientDetail[] = [];
    for (const row of ingredients) {
      // recipeIngredients.ts: perPerson ("Theo người", no longer shown) is saved exactly as loaded.
      const result = savedIngredient(row);
      if ("error" in result) return setFormError(result.error);
      details.push(result.detail);
    }
    const steps = draft.steps.filter((step) => step.instruction.trim());
    if (steps.length > MAX_STEPS) return setFormError(`Tối đa ${MAX_STEPS} bước.`);
    const stepBodies = [];
    for (const [position, step] of steps.entries()) {
      const hasTime = step.minutes.trim() !== "" || step.seconds.trim() !== "";
      const total = Number(step.minutes || 0) * 60 + Number(step.seconds || 0);
      if (hasTime && (!Number.isInteger(total) || total < 0 || total > MAX_STEP_SECONDS)) return setFormError(`Bước ${position + 1}: thời gian từ 0 đến 120 phút.`);
      stepBodies.push({
        order: position + 1,
        instruction: step.instruction.trim(),
        durationSeconds: hasTime ? total : null,
        // Quantity and unit come from the dish's ingredient list.
        ingredients: step.ingredients.flatMap((name) => details.filter((detail) => detail.name === name).slice(0, 1)),
      });
    }
    const body = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      imageUrl: draft.imageUrl.trim() || null,
      mealTypes: draft.mealTypes,
      role: draft.role === "none" ? null : draft.role,
      cuisine: draft.cuisine,
      calories, servings, preparationMinutes: minutes,
      ingredients: details.map((detail) => detail.name),
      ingredientDetails: details,
      // Untouched dishes without steps keep steps = null, so recipe-service can still add the starter steps.
      ...(stepBodies.length > 0 || draft.hadSteps ? { steps: stepBodies } : {}),
    };
    // A new dish whose name is already in the catalog: open that one, or still create a new one.
    const duplicate = draft.id ? null : findDuplicate(draft.name, allRecipes);
    if (duplicate) {
      const choice = await choose(duplicateDialog(duplicate.name));
      if (choice === "cancel") { setFormError(null); setImageLoadFailed(false); setDraft(toDraft(duplicate)); return; }
      if (choice !== "confirm") return;
    }
    setSaving(true); setFormError(null);
    try {
      const saved = draft.id ? await api.put<Recipe>(`/api/recipes/${encodeURIComponent(draft.id)}`, body) : await api.post<Recipe>("/api/recipes", body);
      // The photo of a new dish is uploaded once it exists (admin-service stores it, recipe-service keeps the link).
      let photoFailed = false;
      if (!draft.id && pendingPhoto && accessToken) await uploadRecipeImage(accessToken, saved.id, pendingPhoto).catch(() => { photoFailed = true; });
      setNotice(photoFailed ? "Đã lưu món, nhưng chưa tải được ảnh. Mở lại để chọn ảnh." : null);
      setDraft(null);
      void load();
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  /** "Ẩn món": isActive=false (never deleted); users and menu suggestions no longer see it. */
  const setActiveFlag = async (recipe: Recipe, isActive: boolean) => {
    setAllRecipes((current) => current.map((entry) => (entry.id === recipe.id ? { ...entry, isActive } : entry)));
    try {
      await api.put<Recipe>(`/api/recipes/${encodeURIComponent(recipe.id)}`, { isActive });
    } catch (caught) {
      setAllRecipes((current) => current.map((entry) => (entry.id === recipe.id ? recipe : entry)));
      setError(errorMessage(caught));
    }
  };

  // "Ẩn" / "Xóa" in the edit form. Delete is refused (409 IN_USE) while saved menus or dislike history use the dish;
  // the admin can hide it instead. Afterwards the form closes and the list reloads (the page is kept when it exists).
  const hideRecipe = async (id: string) => { await api.put<Recipe>(`/api/recipes/${encodeURIComponent(id)}`, { isActive: false }); };
  const runFormAction = async (action: () => Promise<boolean>) => {
    setRemoving(true); setFormError(null);
    try {
      if (await action()) { setDraft(null); void load(); }
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setRemoving(false);
    }
  };
  const hideDraft = (current: Draft) => runFormAction(async () => { if (current.id) await hideRecipe(current.id); return true; });
  const deleteDraft = (current: Draft) => runFormAction(async () => {
    const id = current.id;
    if (!id) return false;
    const result = await safeDelete({
      confirm,
      name: current.name.trim() || "món này",
      inUseText: "Món này đang được dùng nên không xóa được. Bạn có thể ẩn nó.",
      remove: () => api.delete(`/api/recipes/${encodeURIComponent(id)}`),
      hide: current.isActive === false ? undefined : () => hideRecipe(id),
    });
    if (result.kind === "inUse") setFormError(result.message);
    return result.kind === "deleted" || result.kind === "hidden";
  });

  const showState = loading || Boolean(error && recipes.length === 0);
  const goToPage = (next: number) => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setPage(next);
  };
  const updateIngredient = (key: string, change: Partial<IngredientDraft>) =>
    setDraft((current) => current && { ...current, ingredients: current.ingredients.map((row) => (row.key === key ? { ...row, ...change } : row)) });
  const updateStep = (key: string, change: Partial<StepDraft>) =>
    setDraft((current) => current && { ...current, steps: current.steps.map((step) => (step.key === key ? { ...step, ...change } : step)) });
  const moveStep = (key: string, direction: -1 | 1) =>
    setDraft((current) => {
      if (!current) return current;
      const from = current.steps.findIndex((step) => step.key === key);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.steps.length) return current;
      const steps = [...current.steps];
      [steps[from], steps[to]] = [steps[to], steps[from]];
      return { ...current, steps };
    });
  const toggleMeal = (meal: string) =>
    setDraft((current) => current && { ...current, mealTypes: current.mealTypes.includes(meal) ? current.mealTypes.filter((entry) => entry !== meal) : [...current.mealTypes, meal] });

  const toolbar = (
    <View>
      <AdminListHeader placeholder="Nhập tên món..." searchLabel="Tìm món ăn" search={search} onSearch={setSearch}
        addLabel="Thêm món" onAdd={() => { setFormError(null); setImageLoadFailed(false); setDraft(emptyDraft()); }} />
      {notice ? <View style={local.notice} accessibilityLiveRegion="polite"><AppText variant="bodySmall" color={colors.success}>{notice}</AppText></View> : null}
      {error && !showState ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );

  return (
    <View style={[styles.screen, { paddingHorizontal: gutter }]}>
      {/* Search and add stay pinned above the list (like Kho / Đi chợ); the pager ends the list. */}
      <PinnedHeader>{toolbar}</PinnedHeader>
      <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        style={local.flex}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets
        data={showState ? [] : pageItems}
        key={`cols-${columns}`}
        numColumns={columns}
        onLayout={grid.onLayout}
        columnWrapperStyle={columns > 1 ? { gap: grid.gap } : undefined}
        keyExtractor={(item) => item.id}
        contentContainerStyle={local.listContent}
        ref={listRef}
        refreshControl={showState ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
        ListFooterComponent={showState || recipes.length === 0 ? undefined : (
          <View style={local.footer}>
            <AppText variant="caption" style={local.pageInfo}>Trang {shownPage} / {totalPages} · {recipes.length} món</AppText>
            <AdminPager page={shownPage} totalPages={totalPages} onChange={goToPage} disabled={loading} />
          </View>
        )}
        ListEmptyComponent={showState
          ? <ScreenState loading={loading} error={error} onRetry={() => void load()} />
          : <ScreenState empty emptyIcon={term ? SearchX : CookingPot} emptyText={term ? "Không tìm thấy món ăn." : "Chưa có món ăn nào. Bấm “Thêm” để tạo."} />}
        renderItem={({ item }) => (
          <View style={[styles.card, local.card, { maxWidth: grid.cellWidth, opacity: item.isActive ? 1 : 0.6 }]}>
            {/* One compact row: tap to edit (pencil), the active switch next to it; hidden recipes are dimmed. */}
            <View style={local.cardRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Sửa ${item.name}`}
                onPress={() => { setFormError(null); setImageLoadFailed(false); setDraft(toDraft(item)); }}
                style={({ pressed }) => [styles.spaceBetween, local.editArea, local.flex, pressed && styles.pressed]}
              >
                <RemoteImage uri={item.imageUrl} size={48} />
                <View style={[local.flex, local.rowText]}>
                  <Text style={styles.title} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.muted}>{item.calories !== null ? `${Math.round(item.calories)} kcal/phần` : "Chưa có calo"}</Text>
                </View>
                <AppIcon icon={Pencil} size="sm" color={colors.muted} />
              </Pressable>
              <Switch accessibilityLabel={`${item.name}: ${item.isActive ? "đang dùng" : "đã ẩn"}`} value={item.isActive} onValueChange={(value) => void setActiveFlag(item, value)} trackColor={{ true: colors.primary, false: colors.border }} />
            </View>
          </View>
        )}
      />

      <Modal visible={draft !== null} animationType="slide" transparent={isWide} onRequestClose={() => setDraft(null)}>
        <SafeAreaView style={[local.modalBackdrop, { backgroundColor: isWide ? colors.overlay : colors.background }]}>
          <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[local.modalCard, { borderRadius: isWide ? 16 : 0 }]}>
            <View style={[styles.spaceBetween, local.modalHeader]}>
              <Text style={[styles.headline, local.flex]} accessibilityRole="header">{draft?.id ? "Sửa món ăn" : "Thêm món ăn"}</Text>
              <IconButton icon={X} accessibilityLabel="Đóng" onPress={() => setDraft(null)} />
            </View>
            {draft ? (
              <>
                {aiInfo ? (
                  <View style={local.aiBox} accessibilityLiveRegion="polite">
                    {aiInfo.note ? <AppText variant="bodySmall" color={colors.warning}>{aiInfo.note}</AppText> : <AppText variant="bodySmall" color={colors.primary}>Đã điền gợi ý AI. Kiểm tra và sửa trước khi lưu.{aiInfo.confidence ? ` ${aiInfo.confidence}.` : ""}</AppText>}
                    {aiInfo.aiLines ? <AppText variant="caption">Nguyên liệu và các bước nấu là gợi ý AI.</AppText> : null}
                    {aiInfo.unmatched.length > 0 ? <AppText variant="caption">Chưa có trong danh mục (chưa thêm): {aiInfo.unmatched.join(", ")}</AppText> : null}
                    {aiInfo.notes ? <AppText variant="caption">{aiInfo.notes}</AppText> : null}
                  </View>
                ) : null}
                <AdminPhotoField
                  imageUrl={draft.imageUrl.trim() || null}
                  pending={pendingPhoto}
                  busy={photoBusy}
                  onPicked={(photo) => void pickPhoto(photo)}
                  hint={!draft.id && pendingPhoto ? "Ảnh sẽ được tải lên khi bấm Lưu." : null}
                />
                <Field
                  label="Hoặc dán link ảnh (https://...)"
                  value={draft.imageUrl}
                  onChangeText={(imageUrl) => { setImageLoadFailed(false); setDraft({ ...draft, imageUrl }); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="https://..."
                  maxLength={2048}
                />
                {draft.imageUrl.trim() && !isGatewayImage(draft.imageUrl) ? (
                  looksLikeImageUrl(draft.imageUrl) ? (
                    <View style={[styles.row, local.preview]}>
                      <RemoteImage uri={draft.imageUrl.trim()} size={72} accessibilityLabel="Xem trước ảnh" onLoadError={() => setImageLoadFailed(true)} onLoad={() => setImageLoadFailed(false)} />
                      {imageLoadFailed ? <AppText variant="caption" color={colors.warning} style={local.flex}>Không tải được ảnh, kiểm tra lại link</AppText> : null}
                    </View>
                  ) : <AppText variant="caption" color={colors.danger}>{imageUrlError(draft.imageUrl)}</AppText>
                ) : null}
                <Field label={aiLabel("Tên món *", "name", draft.name)} value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} maxLength={160} />
                <Field label="Mô tả" value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} multiline maxLength={2000} />
                <View style={local.formBlock}>
                  <AppText variant="bodySmall" color={colors.muted}>Bữa ăn</AppText>
                  <View style={styles.wrapRow} accessibilityLabel="Bữa ăn">
                    {MEALS.map((meal) => {
                      const selected = draft.mealTypes.includes(meal.value);
                      return (
                        <Pressable key={meal.value} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={meal.label} onPress={() => toggleMeal(meal.value)}
                          style={({ pressed }) => [styles.segment, selected && styles.segmentSelected, pressed && !selected && styles.segmentPressed]}>
                          <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{meal.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View style={[styles.wrapRow, local.formBlock]}>
                  <Dropdown<string> label="Loại món" value={draft.role} options={ROLE_OPTIONS} onChange={(role) => setDraft({ ...draft, role })} />
                  <Dropdown<string> label={aiLabel("Ẩm thực", "cuisine", draft.cuisine)} value={draft.cuisine} options={CUISINE_OPTIONS} onChange={(cuisine) => setDraft({ ...draft, cuisine })} />
                </View>
                <View style={styles.wrapRow}>
                  <View style={local.third}><Field label={aiLabel("Calo / phần", "calories", draft.calories)} keyboardType="decimal-pad" value={draft.calories} onChangeText={(calories) => setDraft({ ...draft, calories })} /></View>
                  <View style={local.third}><Field label={aiLabel("Số phần", "servings", draft.servings)} keyboardType="number-pad" value={draft.servings} onChangeText={(servings) => setDraft({ ...draft, servings: servings.replace(/[^0-9]/g, "") })} /></View>
                  <View style={local.third}><Field label="Chuẩn bị (phút)" keyboardType="number-pad" value={draft.preparationMinutes} onChangeText={(preparationMinutes) => setDraft({ ...draft, preparationMinutes: preparationMinutes.replace(/[^0-9]/g, "") })} /></View>
                </View>
                <View style={local.formBlock}>
                  <AppText variant="bodySmall" color={colors.muted}>Nguyên liệu *</AppText>
                  {draft.ingredients.map((row, index) => (
                    <View key={row.key} style={[styles.wrapRow, local.ingredientRow]}>
                      <View style={local.ingredientName}><Field label={`Nguyên liệu ${index + 1}`} value={row.name} onChangeText={(name) => updateIngredient(row.key, { name })} maxLength={120} /></View>
                      <View style={local.ingredientQty}><Field label="Số lượng" placeholder="300 hoặc vừa ăn" value={row.quantity} onChangeText={(quantity) => updateIngredient(row.key, { quantity })} maxLength={40} /></View>
                      <View style={local.unitPill}>
                        <Dropdown<InventoryUnit> label="Đơn vị" value={row.unit} options={UNIT_OPTIONS} onChange={(unit) => updateIngredient(row.key, { unit })} />
                      </View>
                      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: row.isSeasoning }} accessibilityLabel={`Nguyên liệu ${index + 1} là gia vị`}
                        onPress={() => updateIngredient(row.key, { isSeasoning: !row.isSeasoning })}
                        style={({ pressed }) => [styles.segment, local.unitPill, row.isSeasoning && styles.segmentSelected, pressed && !row.isSeasoning && styles.segmentPressed]}>
                        <Text style={[styles.segmentText, row.isSeasoning && styles.segmentTextSelected]}>Gia vị</Text>
                      </Pressable>
                      {/* "Theo người" (perPerson) is not editable here any more; the stored value is kept and saved as is. */}
                      <IconButton icon={Trash2} accessibilityLabel={`Bỏ nguyên liệu ${index + 1}`} color={colors.danger}
                        onPress={() => setDraft({ ...draft, ingredients: draft.ingredients.length > 1 ? draft.ingredients.filter((entry) => entry.key !== row.key) : [newIngredient()] })} />
                    </View>
                  ))}
                  <Button variant="secondary" label="Thêm nguyên liệu" icon={Plus} onPress={() => setDraft({ ...draft, ingredients: [...draft.ingredients, newIngredient()] })} />
                </View>
                <View style={local.formBlock}>
                  <AppText variant="bodySmall" color={colors.muted}>Các bước nấu ({draft.steps.length}/{MAX_STEPS})</AppText>
                  {draft.steps.map((step, index) => {
                    const dishIngredients = recipeIngredientNames(draft.ingredients);
                    return (
                      <View key={step.key} style={[styles.card, local.stepCard]}>
                        <View style={styles.spaceBetween}>
                          <AppText variant="label">Bước {index + 1}</AppText>
                          <View style={styles.row}>
                            <IconButton icon={ChevronUp} accessibilityLabel={`Đưa bước ${index + 1} lên`} onPress={() => moveStep(step.key, -1)} />
                            <IconButton icon={ChevronDown} accessibilityLabel={`Đưa bước ${index + 1} xuống`} onPress={() => moveStep(step.key, 1)} />
                            <IconButton icon={Trash2} accessibilityLabel={`Bỏ bước ${index + 1}`} color={colors.danger} onPress={() => setDraft({ ...draft, steps: draft.steps.filter((entry) => entry.key !== step.key) })} />
                          </View>
                        </View>
                        <Field label="Việc cần làm" placeholder="Ví dụ: Phi thơm tỏi" value={step.instruction} onChangeText={(instruction) => updateStep(step.key, { instruction })} multiline maxLength={500} />
                        <View style={styles.wrapRow}>
                          <View style={local.third}><Field label="Phút" keyboardType="number-pad" placeholder="0" value={step.minutes} onChangeText={(minutes) => updateStep(step.key, { minutes: minutes.replace(/[^0-9]/g, "") })} /></View>
                          <View style={local.third}><Field label="Giây" keyboardType="number-pad" placeholder="0" value={step.seconds} onChangeText={(seconds) => updateStep(step.key, { seconds: seconds.replace(/[^0-9]/g, "") })} /></View>
                        </View>
                        {/* Only this step's ingredients, as tags; "+ Thêm nguyên liệu" picks from the rest of the recipe. */}
                        <StepIngredientTags stepNumber={index + 1} recipeNames={dishIngredients} value={step.ingredients} onChange={(ingredients) => updateStep(step.key, { ingredients })} />
                      </View>
                    );
                  })}
                  <Button variant="secondary" label="Thêm bước" icon={Plus} disabled={draft.steps.length >= MAX_STEPS} onPress={() => setDraft({ ...draft, steps: [...draft.steps, newStep()] })} />
                </View>
              </>
            ) : null}
            {formError ? <Text style={styles.errorText} accessibilityLiveRegion="assertive">{formError}</Text> : null}
            <View style={[styles.wrapRow, local.modalActions]}>
              {draft?.id ? (
                <View style={[styles.wrapRow, local.destructiveActions]}>
                  {draft.isActive !== false ? <Button variant="secondary" label="Ẩn" icon={EyeOff} onPress={() => void hideDraft(draft)} disabled={removing || saving} /> : null}
                  <Button variant="danger" label="Xóa" icon={Trash2} accessibilityLabel={`Xóa vĩnh viễn ${draft.name}`} onPress={() => void deleteDraft(draft)} busy={removing} disabled={saving} />
                </View>
              ) : null}
              <Button variant="secondary" label="Hủy" onPress={() => setDraft(null)} />
              <Button label="Lưu" icon={Save} onPress={() => void save()} busy={saving} disabled={removing} />
            </View>
          </ScrollView>
          {dialog}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const local = StyleSheet.create({
  listContent: { gap: 12, paddingBottom: 24 },
  footer: { gap: 4, paddingTop: 4 },
  pageInfo: { textAlign: "center" },
  card: { flex: 1, gap: 8 },
  editArea: { minHeight: 44 },
  cardRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  rowText: { gap: 4 },
  preview: { marginBottom: 8 },
  flex: { flex: 1, minWidth: 0 },
  formBlock: { gap: 6, marginBottom: 10 },
  third: { flexBasis: 120, flexGrow: 1 },
  ingredientRow: { alignItems: "flex-end" },
  ingredientName: { flexBasis: 160, flexGrow: 2 },
  ingredientQty: { flexBasis: 90, flexGrow: 1 },
  unitPill: { marginBottom: 10 },
  stepCard: { gap: 6 },
  modalBackdrop: { flex: 1, justifyContent: "center" },
  aiBox: { backgroundColor: colors.primarySoft, borderRadius: 8, gap: 4, marginBottom: 10, padding: 12 },
  notice: { backgroundColor: colors.successSoft, borderRadius: 8, marginBottom: 8, padding: 12 },
  modalCard: { alignSelf: "center", backgroundColor: colors.background, gap: 4, maxWidth: 640, padding: 20, width: "100%" },
  modalHeader: { marginBottom: 8 },
  modalActions: { justifyContent: "flex-end", marginTop: 12 },
  // "Ẩn" / "Xóa" sit on the left, away from "Lưu".
  destructiveActions: { marginRight: "auto" },
});
