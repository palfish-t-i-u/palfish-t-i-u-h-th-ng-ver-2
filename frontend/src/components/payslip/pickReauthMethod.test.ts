import { describe, expect, it } from "vitest";
import { pickReauthMethod } from "./PayslipReauthModal";

function session(provider?: string, providers?: string[]) {
  return { user: { app_metadata: { provider, providers } } };
}

describe("pickReauthMethod", () => {
  it("returns google when providers includes google", () => {
    expect(pickReauthMethod(session("google", ["google"]))).toBe("google");
  });

  it("returns google when providers has both email and google", () => {
    expect(pickReauthMethod(session("email", ["email", "google"]))).toBe("google");
  });

  it("returns google when only provider field is google (no providers array)", () => {
    expect(pickReauthMethod(session("google"))).toBe("google");
  });

  it("returns password when provider is email and no google in providers", () => {
    expect(pickReauthMethod(session("email", ["email"]))).toBe("password");
  });

  it("returns password when provider is email with empty providers", () => {
    expect(pickReauthMethod(session("email", []))).toBe("password");
  });

  it("returns password when app_metadata is empty", () => {
    expect(pickReauthMethod({ user: { app_metadata: {} } })).toBe("password");
  });

  it("returns password for null session", () => {
    expect(pickReauthMethod(null)).toBe("password");
  });

  it("returns password when user has no app_metadata", () => {
    expect(pickReauthMethod({ user: {} })).toBe("password");
  });
});
