// frontend/src/components/ActivationTab.uidSync.test.ts
import { describe, it, expect } from "vitest";
import { getUidSyncState } from "./ActivationTab.uidSync";

describe("getUidSyncState", () => {
  it("uid khối === pr.uid → match (badge 'UID từ PR' giữ nguyên)", () => {
    expect(getUidSyncState("3314485764", "3314485764", { matchedOtherPr: false, singleUid: true }))
      .toEqual({ kind: "match" });
  });
  it("uid khối rỗng → none (không cảnh báo)", () => {
    expect(getUidSyncState("", "3314485764", { matchedOtherPr: false, singleUid: true }))
      .toEqual({ kind: "none" });
    expect(getUidSyncState(null, "3314485764", { matchedOtherPr: false, singleUid: true }))
      .toEqual({ kind: "none" });
  });
  it("pr.uid rỗng → none (không có nguồn chuẩn để đối chiếu)", () => {
    expect(getUidSyncState("3314813941", "", { matchedOtherPr: false, singleUid: true }))
      .toEqual({ kind: "none" });
    expect(getUidSyncState("3314813941", null, { matchedOtherPr: false, singleUid: true }))
      .toEqual({ kind: "none" });
  });
  it("lệch + AR 1-UID + không khớp PR khác → diverged, cho 1-chạm", () => {
    expect(getUidSyncState("3314813941", "3314485764", { matchedOtherPr: false, singleUid: true }))
      .toEqual({ kind: "diverged", prUid: "3314485764", canOneClick: true });
  });
  it("lệch + AR đa-UID → diverged nhưng KHÔNG 1-chạm (G-UID1)", () => {
    expect(getUidSyncState("3314813941", "3314485764", { matchedOtherPr: false, singleUid: false }))
      .toEqual({ kind: "diverged", prUid: "3314485764", canOneClick: false });
  });
  it("uid khối thuộc PR khác (prByUid hit) → match hợp lệ, không cảnh báo (G-UID5)", () => {
    expect(getUidSyncState("9999999999", "3314485764", { matchedOtherPr: true, singleUid: false }))
      .toEqual({ kind: "match" });
  });
  it("chênh chỉ do whitespace → match (G-UID4 trim 2 phía)", () => {
    expect(getUidSyncState(" 3314485764 ", "3314485764", { matchedOtherPr: false, singleUid: true }))
      .toEqual({ kind: "match" });
  });
});
