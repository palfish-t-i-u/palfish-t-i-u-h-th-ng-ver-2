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

## Prompt xuất spec

Sau khi prototype HTML hoàn chỉnh, paste đoạn sau vào Claude Design:

---

> Từ prototype HTML vừa thiết kế, xuất 1 file spec theo cấu trúc bên dưới.
>
> **Nguyên tắc:**
> - Mô tả theo trải nghiệm người dùng: nhìn thấy gì trên màn hình → bấm vào đâu → xảy ra gì
> - Mỗi nút/hành động phải có bảng "Cần code" ghi rõ: BE cần API gì (method, path, params, response), FE cần component/logic gì, DB cần bảng/cột gì
> - Design spec: liệt kê màu sắc, font size, component styles dùng trong prototype. Nếu trùng token có sẵn trong project thì ghi tên token
> - Không cần giải thích dài — dùng bảng, gạch đầu dòng, ngắn gọn
>
> **Cấu trúc file spec:**
>
> 1. **Mục đích** — 1-2 câu
> 2. **Design Spec** — Màu sắc (bảng: vai trò / hex / token có sẵn?), Typography (bảng: vai trò / size / weight), Component styles (badges, buttons, dialog), Spacing
> 3. **Màn hình: [Tên]**
>    - **Nhìn thấy gì**: summary cards, bộ lọc, tabs, bảng (liệt kê từng cột)
>    - **Bấm vào đâu → Xảy ra gì → Cần code gì**: từng nút, từng hành động, mỗi cái có bảng "Cần code" (Layer | Việc | Chi tiết)
> 4. **Luồng trạng thái** — sơ đồ chuyển đổi trạng thái (nếu có)
> 5. **Quy tắc nghiệp vụ** — các rule ẩn không thể hiện rõ qua UI
> 6. **Phân quyền** — bảng: hành động × role (sale / leader / manager / system)
> 7. **DB Schema** — SQL tạo bảng mới, sửa bảng cũ
> 8. **Chia task** — bảng: #, việc, người, ước lượng
>
> **Token màu sắc có sẵn trong project** (dùng để đối chiếu):
> - `--gmv-bg`: #f6f7fb (nền trang)
> - `--gmv-canvas`: #ffffff (nền card/bảng)
> - `--gmv-primary`: #7260ff, `--gmv-primary-hover`: #5f4ee6, `--gmv-primary-soft`: #eeebff
> - `--gmv-text`: rgba(0,0,0,0.65), `--gmv-text-strong`: #1f2330, `--gmv-muted`: #5c7db8
> - `--gmv-border`: #d6dae4
> - `--gmv-ok`: #2f9e44, `--gmv-ok-soft`: #e7f5ea
> - `--gmv-warn`: #f08c00, `--gmv-warn-soft`: #fff4dc
> - `--gmv-danger`: #c92a2a, `--gmv-danger-soft`: #fde2e6
> - `--gmv-table-head`: #f3f5fa, `--gmv-row-hover`: #fafbfe
>
> Xuất ra markdown. Tên file: `spec-[ten-tinh-nang].md`

---

## File tham khảo

- `docs/SPEC_TEMPLATE.md` — Ví dụ hoàn chỉnh (dùng màn hình "Tài khoản Auth" làm mẫu)
