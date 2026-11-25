/**
 * Minimal QR Code encoder for the "QR gia đình" sheet: byte mode, error correction level M, versions 1-10 (up to
 * 213 bytes; the family QR is ~54). Follows ISO/IEC 18004 (Reed-Solomon over GF(256) with 0x11D, the standard
 * function patterns, masks and format / version bits). Pure TypeScript, no React Native, covered by qrCode.test.ts;
 * drawn with react-native-svg by FamilyQrSheet.
 */

/** Per version 1..10, level M: [total codewords, ECC codewords per block, number of blocks]. */
const VERSION_TABLE: ReadonlyArray<readonly [number, number, number]> = [
  [26, 10, 1], [44, 16, 1], [70, 26, 1], [100, 18, 2], [134, 24, 2],
  [172, 16, 4], [196, 18, 4], [242, 22, 4], [292, 22, 5], [346, 26, 5],
];
const ALIGNMENT: ReadonlyArray<readonly number[]> = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];
/** Level M format bits (ISO 18004 table: L=01, M=00, Q=11, H=10). */
const ECL_M_BITS = 0;

const bit = (value: number, index: number): boolean => ((value >>> index) & 1) !== 0;

/** GF(256) multiply, reduction polynomial x^8 + x^4 + x^3 + x^2 + 1. */
export function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** Reed-Solomon generator polynomial (without the leading 1) of the given degree. */
export function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** Error correction codewords for one data block. */
export function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = divisor.map(() => 0);
  for (const value of data) {
    const factor = value ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coefficient, index) => { result[index] ^= gfMultiply(coefficient, factor); });
  }
  return result;
}

/** 15 format bits for level M and a mask (BCH(15,5) with 0x537, XOR 0x5412). */
export function formatBits(mask: number): number {
  const data = (ECL_M_BITS << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  return ((data << 10) | remainder) ^ 0x5412;
}

/** 18 version bits (versions 7+; BCH(18,6) with 0x1F25). */
export function versionBits(version: number): number {
  let remainder = version;
  for (let i = 0; i < 12; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  return (version << 12) | remainder;
}

const utf8 = (text: string): number[] => {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return bytes;
};

const dataCapacity = (version: number): number => {
  const [total, ecc, blocks] = VERSION_TABLE[version - 1];
  return total - ecc * blocks;
};

/** Data codewords (mode, count, bytes, terminator, padding) for a version. */
export function dataCodewords(bytes: readonly number[], version: number): number[] {
  const bits: number[] = [];
  const append = (value: number, length: number) => { for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1); };
  append(0b0100, 4);
  append(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((value) => append(value, 8));
  const capacityBits = dataCapacity(version) * 8;
  append(0, Math.min(4, capacityBits - bits.length));
  append(0, (8 - (bits.length % 8)) % 8);
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) codewords.push(bits.slice(i, i + 8).reduce((acc, value) => (acc << 1) | value, 0));
  for (let pad = 0xec; codewords.length < dataCapacity(version); pad ^= 0xec ^ 0x11) codewords.push(pad);
  return codewords;
}

/** Splits into blocks, adds Reed-Solomon codewords and interleaves them (ISO 18004 §7.6). */
export function interleave(data: readonly number[], version: number): number[] {
  const [total, eccLength, blockCount] = VERSION_TABLE[version - 1];
  const shortBlocks = blockCount - (total % blockCount);
  const shortLength = Math.floor(total / blockCount);
  const divisor = rsDivisor(eccLength);
  const blocks: number[][] = [];
  for (let i = 0, offset = 0; i < blockCount; i += 1) {
    const length = shortLength - eccLength + (i < shortBlocks ? 0 : 1);
    const block = data.slice(offset, offset + length);
    offset += length;
    const ecc = rsRemainder(block, divisor);
    // A placeholder keeps short blocks aligned with long ones while interleaving.
    if (i < shortBlocks) block.push(-1);
    blocks.push([...block, ...ecc]);
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    blocks.forEach((block, index) => {
      if (i !== shortLength - eccLength || index >= shortBlocks) result.push(block[i]);
    });
  }
  return result;
}

const MASKS: ReadonlyArray<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

export type QrMatrix = { version: number; size: number; mask: number; modules: boolean[][] };

/** Function-pattern layout for a version (modules + which ones are reserved). */
export function functionPatterns(version: number): { modules: boolean[][]; reserved: boolean[][] } {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { modules[y][x] = dark; reserved[y][x] = true; };
  for (let i = 0; i < size; i += 1) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
      const x = cx + dx; const y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, distance !== 2 && distance !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const positions = ALIGNMENT[version - 1];
  const last = positions.length - 1;
  positions.forEach((py, i) => positions.forEach((px, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) set(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  drawFormat(modules, reserved, 0);
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const a = size - 11 + (i % 3); const b = Math.floor(i / 3);
      set(a, b, bit(bits, i)); set(b, a, bit(bits, i));
    }
  }
  return { modules, reserved };
}

function drawFormat(modules: boolean[][], reserved: boolean[][], mask: number): void {
  const size = modules.length;
  const bits = formatBits(mask);
  const set = (x: number, y: number, dark: boolean) => { modules[y][x] = dark; reserved[y][x] = true; };
  for (let i = 0; i <= 5; i += 1) set(8, i, bit(bits, i));
  set(8, 7, bit(bits, 6)); set(8, 8, bit(bits, 7)); set(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(bits, i));
  set(8, size - 8, true); // the dark module
}

/** Module coordinates in codeword order (zigzag from the bottom-right, skipping the timing column). */
export function codewordPath(reserved: boolean[][]): Array<[number, number]> {
  const size = reserved.length;
  const path: Array<[number, number]> = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (!reserved[y][x]) path.push([x, y]);
      }
    }
  }
  return path;
}

