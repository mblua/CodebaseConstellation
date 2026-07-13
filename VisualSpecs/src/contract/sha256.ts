// Pure TypeScript SHA-256 for contract code. No imports, globals, or platform APIs.

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
  0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
  0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
] as const;

const H0 = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
  0x5be0cd19,
] as const;

export function sha256(text: string): string {
  const bytes = utf8(text);
  const bitLengthHi = Math.floor((bytes.length * 8) / 0x100000000);
  const bitLengthLo = (bytes.length * 8) >>> 0;
  const paddedLength = (((bytes.length + 9 + 63) >> 6) << 6) >>> 0;
  const data = new Uint8Array(paddedLength);
  data.set(bytes);
  data[bytes.length] = 0x80;
  data[paddedLength - 8] = (bitLengthHi >>> 24) & 0xff;
  data[paddedLength - 7] = (bitLengthHi >>> 16) & 0xff;
  data[paddedLength - 6] = (bitLengthHi >>> 8) & 0xff;
  data[paddedLength - 5] = bitLengthHi & 0xff;
  data[paddedLength - 4] = (bitLengthLo >>> 24) & 0xff;
  data[paddedLength - 3] = (bitLengthLo >>> 16) & 0xff;
  data[paddedLength - 2] = (bitLengthLo >>> 8) & 0xff;
  data[paddedLength - 1] = bitLengthLo & 0xff;

  let h0: number = H0[0];
  let h1: number = H0[1];
  let h2: number = H0[2];
  let h3: number = H0[3];
  let h4: number = H0[4];
  let h5: number = H0[5];
  let h6: number = H0[6];
  let h7: number = H0[7];
  const w = new Uint32Array(64);

  for (let offset = 0; offset < data.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4;
      w[i] =
        ((data[j] ?? 0) << 24) |
        ((data[j + 1] ?? 0) << 16) |
        ((data[j + 2] ?? 0) << 8) |
        (data[j + 3] ?? 0);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15] ?? 0, 7) ^ rotr(w[i - 15] ?? 0, 18) ^ ((w[i - 15] ?? 0) >>> 3);
      const s1 = rotr(w[i - 2] ?? 0, 17) ^ rotr(w[i - 2] ?? 0, 19) ^ ((w[i - 2] ?? 0) >>> 10);
      w[i] = add(w[i - 16] ?? 0, s0, w[i - 7] ?? 0, s1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = add(h, s1, ch, K[i] ?? 0, w[i] ?? 0);
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = add(s0, maj);
      h = g;
      g = f;
      f = e;
      e = add(d, temp1);
      d = c;
      c = b;
      b = a;
      a = add(temp1, temp2);
    }

    h0 = add(h0, a);
    h1 = add(h1, b);
    h2 = add(h2, c);
    h3 = add(h3, d);
    h4 = add(h4, e);
    h5 = add(h5, f);
    h6 = add(h6, g);
    h7 = add(h7, h);
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map(hex32).join('');
}

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function add(...values: number[]): number {
  let out = 0;
  for (const value of values) out = (out + value) >>> 0;
  return out;
}

function hex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}

function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}
