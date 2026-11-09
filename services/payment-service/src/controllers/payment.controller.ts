import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { PaymentProvider, PaymentStatus } from "../../node_modules/.prisma/client-payment";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { AuthenticatedPaymentRequest } from "../middleware/auth.middleware";

export interface CreatePaymentDTO {
  orderId: string;
  amount: number;
  provider: PaymentProvider;
}

const createPaymentSchema = z.object({
  orderId: z.string().trim().min(1).max(128),
  amount: z.number().finite().int().positive().max(Number.MAX_SAFE_INTEGER / 100),
  provider: z.nativeEnum(PaymentProvider),
});

class PaymentRequestError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "PaymentRequestError";
  }
}

function authenticatedUserId(request: Request): string {
  const authUser = (request as Request & {
    authUser?: AuthenticatedPaymentRequest["authUser"];
  }).authUser;
  if (!authUser) throw new PaymentRequestError("Authentication required", 401);
  return authUser.userId;
}

type StringParams = Record<string, string>;

const stringQuery = (query: Request["query"]): StringParams => Object.fromEntries(
  Object.entries(query).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []),
);

function publicBaseUrl(request: Request): string {
  const configured = process.env.PAYMENT_PUBLIC_BASE_URL?.trim();
  const forwardedHost = request.header("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.get("host");
  const forwardedProto = request.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || request.protocol;
  const baseUrl = configured || (host ? `${protocol}://${host}` : "");
  if (!baseUrl) throw new PaymentRequestError("Payment callback URL is not configured", 503);
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
      throw new PaymentRequestError("Payment callback URL must use HTTPS in production", 503);
    }
    return url.origin;
  } catch (error) {
    if (error instanceof PaymentRequestError) throw error;
    throw new PaymentRequestError("Payment callback URL is invalid", 503);
  }
}

function callbackUrls(request: Request): { vnpayReturnUrl: string; momoIpnUrl: string } {
  const baseUrl = publicBaseUrl(request);
  return {
    vnpayReturnUrl: `${baseUrl}/api/payments/callback`,
    momoIpnUrl: `${baseUrl}/api/payments/callback/momo`,
  };
}

function hmac(secret: string, data: string, algorithm: "sha256" | "sha512"): string {
  return createHmac(algorithm, secret).update(data, "utf8").digest("hex");
}

