import { describe, expect, it } from "vitest";

import { calculatePayloadHash, stableStringify } from "../src/modules/raw-payloads/payload-hash.js";

describe("payload hashing", () => {
  it("serializes object keys deterministically at every depth", () => {
    const first = {
      b: 2,
      a: {
        y: true,
        x: ["item", { b: null, a: 1 }]
      }
    };
    const second = {
      a: {
        x: ["item", { a: 1, b: null }],
        y: true
      },
      b: 2
    };

    expect(stableStringify(first)).toBe(stableStringify(second));
    expect(calculatePayloadHash(first)).toBe(calculatePayloadHash(second));
    expect(calculatePayloadHash(first)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects values that cannot be represented as JSON payloads", () => {
    expect(() => stableStringify({ externalId: undefined })).toThrow(/JSON-compatible/);
  });
});
