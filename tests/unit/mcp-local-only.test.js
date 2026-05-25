import { describe, expect, it, vi, beforeEach } from "vitest";

const bridge = vi.hoisted(() => ({
  findPlugin: vi.fn(),
  registerSession: vi.fn(),
  unregisterSession: vi.fn(),
  sendToChild: vi.fn(),
}));

vi.mock("@/lib/mcp/stdioSseBridge", () => bridge);

const sseRoute = await import("../../src/app/api/mcp/[plugin]/sse/route.js");
const messageRoute = await import("../../src/app/api/mcp/[plugin]/message/route.js");

function request(url, init = {}) {
  return new Request(url, init);
}

async function json(response) {
  return await response.json();
}

describe("MCP route localhost guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.findPlugin.mockReturnValue({ name: "filesystem", command: "node", args: [] });
    bridge.registerSession.mockReturnValue("session-1");
  });

  it("rejects remote SSE access before plugin lookup or process spawn", async () => {
    const response = await sseRoute.GET(
      request("https://router.example.com/api/mcp/filesystem/sse", {
        headers: { host: "router.example.com", origin: "https://router.example.com" },
      }),
      { params: Promise.resolve({ plugin: "filesystem" }) },
    );

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({ error: "Local only: MCP requires localhost access" });
    expect(bridge.findPlugin).not.toHaveBeenCalled();
    expect(bridge.registerSession).not.toHaveBeenCalled();
  });

  it("rejects remote message access before writing to a child process", async () => {
    const response = await messageRoute.POST(
      request("https://router.example.com/api/mcp/filesystem/message", {
        method: "POST",
        headers: {
          host: "router.example.com",
          origin: "https://router.example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      { params: Promise.resolve({ plugin: "filesystem" }) },
    );

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({ error: "Local only: MCP requires localhost access" });
    expect(bridge.findPlugin).not.toHaveBeenCalled();
    expect(bridge.sendToChild).not.toHaveBeenCalled();
  });

  it("rejects forwarded remote hosts even when Host is loopback", async () => {
    const response = await messageRoute.POST(
      request("http://localhost:20128/api/mcp/filesystem/message", {
        method: "POST",
        headers: {
          host: "localhost:20128",
          "x-forwarded-host": "router.example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      { params: Promise.resolve({ plugin: "filesystem" }) },
    );

    expect(response.status).toBe(403);
    expect(bridge.sendToChild).not.toHaveBeenCalled();
  });

  it("rejects forwarded host lists that include a remote host", async () => {
    const response = await messageRoute.POST(
      request("http://localhost:20128/api/mcp/filesystem/message", {
        method: "POST",
        headers: {
          host: "localhost:20128",
          "x-forwarded-host": "localhost:20128, router.example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      { params: Promise.resolve({ plugin: "filesystem" }) },
    );

    expect(response.status).toBe(403);
    expect(bridge.sendToChild).not.toHaveBeenCalled();
  });

  it("allows bracketed IPv6 loopback message access", async () => {
    const response = await messageRoute.POST(
      request("http://[::1]:20128/api/mcp/filesystem/message", {
        method: "POST",
        headers: {
          host: "[::1]:20128",
          origin: "http://[::1]:20128",
          "content-type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      { params: Promise.resolve({ plugin: "filesystem" }) },
    );

    expect(response.status).toBe(202);
    expect(bridge.findPlugin).toHaveBeenCalledWith("filesystem");
    expect(bridge.sendToChild).toHaveBeenCalledWith("filesystem", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
  });

  it("allows loopback message access to reach the bridge", async () => {
    const response = await messageRoute.POST(
      request("http://localhost:20128/api/mcp/filesystem/message", {
        method: "POST",
        headers: {
          host: "localhost:20128",
          origin: "http://localhost:20128",
          "content-type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      { params: Promise.resolve({ plugin: "filesystem" }) },
    );

    expect(response.status).toBe(202);
    expect(bridge.findPlugin).toHaveBeenCalledWith("filesystem");
    expect(bridge.sendToChild).toHaveBeenCalledWith("filesystem", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
  });
});
