import { Platform } from "react-native";
import { File } from "expo-file-system";
import { ApiError, gatewayFetch } from "../../services/api";
import { appendPhoto } from "../inventory/photoUpload";
import type { UploadPhoto } from "../inventory/inventoryApi";
import type { CreateKind, IngredientSuggestion, RecipeSuggestion } from "./photoCreate";

/**
 * Admin photo calls (multipart, field "photo"; see inventory/photoUpload.ts for the expo/fetch file part):
 * - suggest: POST /api/admin/ai/suggest?kind=… → validated AI suggestions (nothing stored);
 * - uploadIngredientImage / uploadRecipeImage: set the saved item's image (admin-service re-encodes and stores it).
 */
const photoForm = async (photo: UploadPhoto): Promise<FormData> => {
  const form = new FormData();
  await appendPhoto(form, photo, { isWeb: Platform.OS === "web", readBytes: (uri) => new File(uri).bytes() });
  return form;
};

const send = async (path: string, accessToken: string, photo: UploadPhoto) => {
  const response = await gatewayFetch(path, { method: "POST", body: await photoForm(photo), accessToken, timeoutMs: 60_000 });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body };
};

export type SuggestResult =
  | { status: 200; kind: "ingredient"; suggestion: IngredientSuggestion }
  | { status: 200; kind: "recipe"; suggestion: RecipeSuggestion }
  | { status: number; error: string };

export async function suggestFromPhoto(accessToken: string, kind: CreateKind, photo: UploadPhoto): Promise<SuggestResult> {
  try {
    const { status, body } = await send(`/api/admin/ai/suggest?kind=${kind}`, accessToken, photo);
    if (status === 200) return { status: 200, kind, suggestion: body.suggestion } as SuggestResult;
    return { status, error: typeof body.error === "string" ? body.error : "AI_FAILED" };
  } catch {
    return { status: 0, error: "NETWORK_ERROR" };
  }
}

const upload = async (path: string, accessToken: string, photo: UploadPhoto): Promise<void> => {
  const { status, body } = await send(path, accessToken, photo);
  if (status < 200 || status >= 300) throw new ApiError(typeof body.message === "string" ? body.message : `HTTP ${status}`, status, undefined, typeof body.error === "string" ? body.error : undefined);
};
export const uploadIngredientImage = (accessToken: string, id: string, photo: UploadPhoto) => upload(`/api/admin/ingredients/${encodeURIComponent(id)}/image`, accessToken, photo);
export const uploadRecipeImage = (accessToken: string, id: string, photo: UploadPhoto) => upload(`/api/admin/recipes/${encodeURIComponent(id)}/image`, accessToken, photo);
