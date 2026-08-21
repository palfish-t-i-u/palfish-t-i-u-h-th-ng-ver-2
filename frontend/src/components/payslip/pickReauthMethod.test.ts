import { describe, expect, it } from "vitest";
import { pickReauthMethod } from "./PayslipReauthModal";

function session(provider?: string, providers?: string[]) {
  return { user: { app_metadata: { provider, providers } } };
}

describe("pickReauthMethod", () => {
  // Existing cases (hasTotp defaults to false)
  it("returns google when providers includes google (no totp)", () => {
    expect(pickReauthMethod(session("google", ["google"]))).toBe("google");
  });

  it("returns google when providers has both email and google (no totp)", () => {
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

  // TOTP cases
  it("returns totp when google user has totp enrolled", () => {
    expect(pickReauthMethod(session("google", ["google"]), true)).toBe("totp");
  });

  it("returns totp when email+google user has totp enrolled", () => {
    expect(pickReauthMethod(session("email", ["email", "google"]), true)).toBe("totp");
  });

  it("returns totp when email user has totp enrolled", () => {
    expect(pickReauthMethod(session("email", ["email"]), true)).toBe("totp");
  });

  it("returns totp for null session when hasTotp=true", () => {
    expect(pickReauthMethod(null, true)).toBe("totp");
  });
});
