/**
 * Image build step (Dockerfile): downloads the quantized CLIP model into CLIP_MODEL_DIR so photo recognition never
 * downloads anything at request time. When @huggingface/transformers is not installed, it prints a note and exits 0
 * (photo recognition then uses the Gemini fallback only). Always creates the directory so the image COPY step works.
 */
import { mkdirSync } from "node:fs";
import { CLIP_DTYPE, CLIP_MODEL_ID } from "../services/photo-recognition/clip";

const TRANSFORMERS = "@huggingface/transformers";

async function main(): Promise<void> {
  const dir = process.env.CLIP_MODEL_DIR || "/app/models";
  mkdirSync(dir, { recursive: true });
  let lib: Record<string, any>;
  try {
    lib = await import(TRANSFORMERS);
  } catch {
    console.log(`[download-clip-model] ${TRANSFORMERS} is not installed; skipping (photo recognition: Gemini fallback only)`);
    return;
  }
  lib.env.cacheDir = dir;
  lib.env.allowRemoteModels = true;
  await lib.AutoTokenizer.from_pretrained(CLIP_MODEL_ID);
  await lib.AutoProcessor.from_pretrained(CLIP_MODEL_ID);
  await lib.CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL_ID, { dtype: CLIP_DTYPE });
  await lib.CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL_ID, { dtype: CLIP_DTYPE });
  console.log(`[download-clip-model] ${CLIP_MODEL_ID} (${CLIP_DTYPE}) saved to ${dir}`);
}

main().catch((error: unknown) => {
  console.error("[download-clip-model] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