function safeHexEqual(actual: string, expected: string): boolean {
  if (!/^[0-9a-f]+$/i.test(actual) || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function sortedQueryString(parameters: StringParams): string {
  return Object.keys(parameters)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(parameters[key])}`)
    .join("&");
}

function createVnpayUrl(
  paymentId: string,
  amount: number,
  request: Request,
): string {
  const terminalCode = process.env.VNPAY_TMN_CODE?.trim();
  const hashSecret = process.env.VNPAY_HASH_SECRET;
  if (!terminalCode || !hashSecret) {
    throw new PaymentRequestError("VNPAY credentials are not configured", 503);
  }

  const { vnpayReturnUrl } = callbackUrls(request);
  const now = new Date();
  const formatDate = (date: Date): string => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((value) => value.type === type)?.value ?? "";
    return `${part("year")}${part("month")}${part("day")}${part("hour")}${part("minute")}${part("second")}`;
  };
  const params: StringParams = {
    vnp_Amount: String(amount * 100),
    vnp_Command: "pay",
    vnp_CreateDate: formatDate(now),
    vnp_CurrCode: "VND",
    vnp_IpAddr: request.ip || "127.0.0.1",
    vnp_Locale: "vn",
    vnp_OrderInfo: `Payment ${paymentId}`,
    vnp_OrderType: "other",
    vnp_ReturnUrl: vnpayReturnUrl,
    vnp_TmnCode: terminalCode,
    vnp_TxnRef: paymentId,
    vnp_Version: "2.1.0",
  };
  const signature = hmac(hashSecret, sortedQueryString(params), "sha512");
  const url = new URL(process.env.VNPAY_PAYMENT_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("vnp_SecureHash", signature);
  return url.toString();
}

function momoCreateSignature(data: {
  accessKey: string;
  amount: string;
  extraData: string;
  ipnUrl: string;
  orderId: string;
  orderInfo: string;
  partnerCode: string;
  redirectUrl: string;
  requestId: string;
  requestType: string;
}): string {
  const signData = [
    `accessKey=${data.accessKey}`,
    `amount=${data.amount}`,
    `extraData=${data.extraData}`,
    `ipnUrl=${data.ipnUrl}`,
    `orderId=${data.orderId}`,
    `orderInfo=${data.orderInfo}`,
    `partnerCode=${data.partnerCode}`,
    `redirectUrl=${data.redirectUrl}`,
    `requestId=${data.requestId}`,
    `requestType=${data.requestType}`,
  ].join("&");
  return hmac(process.env.MOMO_SECRET_KEY || "", signData, "sha256");
}

async function createMomoUrl(
  paymentId: string,
  amount: number,
  request: Request,
): Promise<string> {
  const partnerCode = process.env.MOMO_PARTNER_CODE?.trim();
  const accessKey = process.env.MOMO_ACCESS_KEY?.trim();
  const secretKey = process.env.MOMO_SECRET_KEY;
  if (!partnerCode || !accessKey || !secretKey) {
    throw new PaymentRequestError("MoMo credentials are not configured", 503);
  }
  const { vnpayReturnUrl, momoIpnUrl } = callbackUrls(request);
  const payload = {
    partnerCode,
    accessKey,
    requestId: randomUUID(),
    amount: String(amount),
    orderId: paymentId,
    orderInfo: `Payment ${paymentId}`,
    redirectUrl: vnpayReturnUrl,
    ipnUrl: momoIpnUrl,
    extraData: "",
    requestType: "captureWallet",
    lang: "vi",
  };
  const signature = momoCreateSignature(payload);
  const endpoint = process.env.MOMO_CREATE_URL || "https://test-payment.momo.vn/v2/gateway/api/create";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: globalThis.Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, signature }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new PaymentRequestError(`MoMo payment request failed: ${String(error)}`, 502);
  } finally {
    clearTimeout(timeout);
  }

  const result = await response.json().catch(() => null) as { resultCode?: unknown; payUrl?: unknown } | null;
  if (!response.ok || result?.resultCode !== 0 || typeof result.payUrl !== "string") {
    throw new PaymentRequestError("MoMo did not return a valid payment URL", 502);
  }
  return result.payUrl;
}

function callbackAppUrl(status: PaymentStatus, paymentId: string): string {
  const base = process.env.PAYMENT_APP_RETURN_URL || "smartkitchen://payment-result";
  const url = new URL(base);
  url.searchParams.set("status", status === PaymentStatus.SUCCESS ? "success" : "failed");
  url.searchParams.set("paymentId", paymentId);
  return url.toString();
}

function updatePaymentStatus(
  id: string,
  provider: PaymentProvider,
  amount: number,
  status: PaymentStatus,
  transactionId: string | null,
): Promise<{ count: number }> {
  return prisma.payment.updateMany({
    where: { id, provider, amount, status: PaymentStatus.PENDING },
    data: { status, transactionId },
  });
}

function momoCallbackSignature(parameters: StringParams): string | undefined {
  const required = [
    "accessKey", "amount", "extraData", "message", "orderId", "orderInfo",
    "orderType", "partnerCode", "payType", "requestId", "responseTime",
    "resultCode", "transId",
  ];
  if (required.some((key) => parameters[key] === undefined)) return undefined;
  return [
    `accessKey=${parameters.accessKey}`,
    `amount=${parameters.amount}`,
    `extraData=${parameters.extraData}`,
    `message=${parameters.message}`,
    `orderId=${parameters.orderId}`,
    `orderInfo=${parameters.orderInfo}`,
    `orderType=${parameters.orderType}`,
    `partnerCode=${parameters.partnerCode}`,
    `payType=${parameters.payType}`,
    `requestId=${parameters.requestId}`,
    `responseTime=${parameters.responseTime}`,
    `resultCode=${parameters.resultCode}`,
    `transId=${parameters.transId}`,
  ].join("&");
}

async function processVnpayCallback(parameters: StringParams): Promise<{
  paymentId: string;
  status: PaymentStatus;
}> {
  const secret = process.env.VNPAY_HASH_SECRET;
  const receivedSignature = parameters.vnp_SecureHash;
  const paymentId = parameters.vnp_TxnRef;
  const responseCode = parameters.vnp_ResponseCode;
  const amountValue = Number(parameters.vnp_Amount);
  if (!secret || !receivedSignature || !paymentId || !responseCode || !Number.isSafeInteger(amountValue)) {
    throw new PaymentRequestError("Invalid VNPAY callback", 400);
  }
  if (parameters.vnp_TmnCode !== process.env.VNPAY_TMN_CODE) {
    throw new PaymentRequestError("VNPAY callback merchant does not match", 401);
  }
  const signedParams = Object.fromEntries(
    Object.entries(parameters).filter(([key]) => !["vnp_SecureHash", "vnp_SecureHashType"].includes(key)),
  );
  const expectedSignature = hmac(secret, sortedQueryString(signedParams), "sha512");
  if (!safeHexEqual(receivedSignature, expectedSignature)) {
    throw new PaymentRequestError("VNPAY callback signature is invalid", 401);
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.provider !== PaymentProvider.VNPAY || payment.amount * 100 !== amountValue) {
    throw new PaymentRequestError("Payment does not match the VNPAY callback", 404);
  }
  const status = responseCode === "00" ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
  await updatePaymentStatus(
    payment.id,
    PaymentProvider.VNPAY,
    payment.amount,
    status,
    parameters.vnp_TransactionNo || null,
  );
  const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  return { paymentId: updated.id, status: updated.status };
}

async function processMomoCallback(parameters: StringParams): Promise<{
  paymentId: string;
  status: PaymentStatus;
}> {
  const secret = process.env.MOMO_SECRET_KEY;
  const receivedSignature = parameters.signature;
  const signData = momoCallbackSignature(parameters);
  if (!secret || !receivedSignature || !signData) {
    throw new PaymentRequestError("Invalid MoMo callback", 400);
  }
  if (!safeHexEqual(receivedSignature, hmac(secret, signData, "sha256"))) {
    throw new PaymentRequestError("MoMo callback signature is invalid", 401);
  }
  if (parameters.accessKey !== process.env.MOMO_ACCESS_KEY ||
    parameters.partnerCode !== process.env.MOMO_PARTNER_CODE) {
    throw new PaymentRequestError("MoMo callback merchant does not match", 401);
  }
  const amount = Number(parameters.amount);
  if (!Number.isSafeInteger(amount) || !parameters.orderId) {
    throw new PaymentRequestError("Invalid MoMo callback amount or order ID", 400);
  }
  const payment = await prisma.payment.findUnique({ where: { id: parameters.orderId } });
  if (!payment || payment.provider !== PaymentProvider.MOMO || payment.amount !== amount) {
    throw new PaymentRequestError("Payment does not match the MoMo callback", 404);
  }
  const status = parameters.resultCode === "0" ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
  await updatePaymentStatus(
    payment.id,
    PaymentProvider.MOMO,
    payment.amount,
    status,
    parameters.transId || null,
  );
  const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  return { paymentId: updated.id, status: updated.status };
}

function handleControllerError(error: unknown, response: Response, action: string): void {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "Invalid request", details: error.issues });
    return;
  }
  if (error instanceof PaymentRequestError) {
    if (error.statusCode >= 500) console.error(`[payment-service] ${action}:`, error);
    response.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error(`[payment-service] ${action} failed:`, error);
  response.status(500).json({ error: "Internal server error" });
}

export async function createPayment(
  request: Request<Record<string, string>, unknown, CreatePaymentDTO>,
  response: Response,
): Promise<void> {
  try {
    const input = createPaymentSchema.parse(request.body);
    const userId = authenticatedUserId(request);
    if (input.provider === PaymentProvider.VNPAY) {
      if (!process.env.VNPAY_TMN_CODE || !process.env.VNPAY_HASH_SECRET) {
        throw new PaymentRequestError("VNPAY credentials are not configured", 503);
      }
    } else if (!process.env.MOMO_PARTNER_CODE || !process.env.MOMO_ACCESS_KEY || !process.env.MOMO_SECRET_KEY) {
      throw new PaymentRequestError("MoMo credentials are not configured", 503);
    }
    const payment = await prisma.payment.create({
      data: {
        orderId: input.orderId,
        userId,
        amount: input.amount,
        provider: input.provider,
        status: PaymentStatus.PENDING,
      },
    });

    try {
      const paymentUrl = input.provider === PaymentProvider.VNPAY
        ? createVnpayUrl(payment.id, payment.amount, request)
        : await createMomoUrl(payment.id, payment.amount, request);
      response.status(201).json({
        paymentId: payment.id,
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        paymentUrl,
      });
    } catch (error) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      throw error;
    }
  } catch (error) {
    handleControllerError(error, response, "createPayment");
  }
}

export async function handlePaymentCallback(request: Request, response: Response): Promise<void> {
  try {
    const parameters = stringQuery(request.query);
    const result = parameters.vnp_TxnRef
      ? await processVnpayCallback(parameters)
      : await processMomoCallback(parameters);
    response.redirect(302, callbackAppUrl(result.status, result.paymentId));
  } catch (error) {
    handleControllerError(error, response, "handlePaymentCallback");
  }
}

export async function handleMomoIpn(request: Request, response: Response): Promise<void> {
  try {
    const body = z.record(z.union([z.string(), z.number()])).parse(request.body);
    const parameters = Object.fromEntries(Object.entries(body).map(([key, value]) => [key, String(value)]));
    const result = await processMomoCallback(parameters);
    response.status(200).json({ resultCode: 0, message: "Success", paymentId: result.paymentId, status: result.status });
  } catch (error) {
    handleControllerError(error, response, "handleMomoIpn");
  }
}

export async function getPaymentStatus(request: Request<{ id: string }>, response: Response): Promise<void> {
  try {
    const userId = authenticatedUserId(request);
    const payment = await prisma.payment.findFirst({
      where: { id: request.params.id, userId },
      select: {
        id: true,
        orderId: true,
        amount: true,
        currency: true,
        provider: true,
        status: true,
        transactionId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!payment) {
      response.status(404).json({ error: "Payment not found" });
      return;
    }
    response.json(payment);
  } catch (error) {
    handleControllerError(error, response, "getPaymentStatus");
  }
}
