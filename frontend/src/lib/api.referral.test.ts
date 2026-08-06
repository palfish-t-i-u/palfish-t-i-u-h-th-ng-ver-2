/**
 * FE contract test cho endpoint credit-referral + serialize helpers.
 *
 * Đảm bảo:
 * - FE gọi đúng URL/method/body BE expect (BE đã có integration test ở
 *   backend/tests/test_referral_credit_endpoint.py).
 * - Response của BE được deserialize đúng sang ActiveRequest camelCase.
 * - Error 400/403 từ BE trồi lên dưới dạng axios error có response.data.detail.
 *
 * Nguồn lỗi nghiệp vụ thường gặp:
 * - BE trả lỗi "khoá chưa được kích hoạt" → FE phải show string đó.
 * - BE trả lỗi 403 (sale không có quyền) → FE phải show "Cần quyền Ops/..."
 */

import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { endpoints } from "./api";
import { fromApiActiveRequest } from "../components/payment-request/paymentRequestUtils";
import { server } from "../test/msw/server";

const BASE = "http://localhost:8000";

describe("creditReferral endpoint contract", () => {
  afterEach(() => server.resetHandlers());

  it("gửi PATCH tới /api/v1/active-requests/:id/credit-referral với body đúng", async () => {
    let receivedUrl = "";
    let receivedBody: Record<string, unknown> = {};

    server.use(
      http.patch(`${BASE}/api/v1/active-requests/:id/credit-referral`, async ({ request, params }) => {
        receivedUrl = String(params.id);
        receivedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: "AR-2026-0099",
          pr_id: "PR-2026-0099",
          customer_name: "PH A",
          uids_data: [
            {
              uid: "BUYER_B",
              phone: "0900000000",
              country: "VN",
              courses: [
                {
                  code: "CC-0099-001",
                  name: "Gói X",
                  amount: 5_000_000,
                  lead_source: "gioi_thieu",
                  referrer_uid: "REFERRER_A",
                  bonus_sessions_referee: 2,
                  bonus_sessions_referrer: 3,
                  referee_credited_at: "2026-06-20T08:00:00Z",
                  referee_credited_by: "manager@palfish.test",
                },
              ],
            },
          ],
        });
      })
    );

    const res = await endpoints.activeRequests.creditReferral("AR-2026-0099", {
      uid: "BUYER_B",
      course_code: "CC-0099-001",
      side: "referee",
      credited: true,
    });

    expect(receivedUrl).toBe("AR-2026-0099");
    expect(receivedBody).toEqual({
      uid: "BUYER_B",
      course_code: "CC-0099-001",
      side: "referee",
      credited: true,
    });
    expect(res.status).toBe(200);
  });

  it("deserialize response trả về camelCase ActiveRequest với refereeCreditedAt", async () => {
    server.use(
      http.patch(`${BASE}/api/v1/active-requests/:id/credit-referral`, () =>
        HttpResponse.json({
          id: "AR-2026-0099",
          pr_id: "PR-2026-0099",
          customer_name: "PH A",
          uids_data: [
            {
              uid: "BUYER_B",
              phone: "0900000000",
              country: "VN",
              courses: [
                {
                  code: "CC-0099-001",
                  name: "Gói X",
                  amount: 5_000_000,
                  lead_source: "gioi_thieu",
                  referrer_uid: "REFERRER_A",
                  bonus_sessions_referee: 2,
                  bonus_sessions_referrer: 3,
                  referee_credited_at: "2026-06-20T08:00:00Z",
                  referee_credited_by: "manager@palfish.test",
                  referrer_credited_at: null,
                  referrer_credited_by: null,
                },
              ],
            },
          ],
        })
      )
    );

    const res = await endpoints.activeRequests.creditReferral("AR-2026-0099", {
      uid: "BUYER_B",
      course_code: "CC-0099-001",
      side: "referee",
      credited: true,
    });
    const ar = fromApiActiveRequest(res.data);
    const course = ar.uids[0].courses[0];

    expect(course.leadSource).toBe("gioi_thieu");
    expect(course.referrerUid).toBe("REFERRER_A");
    expect(course.bonusSessionsReferee).toBe(2);
    expect(course.refereeCreditedAt).toBe("2026-06-20T08:00:00Z");
    expect(course.refereeCreditedBy).toBe("manager@palfish.test");
    expect(course.referrerCreditedAt).toBeNull();
  });

  it("gửi reason khi untick (credited=false)", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/api/v1/active-requests/:id/credit-referral`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: "AR-1", pr_id: "PR-1", customer_name: "", uids_data: [],
        });
      })
    );

    await endpoints.activeRequests.creditReferral("AR-1", {
      uid: "U", course_code: "C", side: "referee", credited: false,
      reason: "Cộng nhầm",
    });

    expect(body.credited).toBe(false);
    expect(body.reason).toBe("Cộng nhầm");
  });

  it("trồi lỗi 400 'khoá chưa tạo gói học' từ BE qua axios error", async () => {
    server.use(
      http.patch(`${BASE}/api/v1/active-requests/:id/credit-referral`, () =>
        HttpResponse.json(
          { detail: "Khoá học chưa được tạo gói học (chưa có Order ID) — không thể cộng buổi" },
          { status: 400 },
        )
      )
    );

    let captured: unknown = null;
    try {
      await endpoints.activeRequests.creditReferral("AR-1", {
        uid: "U", course_code: "C", side: "referee", credited: true,
      });
    } catch (e) {
      captured = e;
    }

    const err = captured as { response?: { status?: number; data?: { detail?: string } } };
    expect(err.response?.status).toBe(400);
    expect(err.response?.data?.detail).toContain("tạo gói học");
  });

  it("trồi lỗi 403 khi sale không có quyền", async () => {
    server.use(
      http.patch(`${BASE}/api/v1/active-requests/:id/credit-referral`, () =>
        HttpResponse.json(
          { detail: "Cần quyền Ops/Manager/System để xác nhận cộng buổi" },
          { status: 403 },
        )
      )
    );

    let captured: unknown = null;
    try {
      await endpoints.activeRequests.creditReferral("AR-1", {
        uid: "U", course_code: "C", side: "referrer", credited: true,
      });
    } catch (e) {
      captured = e;
    }

    const err = captured as { response?: { status?: number; data?: { detail?: string } } };
    expect(err.response?.status).toBe(403);
    expect(err.response?.data?.detail).toContain("Ops/Manager");
  });
});
