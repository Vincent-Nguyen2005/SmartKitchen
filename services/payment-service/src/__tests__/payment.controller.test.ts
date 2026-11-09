import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import { PaymentProvider, PaymentStatus, PrismaClient } from "../../node_modules/.prisma/client-payment";
import {
  createMomoUrl,
  createPaymentRecord,
  createPaymentSchema,
  createVnpayUrl,
} from "../controllers/payment.controller";

const request = {
  header: () => undefined,
  get: () => "payment.test",
  protocol: "https",
  ip: "127.0.0.1",
} as unknown as Request;

test("payment input validation accepts supported requests and rejects invalid amounts/providers", () => {
  assert.equal(createPaymentSchema.safeParse({
    orderId: "order-1",
    amount: 50_000,
    provider: PaymentProvider.VNPAY,
  }).success, true);
  assert.equal(createPaymentSchema.safeParse({
    orderId: "order-1",
    amount: 0,
    provider: PaymentProvider.VNPAY,
  }).success, false);
  assert.equal(createPaymentSchema.safeParse({
    orderId: "order-1",
    amount: 10.5,
    provider: PaymentProvider.MOMO,
  }).success, false);
  assert.equal(createPaymentSchema.safeParse({
    orderId: "",
    amount: 100,
    provider: "UNKNOWN",
  }).success, false);
});

test("createPaymentRecord persists a pending payment through the mocked Prisma client", async () => {
  let createArgs: unknown;
  const client = {
    payment: {
      create: async (args: unknown) => {
        createArgs = args;
        const data = (args as { data: Record<string, unknown> }).data;
        return { id: "payment-1", currency: "VND", ...data };
      },
    },
  } as unknown as PrismaClient;
  const input = createPaymentSchema.parse({
    orderId: "order-1",
    amount: 50_000,
    provider: PaymentProvider.VNPAY,
  });

  const payment = await createPaymentRecord(input, "user-1", client);
  assert.equal(payment.id, "payment-1");
  assert.equal(payment.status, PaymentStatus.PENDING);
  assert.deepEqual(createArgs, {
    data: {
      orderId: "order-1",
      userId: "user-1",
      amount: 50_000,
      provider: PaymentProvider.VNPAY,
      status: PaymentStatus.PENDING,
    },
  });
});

test("createVnpayUrl builds a signed sandbox request with the payment reference and amount", () => {
  const previousEnv = {
    merchant: process.env.VNPAY_TMN_CODE,
    secret: process.env.VNPAY_HASH_SECRET,
    baseUrl: process.env.PAYMENT_PUBLIC_BASE_URL,
    paymentUrl: process.env.VNPAY_PAYMENT_URL,
  };
  process.env.VNPAY_TMN_CODE = "test-merchant";
  process.env.VNPAY_HASH_SECRET = "test-secret";
  delete process.env.PAYMENT_PUBLIC_BASE_URL;
  delete process.env.VNPAY_PAYMENT_URL;
  try {
    const url = new URL(createVnpayUrl("payment-1", 50_000, request));
    assert.equal(url.origin, "https://sandbox.vnpayment.vn");
    assert.equal(url.searchParams.get("vnp_TxnRef"), "payment-1");
    assert.equal(url.searchParams.get("vnp_Amount"), "5000000");
    assert.equal(url.searchParams.get("vnp_TmnCode"), "test-merchant");
    assert.equal(url.searchParams.get("vnp_ReturnUrl"), "https://payment.test/api/payments/callback");
    assert.match(url.searchParams.get("vnp_SecureHash") ?? "", /^[0-9a-f]{128}$/);
  } finally {
    if (previousEnv.merchant === undefined) delete process.env.VNPAY_TMN_CODE;
    else process.env.VNPAY_TMN_CODE = previousEnv.merchant;
    if (previousEnv.secret === undefined) delete process.env.VNPAY_HASH_SECRET;
    else process.env.VNPAY_HASH_SECRET = previousEnv.secret;
    if (previousEnv.baseUrl === undefined) delete process.env.PAYMENT_PUBLIC_BASE_URL;
    else process.env.PAYMENT_PUBLIC_BASE_URL = previousEnv.baseUrl;
    if (previousEnv.paymentUrl === undefined) delete process.env.VNPAY_PAYMENT_URL;
    else process.env.VNPAY_PAYMENT_URL = previousEnv.paymentUrl;
  }
});

test("createMomoUrl returns the mocked provider URL and rejects failed provider responses", async () => {
  const previousEnv = {
    partner: process.env.MOMO_PARTNER_CODE,
    access: process.env.MOMO_ACCESS_KEY,
    secret: process.env.MOMO_SECRET_KEY,
  };
  process.env.MOMO_PARTNER_CODE = "test-partner";
  process.env.MOMO_ACCESS_KEY = "test-access";
  process.env.MOMO_SECRET_KEY = "test-secret";

  try {
    let requestBody: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ resultCode: 0, payUrl: "https://momo.test/pay" }), { status: 200 });
    };
    const url = await createMomoUrl("payment-1", 50_000, request, fetcher);
    assert.equal(url, "https://momo.test/pay");
    assert.equal(requestBody?.orderId, "payment-1");
    assert.equal(requestBody?.amount, "50000");
    assert.equal(typeof requestBody?.signature, "string");

    await assert.rejects(
      createMomoUrl("payment-2", 1_000, request, async () =>
        new Response(JSON.stringify({ resultCode: 1 }), { status: 200 }),
      ),
      /MoMo did not return a valid payment URL/,
    );
  } finally {
    if (previousEnv.partner === undefined) delete process.env.MOMO_PARTNER_CODE;
    else process.env.MOMO_PARTNER_CODE = previousEnv.partner;
    if (previousEnv.access === undefined) delete process.env.MOMO_ACCESS_KEY;
    else process.env.MOMO_ACCESS_KEY = previousEnv.access;
    if (previousEnv.secret === undefined) delete process.env.MOMO_SECRET_KEY;
    else process.env.MOMO_SECRET_KEY = previousEnv.secret;
  }
});
