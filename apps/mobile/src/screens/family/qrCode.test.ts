/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { decodeOwnQr, encodeQr, formatBits, functionPatterns, rsDivisor, rsRemainder, versionBits } from "./qrCode";

test("Reed-Solomon matches the standard example (HELLO WORLD, version 1-M)", () => {
  const data = [0x20, 0x5b, 0x0b, 0x78, 0xd1, 0x72, 0xdc, 0x4d, 0x43, 0x40, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
  assert.deepEqual(rsRemainder(data, rsDivisor(10)), [0xc4, 0x23, 0x27, 0x77, 0xeb, 0xd7, 0xe7, 0xe2, 0x5d, 0x17]);
});

test("format and version bits match the ISO 18004 tables", () => {
  const level_m = ["101010000010010", "101000100100101", "101111001111100", "101101101001011", "100010111111001", "100000011001110", "100111110010111", "100101010100000"];
  level_m.forEach((expected, mask) => assert.equal(formatBits(mask).toString(2).padStart(15, "0"), expected, `mask ${mask}`));
  assert.equal(versionBits(7).toString(2).padStart(18, "0"), "000111110010010100");
  assert.equal(versionBits(10).toString(2).padStart(18, "0"), "001010010011010011");
});

test("the family QR (smartkitchen://join?t=<32 chars>) fits version 4 and reads back exactly", () => {
  const payload = `smartkitchen://join?t=${"Ab9_-".repeat(6)}xy`;
  const qr = encodeQr(payload);
  assert.equal(qr.version, 4);
  assert.equal(qr.size, 33);
  assert.equal(decodeOwnQr(qr), payload);
  // Finder pattern corners and the dark module are where scanners look for them.
  assert.equal(qr.modules[0][0] && qr.modules[0][6] && qr.modules[6][0] && !qr.modules[1][1], true);
  assert.equal(qr.modules[qr.size - 8][8], true);
});

test("round-trips other lengths, including multi-block and version 7+ (version bits)", () => {
  for (const text of ["a", "Nhà Lan · QR", "x".repeat(100), "y".repeat(180)]) {
    const qr = encodeQr(text);
    assert.equal(decodeOwnQr(qr), text, `length ${text.length}`);
  }
  assert.ok(encodeQr("y".repeat(180)).version >= 7);
  assert.throws(() => encodeQr("z".repeat(300)));
  // Timing pattern alternates between the finders.
  const { modules } = functionPatterns(4);
  assert.deepEqual(modules[6].slice(8, 13), [true, false, true, false, true]);
});
