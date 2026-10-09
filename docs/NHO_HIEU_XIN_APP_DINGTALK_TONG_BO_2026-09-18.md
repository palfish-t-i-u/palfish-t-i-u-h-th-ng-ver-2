# Nhờ anh Hiếu: xin quyền tạo app DingTalk bên tổng bộ (để đồng bộ GMV)

**Ngày:** 18/09/2026 · **Người nhờ:** Minh · **Người nhận:** anh Hiếu → chuyển tiếp tổng bộ (北京读我科技)

---

## 1. Trình bày cho anh Hiếu

Theo việc Josh giao — thống nhất một nguồn dữ liệu GMV — em đang nối **2 file số liệu trên DingTalk** ("SM HANOI daily report NEW" và "HCM Revenue statement") vào file tài chính **All File**, để All File tự cập nhật và làm nguồn chuẩn duy nhất cho BQ của anh và kho dữ liệu của Eric.

Phần khung + dữ liệu em làm xong rồi (đã dựng 2 tab **"SM Hanoi Auto"** và **"HCM REV Auto"** trong All File, đổ đủ số + định dạng y hệt bản gốc). Chỉ còn khâu **tự động đọc dữ liệu từ DingTalk**, và chỗ này bị chặn vì quyền tổ chức:

- Để đọc tự động, cần một app trên DingTalk. App này **bắt buộc phải nằm trong tổ chức DingTalk của tổng bộ (北京读我科技)** — vì 2 file thuộc tổ chức đó.
- Em chỉ là **thành viên** tổ chức tổng bộ, **không có quyền tạo app** ở đó. Em đã thử tạo app bên tổ chức Palfish Vietnam nhưng DingTalk **chặn thẳng**: không cho app của tổ chức này đọc tài liệu của tổ chức khác (lỗi `forbidden.acrossOrg`).

Nên nhờ anh **chuyển giúp request bên dưới cho tổng bộ**, nhờ họ làm 1 trong 2 cách (cách 2 nhanh hơn). Có khóa app là em ráp vào chạy tự động ngay.

---

## 2. Request gửi tổng bộ — BẢN TIẾNG TRUNG (anh gửi phần này)

> 需要在 **北京读我科技** 钉钉组织内建一个「企业内部应用」，读取 GMV 两个智能表格（**SM HANOI daily report NEW**、**HCM Revenue statement**）做自动同步。二选一：
>
> **方案一：** 给 **Pham Anh Minh**（邮箱 phamanhminhw01697@ipalfish.com，工号 W01697，部门 东南亚业务-越南-越南河内团队）开通「企业内部应用开发者」权限，由他自建应用；
>
> **方案二（更快）：** 由总部开发同学建一个企业内部应用，开通「钉钉表格读权限 `Document.Workbook.Read`」，把 **AppKey / AppSecret** 提供给 Pham Anh Minh。

---

## 3. Bản dịch tiếng Việt (để anh + em nắm nội dung — không cần gửi)

> Cần tạo một **app nội bộ trong tổ chức DingTalk 北京读我科技** để đọc 2 smart sheet GMV (**SM HANOI daily report NEW**, **HCM Revenue statement**) đồng bộ tự động. Nhờ 1 trong 2 cách:
>
> **Cách 1:** cấp cho **Pham Anh Minh** (email phamanhminhw01697@ipalfish.com, mã NV W01697, phòng Đông Nam Á - Việt Nam - team Hà Nội) quyền **developer app nội bộ** trong tổ chức 读我科技, rồi Minh tự tạo app.
>
> **Cách 2 (nhanh hơn):** một bạn dev tổng bộ tạo giúp app nội bộ trong tổ chức 读我科技, bật quyền **đọc bảng tính (`Document.Workbook.Read`)**, rồi đưa **AppKey / AppSecret** cho Minh.

---

**Ghi chú kỹ thuật (nội bộ):** app cần đúng quyền `Document.Workbook.Read` (钉钉表格读权限). Đọc qua `GET /v1.0/doc/workbooks/{workbookId}/sheets` với `operatorId` = unionId của người có quyền xem sheet. Node id 2 file: HN `2Amq4vjg89gPwQM2FPYMnarxV3kdP0wQ`, HCM `R1zknDm0WR3AGRKEha14qyKlVBQEx5rG`. Đã xác nhận app khác-org bị chặn (`forbidden.acrossOrg`) → phải là app trong chính org 读我科技.
