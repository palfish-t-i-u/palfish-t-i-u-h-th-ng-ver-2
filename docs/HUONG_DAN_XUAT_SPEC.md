# Hướng dẫn xuất Spec từ Prototype

## Workflow

```
Bước 1: Họp → thiết kế prototype HTML bằng Claude Design (như bình thường)
Bước 2: Prototype xong → copy prompt bên dưới → paste vào Claude Design
Bước 3: Claude Design xuất file spec → lưu cùng thư mục với file HTML
Bước 4: Gửi cả 2 file (HTML + spec) cho team dev
```

Chỉ thêm 1 bước duy nhất so với hiện tại: **copy prompt → paste → nhận spec**.

---

## Chọn prompt theo tình huống

| Tình huống | Dùng prompt |
|-----------|-------------|
| Đã có prototype HTML | Prompt A |
| Chưa có prototype, chỉ có ý tưởng/yêu cầu | Prompt B |

---

## Prompt A — Có prototype HTML

Dùng khi đã thiết kế xong prototype, cần xuất spec đi kèm.

---

> Từ prototype HTML vừa thiết kế, xuất file spec markdown.
>
> **PHẦN QUAN TRỌNG NHẤT — không được bỏ qua:**
>
> Với MỖI màn hình trong prototype, liệt kê TẤT CẢ các phần tử tương tác (nút bấm, link, dropdown, form, row click...) và mô tả theo format:
>
> ```
> #### [Tên nút/hành động]
>
> **Mở dialog/chuyển trang/thực hiện gì:**
> - Nếu mở dialog: liệt kê từng field (tên, loại input, bắt buộc?, ghi chú)
> - Nếu chuyển trang: đến màn hình nào
>
> **Bấm "Lưu"/"Xác nhận":**
> 1. Bước 1 xảy ra gì
> 2. Bước 2 xảy ra gì
>
> **Lỗi có thể xảy ra:** mô tả lỗi + thông báo hiển thị
>
> **Cần code:**
> | Layer | Việc | Chi tiết |
> |-------|------|----------|
> | BE | method + path | Request body, response, quyền |
> | FE | Component gì | Gọi API nào, xử lý kết quả thế nào |
> | DB | Bảng/cột | Nếu cần tạo mới hoặc sửa |
> ```
>
> **Nếu prototype có 5 nút thì spec phải có 5 block mô tả. Không được gom chung, không được bỏ sót.**
>
> **Cấu trúc đầy đủ file spec:**
>
> 1. **Mục đích** — 1-2 câu
>
> 2. **Design Spec:**
>    - Màu sắc: bảng (vai trò | hex | token có sẵn?)
>    - Typography: bảng (vai trò | size | weight)
>    - Component styles: badges, buttons, dialog
>    - Spacing
>
> 3. **Từng màn hình** (lặp lại cho mỗi màn hình):
>    - **Nhìn thấy gì**: summary cards, bộ lọc, tabs, bảng (liệt kê từng cột)
>    - **Bấm vào đâu → Xảy ra gì → Cần code gì**: MỌI nút, MỌI hành động (format ở trên)
>
> 4. **Luồng trạng thái** — sơ đồ ASCII nếu có trạng thái chuyển đổi
>
> 5. **Quy tắc nghiệp vụ** — rules ẩn không thể hiện rõ qua UI
>
> 6. **Phân quyền** — bảng: hành động × role (sale / leader / manager / system)
>
> 7. **DB Schema** — SQL tạo bảng mới, sửa bảng cũ (nếu có)
>
> 8. **Chia task** — bảng: #, việc, người, ước lượng
>
> **Token màu sắc có sẵn trong project** (dùng để đối chiếu):
> - `--gmv-bg`: #f6f7fb, `--gmv-canvas`: #ffffff
> - `--gmv-primary`: #7260ff, `--gmv-primary-hover`: #5f4ee6, `--gmv-primary-soft`: #eeebff
> - `--gmv-text`: rgba(0,0,0,0.65), `--gmv-text-strong`: #1f2330, `--gmv-muted`: #5c7db8
> - `--gmv-border`: #d6dae4
> - `--gmv-ok`: #2f9e44, `--gmv-ok-soft`: #e7f5ea
> - `--gmv-warn`: #f08c00, `--gmv-warn-soft`: #fff4dc
> - `--gmv-danger`: #c92a2a, `--gmv-danger-soft`: #fde2e6
> - `--gmv-table-head`: #f3f5fa, `--gmv-row-hover`: #fafbfe
>
> **Trước khi trả kết quả, tự kiểm tra:**
> - [ ] Mỗi nút bấm trong prototype đã có block mô tả chưa?
> - [ ] Mỗi block có bảng "Cần code" (BE/FE/DB) chưa?
> - [ ] Mỗi dialog đã liệt kê từng field chưa?
> - [ ] Phân quyền có bảng role × hành động chưa?
> - [ ] Design spec có bảng màu sắc chưa?
>
> Nếu thiếu bất kỳ mục nào → bổ sung trước khi trả kết quả.
>
> Xuất ra markdown. Tên file: `spec-[ten-tinh-nang].md`

