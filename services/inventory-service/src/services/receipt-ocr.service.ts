import { createWorker } from "tesseract.js";

export type ReceiptCandidate = { name: string; quantity: number; unit: "PIECE"; sourceText: string };

let workerPromise: ReturnType<typeof createWorker> | undefined;
let queue: Promise<unknown> = Promise.resolve();

const getWorker = async () => {
  if (!workerPromise) {
    const langPath = process.env.TESSERACT_LANG_PATH?.trim();
    workerPromise = createWorker(process.env.TESSERACT_LANGUAGES || "vie+eng", 1, langPath ? { langPath } : {});
    workerPromise.catch(() => { workerPromise = undefined; });
  }
  return workerPromise;
};

const ignoredReceiptLine = /^(?:subtotal|sub total|total|grand total|amount|cash|change|payment|thank|customer|phone|address|date|time|invoice|receipt|vat|tax|tổng|cộng|thành tiền|tiền mặt|tiền khách|tiền thừa|khách trả|mã hóa đơn|số hóa đơn|ngày|giờ)\b/i;
const trailingAmount = /\s+(?:\d{1,3}(?:[.,]\d{3})+|\d{4,})(?:[.,]\d{1,2})?\s*(?:₫|đ|vnd)?$/i;
const hasLetters = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;

export const parseReceiptLines = (rawText: string): ReceiptCandidate[] => {
  const candidates: ReceiptCandidate[] = [];
  for (const sourceText of rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
    const normalized = sourceText.replace(/\s+/g, " ");
    if (normalized.length < 3 || normalized.length > 180 || ignoredReceiptLine.test(normalized)) continue;
    const hasPrice = trailingAmount.test(normalized);
    let productText = normalized.replace(trailingAmount, "").trim();
    if (!hasPrice) productText = normalized;
    if (ignoredReceiptLine.test(productText) || !hasLetters.test(productText)) continue;

    let quantity = 1;
    const quantityPrefix = productText.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|×)\s*(.+)$/i);
    if (quantityPrefix) {
      const parsedQuantity = Number(quantityPrefix[1].replace(",", "."));
      if (Number.isFinite(parsedQuantity) && parsedQuantity > 0 && parsedQuantity <= 1000) quantity = parsedQuantity;
      productText = quantityPrefix[2].trim();
    }
    productText = productText.replace(/\s+(?:sku|mã)\s*[:#-]?\s*[\w-]+$/i, "").trim();
    if (productText.length < 2 || !hasLetters.test(productText)) continue;
    candidates.push({ name: productText, quantity, unit: "PIECE", sourceText: normalized });
    if (candidates.length >= 40) break;
  }
  return candidates;
};

export class ReceiptOcrService {
  static async recognize(image: Buffer): Promise<{ rawText: string; items: ReceiptCandidate[] }> {
    const task = queue.then(async () => {
      const worker = await getWorker();
      const result = await worker.recognize(image);
      const rawText = result.data.text.trim();
      return { rawText, items: parseReceiptLines(rawText) };
    });
    queue = task.then(() => undefined, () => undefined);
    return task;
  }

  static async shutdown(): Promise<void> {
    const current = workerPromise;
    workerPromise = undefined;
    if (current) await current.then((worker) => worker.terminate()).catch(() => undefined);
  }
}
