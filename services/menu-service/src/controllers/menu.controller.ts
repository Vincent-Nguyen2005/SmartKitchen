import { MealType, PeriodType } from "../../node_modules/.prisma/client-menu";
import axios from "axios";
import { Request, Response } from "express";
import { z } from "zod";
import {
  currentKhoHash,
  autoRefreshMenu,
  createManualMenu,
  deleteMenu,
  findMenu,
  generateMenu,
  listMenus,
  MenuServiceError,
} from "../services/menu.service";

export const generateSchema = z.object({
  periodType: z.nativeEnum(PeriodType).default(PeriodType.WEEK),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  title: z.string().trim().min(1).max(120).optional(),
  preferences: z.record(z.unknown()).optional(),
  constraints: z.record(z.unknown()).optional(),
  recipes: z.array(z.unknown()).optional(),
  /** Family whose Kho the suggestions use (inventory-service checks membership with the caller's token). */
  familyId: z.string().uuid().optional(),
});

export const createMenuSchema = z.object({
  title: z.string().trim().min(1).max(120),
  periodType: z.nativeEnum(PeriodType).default(PeriodType.WEEK),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  items: z.array(z.object({
    recipeId: z.string().optional(),
    dishName: z.string().trim().min(1).max(160),
    mealType: z.nativeEnum(MealType).default(MealType.LUNCH),
    dayOfWeek: z.number().int().min(1).max(7),
    calories: z.number().min(0).optional(),
  })).default([]),
});

export const refreshSchema = z.object({
  inventoryItems: z.array(z.unknown()).min(1),
  recipes: z.array(z.unknown()).optional(),
});

export const checkoutSchema = z.object({
  orderId: z.string().trim().min(1).max(128),
  amount: z.number().finite().int().positive().max(Number.MAX_SAFE_INTEGER / 100),
  provider: z.enum(["VNPAY", "MOMO"]),
});

function authenticatedUserId(request: Request, response: Response): string | undefined {
  const userId = request.header("x-user-id")?.trim();
  if (!userId) response.status(401).json({ error: "Authentication required" });
  return userId || undefined;
}

function handleError(error: unknown, response: Response): void {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "Invalid request", details: error.issues });
    return;
  }
  if (error instanceof MenuServiceError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }
  process.stderr.write(`Menu request failed: ${String(error)}\n`);
  response.status(500).json({ error: "Internal server error" });
}

export async function generateMenuController(request: Request, response: Response): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const input = generateSchema.parse(request.body);
    response.status(201).json(await generateMenu({
      ...input,
      periodType: input.periodType || PeriodType.WEEK,
      userId,
      authorization: request.header("authorization") ?? undefined,
    }));
  } catch (error) {
    console.error("Generate Menu Error:", error);
    handleError(error, response);
  }
}

export async function createMenuController(request: Request, response: Response): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const input = createMenuSchema.parse(request.body);
    response.status(201).json(await createManualMenu(userId, {
      ...input,
      title: String(input.title),
    }));
  } catch (error) {
    handleError(error, response);
  }
}

const dayParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((value) => new Date(`${value}T00:00:00.000Z`));
export const listRangeSchema = z.object({ from: dayParam.optional(), to: dayParam.optional() })
  .refine((query) => (query.from === undefined) === (query.to === undefined), "from and to go together")
  .refine((query) => !query.from || !query.to || (query.from <= query.to && query.to.getTime() - query.from.getTime() <= 62 * 86_400_000), "to must be on or after from, at most 62 days later");

export async function listMenusController(request: Request, response: Response): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const { from, to } = listRangeSchema.parse(request.query);
    response.json(await listMenus(userId, undefined, from && to ? { from, to } : undefined));
  } catch (error) {
    handleError(error, response);
  }
}

export async function getMenuController(request: Request, response: Response): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const menu = await findMenu(userId, request.params.id);
    if (!menu) {
      response.status(404).json({ error: "Menu not found" });
      return;
    }
    response.json(menu);
  } catch (error) {
    handleError(error, response);
  }
}

export async function deleteMenuController(request: Request, response: Response): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const deleted = await deleteMenu(userId, request.params.id);
    if (!deleted) {
      response.status(404).json({ error: "Menu not found" });
      return;
    }
    response.status(204).end();
  } catch (error) {
    handleError(error, response);
  }
}

/** GET /kho-hash?familyId: the current Kho snapshot hash, to tell whether today's menu is stale. */
export async function khoHashController(request: Request, response: Response): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const { familyId } = z.object({ familyId: z.string().uuid() }).parse(request.query);
    response.json({ khoHash: await currentKhoHash(familyId, request.header("authorization") ?? undefined) });
  } catch (error) {
    handleError(error, response);
  }
}

export async function autoRefreshController(request: Request, response: Response): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const input = refreshSchema.parse(request.body);
    response.json(await autoRefreshMenu(userId, input));
  } catch (error) {
    handleError(error, response);
  }
}

export async function checkoutController(request: Request, response: Response): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const input = checkoutSchema.parse(request.body);
    const paymentServiceUrl = (process.env.PAYMENT_SERVICE_URL || "http://localhost:4009").replace(/\/+$/, "");
    const authorization = request.header("authorization");
    const result = await axios.post<{
      paymentId: string;
      paymentUrl: string;
      status: string;
    }>(`${paymentServiceUrl}/api/payments/create`, {
      orderId: input.orderId,
      amount: input.amount,
      provider: input.provider,
    }, {
      headers: authorization ? { Authorization: authorization } : {},
      timeout: 10_000,
    });
    response.status(201).json({
      order: { id: input.orderId },
      paymentId: result.data.paymentId,
      paymentUrl: result.data.paymentUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: "Invalid request", details: error.issues });
      return;
    }
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      console.error("[menu-service] payment-service checkout request failed:", error.message);
      if (status && status < 500) {
        response.status(status).json(error.response?.data ?? { error: "Payment request was rejected" });
        return;
      }
      response.status(502).json({ error: "Payment service is unavailable" });
      return;
    }
    console.error("[menu-service] checkout failed:", error);
    response.status(500).json({ error: "Internal server error" });
  }
}