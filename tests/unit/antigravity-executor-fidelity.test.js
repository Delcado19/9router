import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDirs = [];

async function loadExecutorWithVersion(version = "6.6.6") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ag-product-"));
  tempDirs.push(dir);
  const productJson = path.join(dir, "product.json");
  fs.writeFileSync(productJson, JSON.stringify({ ideVersion: version, version: "1.107.0" }));
  process.env.ANTIGRAVITY_PRODUCT_JSON = productJson;
  vi.resetModules();
  return await import("../../open-sse/executors/antigravity.js");
}

afterEach(() => {
  delete process.env.ANTIGRAVITY_PRODUCT_JSON;
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("AntigravityExecutor protocol fidelity", () => {
  // Regression guard for 313ea98: the AG API rejects an injected request-level
  // `metadata` field with INVALID_ARGUMENT, so transformRequest must NOT compute
  // and add ideVersion (or any other) metadata. Caller-provided metadata passes
  // through untouched, but the executor adds nothing of its own. IDE-version
  // fidelity is carried by the User-Agent (getAntigravityUserAgent), not by a
  // request-body metadata field.
  it("does not inject computed ideVersion metadata into upstream requests", async () => {
    const { AntigravityExecutor } = await loadExecutorWithVersion("6.6.6");
    const executor = new AntigravityExecutor();

    const transformed = executor.transformRequest("gemini-3-pro-high", {
      request: {
        metadata: { ideName: "antigravity", existing: true },
        contents: [{ role: "user", parts: [{ text: "hello" }] }],
        generationConfig: { maxOutputTokens: 123 }
      }
    }, true, {
      accessToken: "token",
      projectId: "real-project-id",
      email: "user@example.com"
    });

    // Caller's metadata is preserved verbatim …
    expect(transformed.request.metadata).toEqual({ ideName: "antigravity", existing: true });
    // … but the executor must not inject an ideVersion field of its own.
    expect(transformed.request.metadata).not.toHaveProperty("ideVersion");
  });

  it("does not fabricate a project id when credentials have a real project id", async () => {
    const { AntigravityExecutor } = await loadExecutorWithVersion("6.6.6");
    const executor = new AntigravityExecutor();

    const transformed = executor.transformRequest("gemini-3-pro-high", {
      request: { contents: [{ role: "user", parts: [{ text: "hello" }] }] }
    }, true, {
      accessToken: "token",
      projectId: "real-project-id",
      connectionId: "conn-1"
    });

    expect(transformed.project).toBe("real-project-id");
  });

  it("does not send x-request-source in direct executor headers", async () => {
    const { AntigravityExecutor } = await loadExecutorWithVersion("6.6.6");
    const executor = new AntigravityExecutor();

    const headers = executor.buildHeaders({ accessToken: "token" }, true, "session-1");

    expect(headers).not.toHaveProperty("x-request-source");
    expect(headers).not.toHaveProperty("X-Request-Source");
  });

  it("fails fast instead of fabricating a project id", async () => {
    const { AntigravityExecutor } = await loadExecutorWithVersion("6.6.6");
    const executor = new AntigravityExecutor();

    expect(() => executor.transformRequest("gemini-3-pro-high", {
      request: { contents: [{ role: "user", parts: [{ text: "hello" }] }] }
    }, true, {
      accessToken: "token",
      connectionId: "conn-1"
    })).toThrow(/projectId/i);
  });
});
