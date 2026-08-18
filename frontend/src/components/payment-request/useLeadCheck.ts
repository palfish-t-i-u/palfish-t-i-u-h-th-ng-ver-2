import { useCallback, useRef, useState } from "react";
import { endpoints } from "../../lib/api";
import { NEW_CHECK_SOURCES } from "../../constants/leadSource";

export type LeadCheckStatus = "idle" | "skipped" | "loading" | "matched" | "none" | "error";

export interface LeadHit {
  leadId: string;
  name: string | null;
  phone: string | null;
  leadDate: string | null;
  crmCode: string | null;
  ec: string | null;
  status: string | null;
  status2: string | null;
  nation: string | null;
  uid: string | null;
  matchSource: string | null;
}

export interface LeadCheckState {
  status: LeadCheckStatus;
  matchedBy: "sdt" | "sdt_goc" | "uid" | null;
  leads: LeadHit[];
  selectedLeadId: string | null;
  sdtGoc: string;
  reason: string;
  checkedPhone: string;
}

const INITIAL_STATE: LeadCheckState = {
  status: "idle",
  matchedBy: null,
  leads: [],
  selectedLeadId: null,
  sdtGoc: "",
  reason: "",
  checkedPhone: "",
};

function toHits(raw: typeof endpoints.leads extends { lookup: (...a: never[]) => Promise<{ data: { leads: infer L } }> } ? L : never): LeadHit[] {
  return (raw as { lead_id: string; name: string | null; phone: string | null; lead_date: string | null; crm_code: string | null; ec: string | null; status: string | null; status_2: string | null; nation: string | null; uid: string | null; match_source: string | null }[]).map((l) => ({
    leadId: l.lead_id,
    name: l.name,
    phone: l.phone,
    leadDate: l.lead_date,
    crmCode: l.crm_code,
    ec: l.ec,
    status: l.status,
    status2: l.status_2,
    nation: l.nation,
    uid: l.uid,
    matchSource: l.match_source,
  }));
}

export function buildLeadPayload(state: LeadCheckState) {
  if (state.status === "idle" || state.status === "skipped" || state.status === "loading" || state.status === "error") {
    return {
      sdt_goc: null,
      lead_matched: null,
      lead_id: null,
      lead_matched_by: null,
      ly_do_khong_ghep: null,
    };
  }
  if (state.status === "matched") {
    return {
      sdt_goc: state.sdtGoc || null,
      lead_matched: true,
      lead_id: state.selectedLeadId,
      lead_matched_by: state.matchedBy,
      ly_do_khong_ghep: null,
    };
  }
  // status === "none"
  return {
    sdt_goc: state.sdtGoc || null,
    lead_matched: false,
    lead_id: null,
    lead_matched_by: null,
    ly_do_khong_ghep: state.reason || null,
  };
}

export function useLeadCheck() {
  const [state, setState] = useState<LeadCheckState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  const runCheck = useCallback(async (phone: string, uid?: string, orderDate?: string, ecSale?: string) => {
    const digits = phone.replace(/[^0-9]/g, "");
    if (digits.length < 9) {
      setState((s) => ({ ...s, status: "idle" }));
      return;
    }
    const phone9 = digits.slice(-9);

    if (state.checkedPhone === phone9 && state.status !== "idle") return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState((s) => ({ ...s, status: "loading", checkedPhone: phone9 }));

    try {
      const { data } = await endpoints.leads.lookup({
        phone,
        order_date: orderDate,
        uid: uid || undefined,
        ec_sale: ecSale || undefined,
      });

      if (ctrl.signal.aborted) return;

      if (data.matched && data.leads.length > 0) {
        const hits = toHits(data.leads as never);
        setState((s) => ({
          ...s,
          status: "matched",
          matchedBy: (data.matched_by as LeadCheckState["matchedBy"]) ?? "sdt",
          leads: hits,
          selectedLeadId: hits[0]?.leadId ?? null,
          sdtGoc: "",
          reason: "",
        }));
      } else {
        setState((s) => ({
          ...s,
          status: "none",
          matchedBy: null,
          leads: [],
          selectedLeadId: null,
        }));
      }
    } catch {
      if (ctrl.signal.aborted) return;
      setState((s) => ({ ...s, status: "error" }));
    }
  }, [state.checkedPhone, state.status]);

  const runCheckSdtGoc = useCallback(async (sdtGocRaw: string, orderDate?: string, ecSale?: string) => {
    const digits = sdtGocRaw.replace(/[^0-9]/g, "");
    if (digits.length < 9) return;

    setState((s) => ({ ...s, status: "loading", sdtGoc: sdtGocRaw }));

    try {
      const { data } = await endpoints.leads.lookup({
        phone: sdtGocRaw,
        order_date: orderDate,
        ec_sale: ecSale || undefined,
      });

      if (data.matched && data.leads.length > 0) {
        const hits = toHits(data.leads as never);
        setState((s) => ({
          ...s,
          status: "matched",
          matchedBy: "sdt_goc",
          leads: hits,
          selectedLeadId: hits[0]?.leadId ?? null,
          reason: "",
        }));
      } else {
        setState((s) => ({
          ...s,
          status: "none",
          matchedBy: null,
          leads: [],
          selectedLeadId: null,
        }));
      }
    } catch {
      setState((s) => ({ ...s, status: "none" }));
    }
  }, []);

  const selectLead = useCallback((leadId: string) => {
    setState((s) => ({ ...s, selectedLeadId: leadId }));
  }, []);

  const setSdtGoc = useCallback((val: string) => {
    setState((s) => ({ ...s, sdtGoc: val }));
  }, []);

  const setReason = useCallback((val: string) => {
    setState((s) => ({ ...s, reason: val }));
  }, []);

  const shouldCheck = useCallback((leadSource: string | undefined | null): boolean => {
    return NEW_CHECK_SOURCES.has(leadSource ?? "");
  }, []);

  return {
    leadCheck: state,
    runCheck,
    runCheckSdtGoc,
    selectLead,
    setSdtGoc,
    setReason,
    resetLeadCheck: reset,
    shouldCheck,
    buildLeadPayload: () => buildLeadPayload(state),
  };
}
