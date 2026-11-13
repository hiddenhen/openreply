import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), verifyState: vi.fn(), exchange: vi.fn(), assigned: vi.fn(),
  info: vi.fn(), subscribe: vi.fn(), allowed: vi.fn(),
  db: {
    workspaceMember: { findFirst: vi.fn() },
    instagramAccount: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    operationalEvent: { create: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db/client", () => ({ prisma: mocks.db }));
vi.mock("@/lib/instagram-accounts", () => ({ canConnectInstagramAccount: mocks.allowed }));
vi.mock("@/lib/meta/oauth", () => ({
  verifyOAuthState: mocks.verifyState, exchangeCodeForToken: mocks.exchange,
  encryptToken: (token: string) => `encrypted:${token}`,
}));
vi.mock("@/lib/meta/client", () => ({
  getAssignedInstagramAccounts: mocks.assigned, getUserInfo: mocks.info,
  subscribeInstagramAccountToWebhooks: mocks.subscribe,
  getLongLivedToken: async (token: string) => ({ accessToken: token, expiresIn: null }),
}));
import { GET } from "@/app/api/instagram/callback/route";
const request = () => new NextRequest("https://app.test/api/instagram/callback?code=code&state=signed");
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("META_LOGIN_CONFIG_ID", "config");
  vi.stubEnv("NEXTAUTH_URL", "https://app.test");
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.verifyState.mockReturnValue({ workspaceId: "workspace", ts: Date.now() });
  mocks.db.workspaceMember.findFirst.mockResolvedValue({ role: "OWNER" });
  mocks.exchange.mockResolvedValue({ accessToken: "token", userId: "" });
  mocks.assigned.mockResolvedValue([{ id: "111" }, { id: "222" }]);
  mocks.info.mockImplementation(async (_token, id) => ({ id, user_id: id, username: `user${id}` }));
  mocks.allowed.mockResolvedValue({ allowed: true });
  mocks.subscribe.mockResolvedValue({ success: true });
  mocks.db.instagramAccount.findUnique.mockResolvedValue(null);
  mocks.db.instagramAccount.create.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());
describe("Unified Login callback authorization and persistence", () => {
  it("stores all granted accounts in the signed workspace with encrypted tokens", async () => {
    const response = await GET(request());
    expect(response.headers.get("location")).toBe("https://app.test/dashboard?connected=true");
    expect(mocks.db.instagramAccount.create).toHaveBeenCalledTimes(2);
    expect(mocks.db.instagramAccount.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      workspaceId: "workspace", instagramId: "222", provider: "META",
      accessToken: "encrypted:token", tokenExpiresAt: null,
    }) });
  });
  it("does not connect accounts already owned by another workspace or provider", async () => {
    mocks.allowed.mockResolvedValue({ allowed: false });
    expect((await GET(request())).headers.get("location")).toContain("already_connected");
    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(mocks.db.instagramAccount.create).not.toHaveBeenCalled();
    expect(mocks.db.instagramAccount.updateMany).not.toHaveBeenCalled();
  });
  it("rechecks workspace and provider atomically when reconnecting", async () => {
    mocks.db.instagramAccount.findUnique.mockResolvedValue({ id: "existing" });
    mocks.db.instagramAccount.updateMany.mockResolvedValue({ count: 0 });
    await GET(request());
    expect(mocks.db.instagramAccount.updateMany).toHaveBeenCalledWith({
      where: { id: "existing", workspaceId: "workspace", provider: "META" }, data: expect.any(Object),
    });
    expect(mocks.db.instagramAccount.create).not.toHaveBeenCalled();
  });
  it("rejects a member without management permission before exchanging any code", async () => {
    mocks.db.workspaceMember.findFirst.mockResolvedValue({ role: "MEMBER" });
    expect((await GET(request())).headers.get("location")).toContain("forbidden");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("rejects invalid state before exchanging any code", async () => {
    mocks.verifyState.mockReturnValue(null);
    expect((await GET(request())).headers.get("location")).toContain("invalid");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("retains an explicit token expiry when Meta supplies one", async () => {
    mocks.exchange.mockResolvedValue({ accessToken: "token", userId: "", expiresIn: 3600 });
    await GET(request());
    const expiry = mocks.db.instagramAccount.create.mock.calls[0][0].data.tokenExpiresAt;
    expect(expiry.getTime()).toBeGreaterThan(Date.now() + 3500_000);
    expect(expiry.getTime()).toBeLessThan(Date.now() + 3700_000);
  });
});
