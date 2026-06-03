import { describe, expect, it } from "vitest";
import { createRequire } from "module";

// logger.js is the CJS MITM bundle module; load it via createRequire (it must stay
// dependency-isolated for the runtime copy, so we test its self-contained masking).
const require = createRequire(import.meta.url);
const { maskSensitiveHeaders } = require("../../src/mitm/logger.js");

// Guards the opt-in MITM dump masking: capturing real Copilot/Kiro traffic via
// MITM_FILE_LOG=1 must never persist live auth tokens, cookies or API keys to disk.
describe("MITM dump header masking", () => {
  it("redacts sensitive headers while preserving non-sensitive ones", () => {
    const masked = maskSensitiveHeaders({
      authorization: "Bearer sk-abcdefgh12345678ijklmnop",
      cookie: "session=verysecretvalue1234567890",
      "x-api-key": "key-1234567890abcdef",
      "content-type": "application/json",
      host: "api.individual.githubcopilot.com",
    });

    expect(masked.authorization).toMatch(/^Bearer /);
    expect(masked.authorization).toContain("[REDACTED]");
    expect(masked.authorization).not.toContain("ijklmnop");
    expect(masked.cookie).toContain("[REDACTED]");
    expect(masked["x-api-key"]).toContain("[REDACTED]");
    // Non-sensitive headers pass through untouched.
    expect(masked["content-type"]).toBe("application/json");
    expect(masked.host).toBe("api.individual.githubcopilot.com");
  });

  it("masks array-valued headers (e.g. set-cookie) element-wise", () => {
    const masked = maskSensitiveHeaders({
      "set-cookie": ["a=1234567890abcdefghij", "b=zyxwvutsrqponmlkjihg"],
    });
    expect(Array.isArray(masked["set-cookie"])).toBe(true);
    masked["set-cookie"].forEach(v => expect(v).toContain("[REDACTED]"));
  });

  it("returns an empty object for nullish input", () => {
    expect(maskSensitiveHeaders(undefined)).toEqual({});
    expect(maskSensitiveHeaders(null)).toEqual({});
  });
});
