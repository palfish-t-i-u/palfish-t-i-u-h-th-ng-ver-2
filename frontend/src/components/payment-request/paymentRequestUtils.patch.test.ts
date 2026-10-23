import { describe, expect, it } from "vitest";
import { toActiveRequestPatchUidsData } from "./paymentRequestUtils";
import type { ActiveRequest } from "../../types/paymentRequest";

/**
 * Regression 23/10: full-PATCH từ màn B3 (sửa AR / gắn order_id) không mang 3 ô bàn giao CS
 * → BE ghi null đè → AR-1746/1753 mất Kênh/Contact/Note sale đã điền lúc báo đơn.
 */
describe("toActiveRequestPatchUidsData — giữ 3 ô bàn giao CS", () => {
  const ar = {
    id: "AR-1",
    uids: [
      {
        uid: "3309455021",
        name: "Lê Ngọc Khánh Linh",
        phone: "974903081",
        country: "VN",
        courses: [
          {
            courseCode: "CC-2596-001",
            packageName: "2/W- UPSALE 96 PHI+10 HN",
            amount: 16430000,
            orderId: "",
            invoiced: false,
            leadSource: "gia_han",
            careChannel: "Zalo",
            careContactId: "3309455021",
            handoverNote: "Sales đang hỗ trợ chọn thêm cô giáo mới",
          },
        ],
      },
    ],
  } as unknown as ActiveRequest;

  it("payload course mang care_channel / care_contact_id / handover_note", () => {
    const [u] = toActiveRequestPatchUidsData(ar);
    expect(u.courses[0]).toMatchObject({
      code: "CC-2596-001",
      care_channel: "Zalo",
      care_contact_id: "3309455021",
      handover_note: "Sales đang hỗ trợ chọn thêm cô giáo mới",
    });
  });

  it("course không có handover → key undefined (BE giữ giá trị cũ, không ghi rỗng)", () => {
    const bare = { ...ar, uids: [{ ...ar.uids[0], courses: [{ courseCode: "C", packageName: "P", amount: 1 }] }] } as unknown as ActiveRequest;
    const [u] = toActiveRequestPatchUidsData(bare);
    expect(u.courses[0].care_channel).toBeUndefined();
    expect(u.courses[0].care_contact_id).toBeUndefined();
    expect(u.courses[0].handover_note).toBeUndefined();
  });
});
