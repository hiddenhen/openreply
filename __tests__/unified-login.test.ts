import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeCodeForToken, getAuthorizationUrl } from "@/lib/meta/oauth";
import {
  getAssignedInstagramAccounts, getLongLivedToken, getUserMedia,
  refreshLongLivedToken, sendPrivateReplyWithButton, subscribeInstagramAccountToWebhooks,
} from "@/lib/meta/client";

const fetchMock = vi.fn();
function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("META_LOGIN_CONFIG_ID", "config-123");
  vi.stubEnv("INSTAGRAM_APP_ID", "app-123");
  vi.stubEnv("INSTAGRAM_APP_SECRET", "private-app-secret");
  vi.stubEnv("META_GRAPH_API_VERSION", "v27.0");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Unified Login transport", () => {
  it("preserves redirect and signed state without requesting extra scopes", () => {
    const url = new URL(getAuthorizationUrl("https://app.test/callback", "signed-state"));
    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.searchParams.get("config_id")).toBe("config-123");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/callback");
    expect(url.searchParams.has("client_secret")).toBe(false);
    expect(url.searchParams.has("scope")).toBe(false);
  });
  it("exchanges the code with the Meta app and preserves any issued expiry", async () => {
    respond({ access_token: "business-token", expires_in: 3600 });
    expect(await exchangeCodeForToken("one-time-code", "https://app.test/callback"))
      .toEqual({ accessToken: "business-token", userId: "", expiresIn: 3600 });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin).toBe("https://graph.facebook.com");
    expect(url.pathname).toBe("/v27.0/oauth/access_token");
    expect(url.searchParams.get("client_id")).toBe("app-123");
  });
  it("does not leak raw token-exchange response bodies on failure", async () => {
    respond({ access_token: "sensitive-token", error: { message: "private-app-secret" } }, 400);
    await expect(exchangeCodeForToken("code", "https://app.test/callback"))
      .rejects.toThrow("Meta token exchange failed");
  });
  it("does not fabricate an expiry or call Instagram token-refresh endpoints", async () => {
    expect(await getLongLivedToken("token")).toEqual({ accessToken: "token", expiresIn: null });
    await expect(refreshLongLivedToken("token")).rejects.toThrow("needs reauthorization");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("paginates assigned accounts on the fixed trusted host", async () => {
    respond({ data: [{ id: "111" }], paging: {
      next: "https://untrusted.example/?access_token=leak", cursors: { after: "cursor" },
    } });
    respond({ data: [{ id: "222" }, { id: "111" }] });
    expect(await getAssignedInstagramAccounts("secret")).toEqual([{ id: "111" }, { id: "222" }]);
    const second = new URL(fetchMock.mock.calls[1][0]);
    expect(second.origin).toBe("https://graph.facebook.com");
    expect(second.searchParams.get("after")).toBe("cursor");
    expect(second.searchParams.has("access_token")).toBe(false);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer secret");
  });
  it("rejects empty assignments and non-progressing pagination", async () => {
    respond({ data: [] });
    await expect(getAssignedInstagramAccounts("token")).rejects.toThrow("No Instagram account");
    respond({ data: [{ id: "111" }], paging: { next: "next", cursors: { after: "same" } } });
    respond({ data: [], paging: { next: "next", cursors: { after: "same" } } });
    await expect(getAssignedInstagramAccounts("token")).rejects.toThrow("Unable to finish");
  });
  it("addresses the selected Instagram account rather than the system user", async () => {
    respond({ data: [] });
    await getUserMedia("token", 25, "222");
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe("/v27.0/222/media");
  });
  it("sends private replies through the Facebook Graph host", async () => {
    respond({ recipient_id: "recipient", message_id: "message" });
    await sendPrivateReplyWithButton("token", "111", "comment", "hello", "Open", "reveal:test");
    expect(new URL(fetchMock.mock.calls[0][0]).origin).toBe("https://graph.facebook.com");
  });
  it("subscribes Unified accounts to button taps as well as comments and DMs", async () => {
    respond({ success: true });
    await subscribeInstagramAccountToWebhooks("111", "token");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).subscribed_fields)
      .toEqual(["comments", "messages", "messaging_postbacks"]);
  });
  it("keeps the older login transport when Unified Login is disabled", async () => {
    vi.stubEnv("META_LOGIN_CONFIG_ID", "");
    expect(new URL(getAuthorizationUrl("https://app.test/cb", "state")).origin)
      .toBe("https://www.instagram.com");
    respond({ data: [] });
    await getUserMedia("token", 25, "111");
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe("/v27.0/me/media");
    expect(new URL(fetchMock.mock.calls[0][0]).origin).toBe("https://graph.instagram.com");
  });
});
