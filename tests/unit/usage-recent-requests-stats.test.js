import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    all: vi.fn(),
  },
  getApiKeys: vi.fn(),
}));

vi.mock("../../src/lib/db/driver.js", () => ({
  getAdapter: vi.fn(async () => mocks.db),
}));

vi.mock("../../src/lib/db/repos/connectionsRepo.js", () => ({
  getProviderConnections: vi.fn(async () => []),
}));

vi.mock("../../src/lib/db/repos/apiKeysRepo.js", () => ({
  getApiKeys: mocks.getApiKeys,
}));

vi.mock("../../src/lib/db/repos/nodesRepo.js", () => ({
  getProviderNodes: vi.fn(async () => []),
}));

const { getUsageStats } = await import("../../src/lib/db/repos/usageRepo.js");

describe("usage stats recent request API key metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global._apiKeyMapCache.map = {};
    global._apiKeyMapCache.ts = 0;

    mocks.getApiKeys.mockResolvedValue([
      {
        id: "key-1",
        key: "sk-test-1234567890",
        name: "Agent CLI",
        createdAt: "2026-05-18T19:00:00.000Z",
      },
    ]);

    mocks.db.all.mockImplementation((sql) => {
      if (sql.includes("ORDER BY id DESC LIMIT 100")) {
        return [
          {
            timestamp: "2026-05-18T20:00:00.000Z",
            provider: "openai",
            model: "gpt-5",
            apiKey: "sk-test-1234567890",
            tokens: JSON.stringify({ prompt_tokens: 10, completion_tokens: 20 }),
            status: "ok",
          },
        ];
      }
      return [];
    });
  });

  it("includes API key display metadata in stats recent requests", async () => {
    const stats = await getUsageStats("24h");

    expect(stats.recentRequests).toEqual([
      expect.objectContaining({
        model: "gpt-5",
        provider: "openai",
        promptTokens: 10,
        completionTokens: 20,
        apiKeyId: "key-1",
        keyName: "Agent CLI",
      }),
    ]);
    // Security (#1258): the secret key must not leak into the recent-requests payload.
    expect(stats.recentRequests[0]).not.toHaveProperty("apiKey");
    expect(JSON.stringify(stats.recentRequests)).not.toContain("sk-test-1234567890");
  });
});
