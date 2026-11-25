/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { afterVerify, familyQrAction, QR_CAPTION, QR_EXPIRED_TEXT, QR_TITLE, qrDisplaySize, qrErrorText, QrSession } from "./familyQr";

test("owner shows the family QR; members and users without a family scan", () => {
  assert.equal(familyQrAction("OWNER"), "show");
  for (const role of ["ADMIN", "MEMBER", null, undefined]) assert.equal(familyQrAction(role), "scan", String(role));
});

test("owner's QR page: title, one caption line, QR about 75% of the width up to 320 px", () => {
  assert.equal(QR_TITLE, "QR gia đình");
  assert.equal(QR_CAPTION, "Quét mã QR để tham gia gia đình");
  assert.equal(qrDisplaySize(360), 270);
  assert.equal(qrDisplaySize(412), 309);
  assert.equal(qrDisplaySize(1024), 320);
  assert.equal(qrDisplaySize(200), 180);
});

test("retrying after a failed request shows the new token; an older request finishing late is revoked", async () => {
  const shown: Array<string | null> = [];
  const revoked: string[] = [];
  let calls = 0;
  const session = new QrSession({
    create: async () => { calls += 1; if (calls === 1) throw new Error("offline"); return { token: `t${calls}` }; },
    revoke: async (token: string) => { revoked.push(token); },
  }, (qr) => shown.push(qr?.token ?? null));
  await assert.rejects(session.open());
  assert.equal((await session.open())?.token, "t2");
  assert.deepEqual(shown, ["t2"]);
  session.close();
  assert.deepEqual(revoked, ["t2"]);
});

test("messages for the scan results", () => {
  assert.equal(qrErrorText({ code: "QR_EXPIRED" }), QR_EXPIRED_TEXT);
  assert.equal(qrErrorText({ code: "ALREADY_MEMBER" }), "Bạn đã ở trong gia đình này");
  assert.match(qrErrorText({ code: "OTHER_FAMILY" }), /gia đình khác/);
  assert.deepEqual(afterVerify("none"), { kind: "confirm" });
  assert.deepEqual(afterVerify("this"), { kind: "message", text: "Bạn đã ở trong gia đình này" });
  assert.equal(afterVerify("other").kind, "message");
});

const fakeApi = () => {
  const revoked: string[] = [];
  let next = 0;
  const pending: Array<(value: { token: string }) => void> = [];
  return {
    revoked,
    api: {
      create: () => new Promise<{ token: string }>((resolve) => { next += 1; const token = `t${next}`; pending.push(() => resolve({ token })); }),
      revoke: async (token: string) => { revoked.push(token); },
    },
    resolveNext: () => pending.shift()?.({ token: "" }),
  };
};

test("closing the sheet revokes the shown token once; background closes it too", async () => {
  const shown: Array<string | null> = [];
  const fake = fakeApi();
  const session = new QrSession(fake.api, (qr) => shown.push(qr?.token ?? null));
  const opening = session.open();
  fake.resolveNext();
  await opening;
  assert.deepEqual(shown, ["t1"]);
  session.close();
  session.close();
  assert.deepEqual(fake.revoked, ["t1"]);
  assert.deepEqual(shown, ["t1", null, null]);

  const again = session.open();
  fake.resolveNext();
  await again;
  assert.equal(session.onAppState("background"), true);
  assert.deepEqual(fake.revoked, ["t1", "t2"]);
  assert.equal(session.onAppState("active"), false);
});

test("a token that arrives after the sheet was closed is revoked and never shown", async () => {
  const shown: Array<string | null> = [];
  const fake = fakeApi();
  const session = new QrSession(fake.api, (qr) => shown.push(qr?.token ?? null));
  const opening = session.open();
  session.close();
  fake.resolveNext();
  assert.equal(await opening, null);
  assert.deepEqual(fake.revoked, ["t1"]);
  assert.ok(!shown.includes("t1"));
});
