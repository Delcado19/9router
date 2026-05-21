import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  backfillCodexEmails: vi.fn(),
  jsonResponse: vi.fn((body, init) => {
    const serialized = JSON.stringify(body);
    return {
      status: init?.status || 200,
      body: JSON.parse(serialized),
    };
  }),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: mocks.jsonResponse,
  },
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.getProviderConnections,
}));

vi.mock("@/lib/oauth/providers", () => ({
  backfillCodexEmails: mocks.backfillCodexEmails,
}));

const { GET } = await import("../../src/app/api/providers/client/route.js");

function request(path) {
  return { url: `http://localhost:20128${path}` };
}

describe("providers client route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backfillCodexEmails.mockResolvedValue(undefined);
  });

  it("sorts priority results with BigInt priorities without returning 500", async () => {
    mocks.getProviderConnections.mockResolvedValue([
      {
        id: "second",
        provider: "codex",
        authType: "oauth",
        name: "Second",
        priority: 2n,
        isActive: true,
      },
      {
        id: "first",
        provider: "claude",
        authType: "oauth",
        name: "First",
        priority: 1n,
        isActive: true,
      },
    ]);

    const response = await GET(request("/api/providers/client?page=1&pageSize=20&accountStatus=all&sort=priority"));

    expect(response.status).toBe(200);
    expect(response.body.connections.map((conn) => conn.id)).toEqual(["first", "second"]);
    expect(response.body.connections.map((conn) => conn.priority)).toEqual([1, 2]);
  });

  it("places invalid priority values after valid numeric priorities", async () => {
    mocks.getProviderConnections.mockResolvedValue([
      {
        id: "invalid",
        provider: "codex",
        authType: "oauth",
        name: "Invalid",
        priority: "not-a-number",
        isActive: true,
      },
      {
        id: "valid",
        provider: "claude",
        authType: "oauth",
        name: "Valid",
        priority: "1",
        isActive: true,
      },
    ]);

    const response = await GET(request("/api/providers/client?sort=priority"));

    expect(response.status).toBe(200);
    expect(response.body.connections.map((conn) => conn.id)).toEqual(["valid", "invalid"]);
  });
});
