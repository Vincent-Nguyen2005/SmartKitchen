/**
 * CLIP zero-shot image classification on the server's CPU (Transformers.js, quantized clip-vit-base-patch32).
 * The model files are downloaded when the Docker image is built (dist/scripts/download-clip-model.js) and loaded
 * offline from CLIP_MODEL_DIR: a request never downloads anything. Text embeddings of the labels are computed once
 * per label list and reused; each photo costs one vision pass.
 *
 * `@huggingface/transformers` is loaded lazily; when it (or the model) is missing, classify() throws
 * ClipUnavailableError and the caller falls back to Gemini or to "no suggestion".
 */
export const CLIP_MODEL_ID = process.env.CLIP_MODEL_ID || "Xenova/clip-vit-base-patch32";
export const CLIP_DTYPE = "q8";
/** Same scale CLIP was trained with (logit_scale = 100). */
const LOGIT_SCALE = 100;

export class ClipUnavailableError extends Error {}

/** Probabilities over `labels` (softmax of scaled cosine similarity), in label order. */
export type ImageClassifier = (image: Buffer, labels: string[]) => Promise<number[]>;

type Tensor = { data: Float32Array; dims: number[] };
type Models = {
  tokenizer: (texts: string[], options: object) => unknown;
  textModel: (inputs: unknown) => Promise<{ text_embeds: Tensor }>;
  processor: (image: unknown) => Promise<unknown>;
  visionModel: (inputs: unknown) => Promise<{ image_embeds: Tensor }>;
  readImage: (image: Buffer) => Promise<unknown>;
};

let modelsPromise: Promise<Models> | null = null;
let textCache: { key: string; vectors: Float32Array[] } | null = null;

// A variable module name keeps TypeScript from requiring the package at build time (it is optional).
const TRANSFORMERS = "@huggingface/transformers";

async function loadModels(): Promise<Models> {
  let lib: Record<string, any>;
  try {
    lib = await import(TRANSFORMERS);
  } catch {
    throw new ClipUnavailableError("@huggingface/transformers is not installed");
  }
  lib.env.cacheDir = process.env.CLIP_MODEL_DIR || "/app/models";
  lib.env.allowRemoteModels = false;
  try {
    const [tokenizer, textModel, processor, visionModel] = await Promise.all([
      lib.AutoTokenizer.from_pretrained(CLIP_MODEL_ID),
      lib.CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL_ID, { dtype: CLIP_DTYPE }),
      lib.AutoProcessor.from_pretrained(CLIP_MODEL_ID),
      lib.CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL_ID, { dtype: CLIP_DTYPE }),
    ]);
    return { tokenizer, textModel, processor, visionModel, readImage: (image: Buffer) => lib.RawImage.fromBlob(new Blob([new Uint8Array(image)])) };
  } catch (error) {
    throw new ClipUnavailableError(`CLIP model could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const models = (): Promise<Models> => {
  modelsPromise ??= loadModels().catch((error) => { modelsPromise = null; throw error; });
  return modelsPromise;
};

const rows = (tensor: Tensor): Float32Array[] => {
  const [count, dim] = tensor.dims.length === 2 ? tensor.dims : [1, tensor.dims[0]];
  return Array.from({ length: count }, (_, row) => normalize(tensor.data.slice(row * dim, (row + 1) * dim)));
};

export function normalize(vector: Float32Array): Float32Array {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const length = Math.sqrt(sum) || 1;
  return vector.map((value) => value / length);
}

/** Softmax over LOGIT_SCALE × cosine similarity (vectors already normalized). */
export function probabilities(image: Float32Array, texts: Float32Array[]): number[] {
  const logits = texts.map((text) => LOGIT_SCALE * text.reduce((sum, value, index) => sum + value * image[index], 0));
  const max = Math.max(...logits);
  const exps = logits.map((logit) => Math.exp(logit - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

export const clipClassifier: ImageClassifier = async (image, labels) => {
  if (labels.length === 0) return [];
  const loaded = await models();
  const key = labels.join("\n");
  if (textCache?.key !== key) {
    const { text_embeds } = await loaded.textModel(loaded.tokenizer(labels.map((label) => `a photo of ${label}`), { padding: true, truncation: true }));
    textCache = { key, vectors: rows(text_embeds) };
  }
  return probabilities(await embedImage(image), textCache.vectors);
};

// The same photo is embedded once per request: text scores and image-to-image scores share the vector.
const imageVectors = new WeakMap<Buffer, Promise<Float32Array>>();

/** Normalized CLIP image embedding (one vision pass); cached per Buffer object. */
export function embedImage(image: Buffer): Promise<Float32Array> {
  let vector = imageVectors.get(image);
  if (!vector) {
    vector = models().then(async (loaded) => {
      const { image_embeds } = await loaded.visionModel(await loaded.processor(await loaded.readImage(image)));
      return rows(image_embeds)[0];
    });
    vector.catch(() => imageVectors.delete(image));
    imageVectors.set(image, vector);
  }
  return vector;
}
