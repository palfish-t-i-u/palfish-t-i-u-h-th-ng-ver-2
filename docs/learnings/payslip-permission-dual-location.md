# Module permission registration phải sửa cả 4 file (BE + FE)

**Related files:** `backend/admin_routes.py`, `frontend/src/types/permissions.ts`

**Problem:** Thêm module mới ("payslip") vào hệ phân quyền — tab bị ẩn cho mọi người dù FE đã khai báo đúng.

**Trap:** Chỉ sửa `frontend/src/types/permissions.ts` (MODULE_LIST + DEFAULT_PERMISSIONS) rồi dừng. Trong trình duyệt, `/me` vẫn trả `"payslip":"none"` cho mọi user → `can("payslip")` luôn false → tab không bao giờ hiện, không lỗi nào nổi.

**Insight:** Phân quyền có **hai bản độc lập**:
- **Backend** `backend/admin_routes.py:141-199` — `MODULE_LIST` (danh sách module hợp lệ) + `DEFAULT_DEPT_PERMISSIONS` (mức mặc định theo phòng ban). `/me` endpoint BUILD response từ đây. Nếu key thiếu ở BE, client không bao giờ nhận được giá trị ≠ `"none"`.
- **Frontend** `frontend/src/types/permissions.ts:44-117` — `MODULE_LIST` (UI matrix) + `DEFAULT_PERMISSIONS` (seed data hiện form Phân quyền). Chỉ ảnh hưởng UI table, không ảnh hưởng `/me`.

Module mới phải được đăng ký ở **CẢ 4 chỗ**: BE MODULE_LIST → BE DEFAULT_DEPT_PERMISSIONS (4 dept) → FE MODULE_LIST → FE DEFAULT_PERMISSIONS (4 dept).

**Rule:** Trước khi push module permission mới, grep kiểm tra:
```bash
grep -n '"payslip"' backend/admin_routes.py   # phải thấy >=5 dòng (1 MODULE_LIST + 4 depts)
grep -n 'payslip' frontend/src/types/permissions.ts  # phải thấy >=5 dòng (1 MODULE_LIST + 4 depts)
```
Sau khi deploy, call `/api/v1/auth/me` và verify `permissions.payslip !== "none"`.

**Verify:** `grep -c "payslip" backend/admin_routes.py` — expect ≥5; `grep -c "payslip" frontend/src/types/permissions.ts` — expect ≥5.