/** ISO 18004 penalty score (lower is easier to scan). */
export function penalty(modules: boolean[][]): number {
  const size = modules.length;
  let score = 0;
  const lines: boolean[][] = [...modules, ...modules[0].map((_, x) => modules.map((row) => row[x]))];
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i += 1) {
      if (i < size && line[i] === line[i - 1]) run += 1;
      else { if (run >= 5) score += 3 + run - 5; run = 1; }
    }
    for (let i = 0; i + 11 <= size; i += 1) {
      const window = line.slice(i, i + 11).map((dark) => (dark ? 1 : 0)).join("");
      if (window === "10111010000" || window === "00001011101") score += 40;
    }
  }
  for (let y = 0; y + 1 < size; y += 1) for (let x = 0; x + 1 < size; x += 1) {
    const color = modules[y][x];
    if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) score += 3;
  }
  const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const total = size * size;
  score += Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** The QR matrix (true = dark) for `text`, with the smallest version that fits and the best mask. */
export function encodeQr(text: string): QrMatrix {
  const bytes = utf8(text);
  const version = VERSION_TABLE.findIndex((_, index) => 4 + (index + 1 < 10 ? 8 : 16) + bytes.length * 8 <= dataCapacity(index + 1) * 8) + 1;
  if (version === 0) throw new Error("Text too long for the family QR");
  const codewords = interleave(dataCodewords(bytes, version), version);
  const { modules, reserved } = functionPatterns(version);
  const path = codewordPath(reserved);
  path.forEach(([x, y], index) => {
    const value = codewords[index >>> 3];
    modules[y][x] = value !== undefined && bit(value, 7 - (index & 7));
  });
  let best: { mask: number; score: number; modules: boolean[][] } | null = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = modules.map((row) => [...row]);
    const candidateReserved = reserved.map((row) => [...row]);
    path.forEach(([x, y]) => { if (MASKS[mask](x, y)) candidate[y][x] = !candidate[y][x]; });
    drawFormat(candidate, candidateReserved, mask);
    const score = penalty(candidate);
    if (!best || score < best.score) best = { mask, score, modules: candidate };
  }
  const chosen = best as { mask: number; modules: boolean[][] };
  return { version, size: modules.length, mask: chosen.mask, modules: chosen.modules };
}

/** Reads the text back out of a matrix (unmask, de-interleave, byte mode); for tests and self-checks. */
export function decodeOwnQr(matrix: QrMatrix): string {
  const { modules: patterns, reserved } = functionPatterns(matrix.version);
  void patterns;
  const path = codewordPath(reserved);
  const raw: number[] = [];
  path.forEach(([x, y], index) => {
    const dark = matrix.modules[y][x] !== MASKS[matrix.mask](x, y);
    if ((index & 7) === 0) raw.push(0);
    raw[raw.length - 1] = (raw[raw.length - 1] << 1) | (dark ? 1 : 0);
  });
  const [total, eccLength, blockCount] = VERSION_TABLE[matrix.version - 1];
  const shortBlocks = blockCount - (total % blockCount);
  const shortLength = Math.floor(total / blockCount);
  const blocks: number[][] = Array.from({ length: blockCount }, () => []);
  let cursor = 0;
  for (let i = 0; i < shortLength - eccLength + 1; i += 1) {
    blocks.forEach((block, index) => { if (i < shortLength - eccLength || index >= shortBlocks) block.push(raw[cursor++]); });
  }
  const data = blocks.flat();
  let bitIndex = 0;
  const read = (length: number) => {
    let value = 0;
    for (let i = 0; i < length; i += 1, bitIndex += 1) value = (value << 1) | ((data[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1);
    return value;
  };
  if (read(4) !== 0b0100) throw new Error("Not byte mode");
  const length = read(matrix.version < 10 ? 8 : 16);
  const bytes = Array.from({ length }, () => read(8));
  return decodeURIComponent(bytes.map((value) => `%${value.toString(16).padStart(2, "0")}`).join(""));
}
