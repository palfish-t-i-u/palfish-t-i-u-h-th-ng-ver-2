import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", () => ({ endpoints: { leads: { lookup } } }));

import { buildLeadPayload, useLeadCheck } from "./useLeadCheck";
import type { LeadCheckState } from "./useLeadCheck";

afterEach(() => { lookup.mockReset(); });

const IDLE_STATE: LeadCheckState = {
  status: "idle", matchedBy: null, leads: [], selectedLeadId: null,
  sdtGoc: "", reason: "", checkedPhone: "",
};

describe("useLeadCheck", () => {
  it("matched: 1 lead → status matched + selectedLeadId = lead đầu", async () => {
    lookup.mockResolvedValue({ data: {
      matched: true, matched_by: "sdt",
      leads: [{ lead_id: "L1", name: "A", phone: "0912345678", lead_date: "2026-07-01",
                crm_code: "300265", ec: "E", sale_name: "Le Thi Thanh Hien",
                status: "L4", status_2: null, nation: null,
                uid: null, match_source: "phone" }],
    } });
    const { result } = renderHook(() => useLeadCheck());
    await act(async () => { await result.current.runCheck("0912345678"); });
    expect(result.current.leadCheck.status).toBe("matched");
    expect(result.current.leadCheck.selectedLeadId).toBe("L1");
    expect(result.current.leadCheck.matchedBy).toBe("sdt");
    expect(result.current.leadCheck.leads[0].saleName).toBe("Le Thi Thanh Hien");
  });

  it("matched: nhiều lead → radio, selectedLeadId = dòng đầu", async () => {
    lookup.mockResolvedValue({ data: {
      matched: true, matched_by: "sdt",
      leads: [
        { lead_id: "L1", name: "A", phone: "0912", lead_date: "2026-08-01",
          crm_code: "300265", ec: "E", status: "L4", status_2: null, nation: null, uid: null, match_source: "phone" },
        { lead_id: "L2", name: "B", phone: "0912", lead_date: "2026-07-01",
          crm_code: "300265", ec: "E2", status: "L3", status_2: null, nation: null, uid: null, match_source: "note" },
      ],
    } });
    const { result } = renderHook(() => useLeadCheck());
    await act(async () => { await result.current.runCheck("0912345678"); });
    expect(result.current.leadCheck.leads).toHaveLength(2);
    expect(result.current.leadCheck.selectedLeadId).toBe("L1");
  });

  it("none: 0 lead → status none", async () => {
    lookup.mockResolvedValue({ data: { matched: false, matched_by: null, leads: [] } });
    const { result } = renderHook(() => useLeadCheck());
    await act(async () => { await result.current.runCheck("0999999999"); });
    expect(result.current.leadCheck.status).toBe("none");
  });

  it("fail-open: API reject → status error, không throw", async () => {
    lookup.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useLeadCheck());
    await act(async () => { await result.current.runCheck("0912345678"); });
    expect(result.current.leadCheck.status).toBe("error");
  });

  it("số <9 chữ số → không gọi API, status idle", async () => {
    const { result } = renderHook(() => useLeadCheck());
    await act(async () => { await result.current.runCheck("12345678"); });
    expect(lookup).not.toHaveBeenCalled();
    expect(result.current.leadCheck.status).toBe("idle");
  });

  it("resetLeadCheck → về idle", async () => {
    lookup.mockResolvedValue({ data: { matched: false, matched_by: null, leads: [] } });
    const { result } = renderHook(() => useLeadCheck());
    await act(async () => { await result.current.runCheck("0912345678"); });
    expect(result.current.leadCheck.status).toBe("none");
    act(() => { result.current.resetLeadCheck(); });
    expect(result.current.leadCheck.status).toBe("idle");
  });
});

describe("buildLeadPayload", () => {
  it("idle → trả đủ 5 key null", () => {
    const p = buildLeadPayload(IDLE_STATE);
    expect(p).toEqual({
      sdt_goc: null, lead_matched: null, lead_id: null,
      lead_matched_by: null, ly_do_khong_ghep: null,
    });
  });

  it("error → trả đủ 5 key null (fail-open)", () => {
    const p = buildLeadPayload({ ...IDLE_STATE, status: "error" });
    expect(p).toEqual({
      sdt_goc: null, lead_matched: null, lead_id: null,
      lead_matched_by: null, ly_do_khong_ghep: null,
    });
  });

  it("matched → lead_matched true + lead_id + matched_by", () => {
    const p = buildLeadPayload({
      ...IDLE_STATE, status: "matched", matchedBy: "sdt",
      leads: [{ leadId: "L1", name: "A", phone: null, leadDate: null, crmCode: null,
                ec: null, saleName: null, status: null, status2: null, nation: null, uid: null, matchSource: null }],
      selectedLeadId: "L1",
    });
    expect(p.lead_matched).toBe(true);
    expect(p.lead_id).toBe("L1");
    expect(p.lead_matched_by).toBe("sdt");
    expect(p.ly_do_khong_ghep).toBeNull();
  });

  it("none + reason → lead_matched false + ly_do", () => {
    const p = buildLeadPayload({ ...IDLE_STATE, status: "none", reason: "TU_TIM_DEN", checkedPhone: "912345678" });
    expect(p.lead_matched).toBe(false);
    expect(p.ly_do_khong_ghep).toBe("TU_TIM_DEN");
    expect(p.lead_id).toBeNull();
  });

  it("none + sdtGoc → lưu sdt_goc nguyên bản (không format)", () => {
    const p = buildLeadPayload({ ...IDLE_STATE, status: "none", sdtGoc: "0912 345 678", checkedPhone: "912" });
    expect(p.sdt_goc).toBe("0912 345 678");
    expect(p.lead_matched).toBe(false);
  });
});
