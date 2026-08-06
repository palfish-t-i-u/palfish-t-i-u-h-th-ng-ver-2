# Khách OV: phát hiện bằng đầu số ĐT (bỏ province) → nhầm khách số Việt

## Problem

Khách nước ngoài (OV) dùng **số điện thoại Việt** (đầu số +84). Tạo PR đúng
(chọn "Khách nước ngoài" + quốc gia → lưu tên nước vào ô `province`). Nhưng ở
bước **Sửa/Kích hoạt** trong `PaymentRequestDetailDrawer`, toggle "Khách VN /
nước ngoài" tự nhảy về **"Khách VN"** và gate địa chỉ đòi Tỉnh+Phường+Số nhà →
**chặn kích hoạt** dù khách rõ ràng ở nước ngoài. (case Khương Mạnh Dũng,
province="Japan", SĐT VN 84-, 04/8/2026)

## Trap

Phân biệt OV vs VN chỉ xét **`country`** (đầu số điện thoại):

```ts
const isForeign = (request.country || "VN") !== "VN";     // reconstruct toggle
// và
const isForeign = (args.country || "VN") !== "VN";        // activationAddressComplete
```

Khách OV dùng SĐT Việt → `country` = "VN" → `isForeign` = false → coi là khách
VN. Ô `province` đang giữ tên quốc gia ("Japan") bị **bỏ qua hoàn toàn**.

Nguy hiểm hơn workaround "điền tạm Tỉnh/Phường VN cho qua": kế toán (Thu Hiền)
kích hoạt xong, sau sales sửa địa chỉ về đúng → kế toán không biết → dữ liệu
hoá đơn sai âm thầm.

## Insight

BE đã làm ĐÚNG từ đầu: `_invoice_address_complete` (activation_routes.py) coi
là OV khi `country != VN` **HOẶC** `province ∈ FOREIGN_COUNTRY_NAMES`. FE
`getInvoiceBlockers` (ActivationTab) cũng check `province`. Nhưng 2 chỗ khác ở
FE (`activationAddressComplete` + reconstruct toggle trong drawer) chỉ check
`country` → **lệch định nghĩa OV giữa các lớp**. Cùng một khái niệm "khách nước
ngoài" mà mỗi nơi tự suy ra một kiểu = mầm bug.

`province` mới là nguồn chân lý cho "khách ở đâu"; `country` chỉ là đầu số để
format/gửi tin — hai trục độc lập, đừng dùng đầu số suy ra quốc tịch địa chỉ.

## Rule

- Khách OV = `country !== "VN"` **HOẶC** `province` là tên quốc gia nước ngoài.
  Gom vào 1 helper duy nhất (`isForeignCustomer(country, province)` ở
  `paymentRequestUtils.ts`) và dùng ở **mọi** nơi phân biệt OV/VN — đừng viết
  lại inline `country !== "VN"`.
- Khi 1 khái niệm nghiệp vụ (OV/VN, is_test, ownership…) được suy ra ở nhiều
  lớp, phải cùng một hàm/định nghĩa. Thấy BE check 2 vế còn FE 1 vế = red flag.
- Đầu số điện thoại `country` ≠ quốc gia cư trú. Số Việt không có nghĩa khách ở
  VN.
