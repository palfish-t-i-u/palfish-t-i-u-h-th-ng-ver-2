import { describe, expect, it } from "vitest";
import { subTeamLabel } from "./subTeamLabels";

describe("subTeamLabel", () => {
  it("remap sang tên leader cho Inhouse 1", () => {
    expect(subTeamLabel("Team 1", "Inhouse 1")).toBe("Team HuongPT");
    expect(subTeamLabel("Team 2", "Inhouse 1")).toBe("Team SonTT");
  });

  it("giữ nhãn thô cho team khác (Inhouse 2) — không mượn leader IH1", () => {
    expect(subTeamLabel("Team 1", "Inhouse 2")).toBe("Team 1");
    expect(subTeamLabel("Team 2", "Inhouse 2")).toBe("Team 2");
  });

  it("không truyền team → backward-compat, vẫn remap", () => {
    expect(subTeamLabel("Team 2")).toBe("Team SonTT");
  });

  it("rỗng → chuỗi rỗng", () => {
    expect(subTeamLabel(null, "Inhouse 2")).toBe("");
    expect(subTeamLabel(undefined)).toBe("");
    expect(subTeamLabel("")).toBe("");
  });
});
