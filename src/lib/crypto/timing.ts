import { timingSafeEqual } from "crypto";

// Constant-time string comparison for secrets/tokens. Pads to equal length so
// the comparison takes the same time regardless of where the strings differ
// (and regardless of length), defeating timing side-channels.
export function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  const len = Math.max(aBuf.length, bBuf.length);
  const paddedA = Buffer.alloc(len);
  const paddedB = Buffer.alloc(len);
  aBuf.copy(paddedA);
  bBuf.copy(paddedB);
  const equal = timingSafeEqual(paddedA, paddedB);
  return equal && aBuf.length === bBuf.length;
}
