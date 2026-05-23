import { http, HttpResponse } from "msw";

const BASE = "http://localhost:8000";

export const handlers = [
  http.get(`${BASE}/orders`, () =>
    HttpResponse.json({
      orders: [
        {
          id: "1",
          maDonHang: "KH001",
          uid: "U001",
          tenKhach: "Test",
          infoCode: "IC-TEST-001",
          tongTien: 500000,
          tienVe: true,
          donCRM: false,
          billImage: null,
        },
      ],
    })
  ),

  http.post(`${BASE}/info-code`, async ({ request }) => {
    const body = (await request.json()) as {
      customerName: string;
      uid: string;
      amount: number;
    };
    return HttpResponse.json(
      { infoCode: "IC-TEST-001", ...body, status: "PENDING" },
      { status: 201 }
    );
  }),

  http.get(`${BASE}/info-code/:code/status`, ({ params }) =>
    HttpResponse.json({ infoCode: params.code, status: "MATCHED" })
  ),

  http.get(`${BASE}/webhook/events`, () =>
    HttpResponse.json({
      events: [{ id: 1, type: "BANK_CREDIT", amount: 500000, ts: Date.now() }],
    })
  ),

  http.post(`${BASE}/crm/activate`, async ({ request }) => {
    const body = (await request.json()) as { infoCode: string };
    return HttpResponse.json({ infoCode: body.infoCode, activated: true }, { status: 200 });
  }),
];
