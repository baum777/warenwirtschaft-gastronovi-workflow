import { createHash } from "node:crypto";

export function stableStringify(value: unknown): string {
  return stringifyJsonValue(value, "$");
}

export function calculatePayloadHash(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function stringifyJsonValue(value: unknown, path: string): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Payload must be JSON-compatible at ${path}`);
    }

    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item, index) => stringifyJsonValue(item, `${path}[${index}]`)).join(",")}]`;
  }

  if (typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error(`Payload must be JSON-compatible at ${path}`);
    }

    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => {
        if (entryValue === undefined) {
          throw new Error(`Payload must be JSON-compatible at ${path}.${key}`);
        }

        return `${JSON.stringify(key)}:${stringifyJsonValue(entryValue, `${path}.${key}`)}`;
      })
      .join(",")}}`;
  }

  throw new Error(`Payload must be JSON-compatible at ${path}`);
}