---

## Prompt B — Chưa có prototype, chỉ có ý tưởng

Dùng khi mới họp xong, có yêu cầu nghiệp vụ nhưng chưa thiết kế UI. Prompt này bắt AI **phải nghĩ ra các màn hình** trước khi viết data model.

---

> Từ yêu cầu nghiệp vụ bên dưới, xuất file spec markdown.
>
> **THỨ TỰ BẮT BUỘC — viết theo đúng thứ tự này:**
>
> **Bước 1 — Liệt kê màn hình trước:**
> Từ yêu cầu, suy ra hệ thống cần bao nhiêu màn hình/tab. Liệt kê dạng bảng:
> | # | Màn hình | Mục đích | Ai dùng |
>
> **Bước 2 — Mô tả từng màn hình:**
> Với MỖI màn hình ở bước 1:
> - **Nhìn thấy gì**: bảng có cột gì, summary cards, bộ lọc, tabs
> - **Bấm vào đâu → Xảy ra gì → Cần code gì**: MỌI nút hành động, format:
>
> ```
> #### [Tên nút]
> Mở dialog/chuyển trang/thực hiện gì
> Các field trong dialog (nếu có): bảng field/loại/bắt buộc/ghi chú
> Bấm Lưu: bước 1, bước 2...
> Lỗi có thể: ...
> Cần code:
> | Layer | Việc | Chi tiết |
> | BE | method + path | request, response, quyền |
> | FE | component | gọi API nào |
> | DB | bảng/cột | tạo mới hoặc sửa |
> ```
>
> **Bước 3 — Data model:**
> Từ các API đã liệt kê ở bước 2, suy ra cần bảng DB nào. Viết SQL schema.
>
> **Bước 4 — Phần còn lại:**
> - Quy tắc nghiệp vụ (rules ẩn)
> - Phân quyền: bảng hành động × role
> - Luồng trạng thái (nếu có)
> - Chia task: bảng #/việc/người/ước lượng
>
> **QUAN TRỌNG:**
> - KHÔNG được viết data model trước rồi bỏ qua phần UI. Thứ tự là: màn hình → tương tác → API → data model.
> - Nếu yêu cầu nghiệp vụ mơ hồ (vd "nhập kiểu Excel"), hãy tự đề xuất UI cụ thể (nút gì, dialog gì) rồi ghi rõ "đề xuất, cần confirm".
>
> **Trước khi trả kết quả, tự kiểm tra:**
> - [ ] Đã liệt kê tất cả màn hình chưa?
> - [ ] Mỗi màn hình có ít nhất 1 nút hành động + block "Cần code" chưa?
> - [ ] Đã có bảng phân quyền role × hành động chưa?
> - [ ] Data model có đủ bảng cho tất cả API đã liệt kê chưa?
>
> Xuất ra markdown. Tên file: `spec-[ten-tinh-nang].md`
>
> ---
> Yêu cầu nghiệp vụ:
> [Dán yêu cầu vào đây]

---

## File tham khảo

- `docs/SPEC_TEMPLATE.md` — Ví dụ hoàn chỉnh (màn hình "Tài khoản Auth" làm mẫu)
