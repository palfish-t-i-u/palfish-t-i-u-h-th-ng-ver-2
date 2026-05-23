"""Invoice routes — Module 3 (Xác nhận CRM) + Module 4 (Xuất hóa đơn thuế).

Luồng:
  tien_ve=True → trang_thai_thu_tuc='CHO_XAC_NHAN'  (set bởi patch_order/trigger)
       ↓  [M3 – Ops xác nhận]
  trang_thai_thu_tuc='CHO_XUAT_HD'
       ↓  [M4 – Ops bấm Tải hóa đơn]
  trang_thai_thu_tuc='DA_XUAT_HD'  +  mã M.../PF... được chốt cứng
"""

from __future__ import annotations

import io
import zipfile
from datetime import date, datetime, timezone
from typing import Any

from fastapi import Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from rbac import can_confirm_payment, resolve_actor

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TRANG_THAI_CHO_XAC_NHAN = "CHO_XAC_NHAN"
TRANG_THAI_CHO_XUAT_HD = "CHO_XUAT_HD"
TRANG_THAI_DA_XUAT_HD = "DA_XUAT_HD"


# ---------------------------------------------------------------------------
# Pydantic request bodies
# ---------------------------------------------------------------------------
class M3ApproveBody(BaseModel):
    id: str
    taxProductName: str
    crmOrderId: str = ""


class M3SaveBody(BaseModel):
    id: str
    crmOrderId: str = ""


class M4CancelBody(BaseModel):
    id: str


# ---------------------------------------------------------------------------
# RBAC helper
# ---------------------------------------------------------------------------
def _require_ops(actor) -> None:
    if not can_confirm_payment(actor):
        raise HTTPException(403, "Chỉ Ops/System được thực hiện thao tác hóa đơn")


# ---------------------------------------------------------------------------
# Serializer
# ---------------------------------------------------------------------------
def _row_to_invoice_order(row: dict[str, Any], kh: dict[str, Any] | None = None) -> dict[str, Any]:
    k = kh or {}
    sdt_raw = k.get("so_dien_thoai") or row.get("sdt") or ""
    ma_vung = (k.get("ma_vung") or "+84").strip()
    sdt = f"{ma_vung} {sdt_raw}" if sdt_raw and not str(sdt_raw).startswith("+") else sdt_raw
    return {
        "id": row["id"],
        "maDonHang": row.get("ma_don_hang") or "",
        "tenKhach": k.get("ho_ten") or row.get("ten_khach") or "",
        "sdt": sdt,
        "uid": k.get("crm_uid") or "",
        "goiHoc": row.get("goi_hoc") or "",
        "tongTien": int(row.get("so_tien_can_thu") or 0),
        "nguon": row.get("nguon_doanh_thu") or "",
        "tienVe": bool(row.get("tien_ve")),
        "donCRM": bool(row.get("don_crm")),
        "trangThaiThuTuc": row.get("trang_thai_thu_tuc") or "",
        "taxProductName": row.get("tax_product_name") or "",
        "taxInvoiceCode": row.get("tax_invoice_code") or "",
        "taxProductCode": row.get("tax_product_code") or "",
        "m3ApprovedAt": row.get("m3_approved_at") or "",
        "crmOrderId": row.get("crm_order_id") or "",
        "createdBy": row.get("created_by") or "",
        "createdAt": row.get("created_at") or "",
    }


# ---------------------------------------------------------------------------
# Sequence allocation — batch-safe for single-operator flow
# ---------------------------------------------------------------------------
def _alloc_sequences(sb, n: int, date_key: str) -> tuple[int, int]:
    """Allocate n invoice sequence numbers (daily-reset) + n product codes (global).

    Returns (inv_start, prod_start).  Caller assigns:
      invoice code i  →  f"M{date_key}{inv_start+i+1:03d}"
      product code i  →  f"PF{prod_start+i+1:06d}"
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    seq_id_inv = f"invoice_{date_key}"

    # --- daily invoice sequence ---
    res_inv = (
        sb.table("tax_sequences")
        .select("current_val")
        .eq("id", seq_id_inv)
        .limit(1)
        .execute()
    )
    if res_inv.data:
        inv_start = int(res_inv.data[0]["current_val"])
        sb.table("tax_sequences").update(
            {"current_val": inv_start + n, "updated_at": now_iso}
        ).eq("id", seq_id_inv).execute()
    else:
        inv_start = 0
        sb.table("tax_sequences").insert(
            {"id": seq_id_inv, "current_val": n, "updated_at": now_iso}
        ).execute()

    # --- global product sequence ---
    res_prod = (
        sb.table("tax_sequences")
        .select("current_val")
        .eq("id", "product_code")
        .limit(1)
        .execute()
    )
    if res_prod.data:
        prod_start = int(res_prod.data[0]["current_val"])
        sb.table("tax_sequences").update(
            {"current_val": prod_start + n, "updated_at": now_iso}
        ).eq("id", "product_code").execute()
    else:
        prod_start = 0
        sb.table("tax_sequences").insert(
            {"id": "product_code", "current_val": n, "updated_at": now_iso}
        ).execute()

    return inv_start, prod_start


# ---------------------------------------------------------------------------
# Excel builders — 3 files in memory (openpyxl)
# ---------------------------------------------------------------------------
def _openpyxl_imports():
    try:
        import openpyxl
        from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
        from openpyxl.utils import get_column_letter

        return openpyxl, Font, PatternFill, Alignment, Border, Side, get_column_letter
    except ImportError as exc:
        raise HTTPException(500, f"Thiếu thư viện openpyxl — pip install openpyxl: {exc}") from exc


def _style_header(ws, headers: list[str], col_widths: list[int], fill_color: str, openpyxl_mods):
    _, Font, PatternFill, Alignment, Border, Side, get_column_letter = openpyxl_mods
    hfill = PatternFill("solid", fgColor=fill_color)
    hfont = Font(bold=True, color="FFFFFF", size=11)
    halign = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin = Side(style="thin", color="000000")
    bord = Border(left=thin, right=thin, top=thin, bottom=thin)
    for ci, (h, w) in enumerate(zip(headers, col_widths), 1):
        cell = ws.cell(row=1, column=ci, value=h)
        cell.fill = hfill
        cell.font = hfont
        cell.alignment = halign
        cell.border = bord
        ws.column_dimensions[get_column_letter(ci)].width = w
    ws.row_dimensions[1].height = 30
    return bord


def _build_excel_orders(orders: list[dict[str, Any]]) -> bytes:
    """File 1: Danh sách đơn hàng / hóa đơn."""
    mods = _openpyxl_imports()
    openpyxl, _, _, Alignment, _, _, _ = mods
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Đơn Hàng"

    headers = [
        "STT", "Mã Hóa Đơn", "Mã Đơn Hàng", "Họ Tên Khách Hàng",
        "Số Điện Thoại", "Gói Học", "Mã Sản Phẩm", "Tên Sản Phẩm (Thuế)",
        "Số Tiền (VND)", "Hình Thức Thanh Toán", "Nguồn",
        "Mã CRM Order", "Ngày Xác Nhận M3",
    ]
    col_widths = [5, 16, 14, 26, 18, 32, 12, 36, 18, 22, 14, 18, 22]
    bord = _style_header(ws, headers, col_widths, "4472C4", mods)

    for ri, o in enumerate(orders, 2):
        m3_date = ""
        if o.get("m3ApprovedAt"):
            try:
                dt = datetime.fromisoformat(str(o["m3ApprovedAt"]).replace("Z", "+00:00"))
                m3_date = dt.strftime("%d/%m/%Y %H:%M")
            except Exception:
                m3_date = str(o["m3ApprovedAt"])

        row_vals = [
            ri - 1,
            o.get("taxInvoiceCode", ""),
            o.get("maDonHang", ""),
            o.get("tenKhach", ""),
            o.get("sdt", ""),
            o.get("goiHoc", ""),
            o.get("taxProductCode", ""),
            o.get("taxProductName", ""),
            int(o.get("tongTien", 0)),
            "Chuyển khoản",
            o.get("nguon", ""),
            o.get("crmOrderId", ""),
            m3_date,
        ]
        for ci, val in enumerate(row_vals, 1):
            cell = ws.cell(row=ri, column=ci, value=val)
            cell.border = bord
            cell.alignment = Alignment(horizontal="center" if ci == 1 else "left", vertical="center")
            if ci == 9:
                cell.number_format = "#,##0"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _build_excel_customers(orders: list[dict[str, Any]]) -> bytes:
    """File 2: Danh sách khách hàng — deduplicate by SĐT, format 84-XXXXXXXXX."""
    mods = _openpyxl_imports()
    openpyxl, _, _, Alignment, _, _, _ = mods

    seen: set[str] = set()
    unique_rows: list[dict[str, Any]] = []
    for o in orders:
        digits = "".join(c for c in (o.get("sdt") or "") if c.isdigit())
        if digits.startswith("84") and len(digits) == 11:
            fmt = f"84-{digits[2:]}"
        elif digits.startswith("0") and len(digits) == 10:
            fmt = f"84-{digits[1:]}"
        elif len(digits) == 9:
            fmt = f"84-{digits}"
        else:
            fmt = o.get("sdt", "")
        if fmt not in seen:
            seen.add(fmt)
            unique_rows.append({**o, "_sdtFmt": fmt})

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Khách Hàng"
    headers = ["STT", "Họ Tên Khách Hàng", "SĐT Chuẩn Thuế (84-...)", "SĐT Gốc", "Gói Học"]
    col_widths = [5, 30, 26, 20, 35]
    bord = _style_header(ws, headers, col_widths, "70AD47", mods)

    for ri, c in enumerate(unique_rows, 2):
        row_vals = [ri - 1, c.get("tenKhach", ""), c["_sdtFmt"], c.get("sdt", ""), c.get("goiHoc", "")]
        for ci, val in enumerate(row_vals, 1):
            cell = ws.cell(row=ri, column=ci, value=val)
            cell.border = bord
            cell.alignment = Alignment(horizontal="center" if ci == 1 else "left", vertical="center")

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _build_excel_products(orders: list[dict[str, Any]]) -> bytes:
    """File 3: Danh sách sản phẩm (1 dòng / đơn — mã PF chốt cứng)."""
    mods = _openpyxl_imports()
    openpyxl, _, _, Alignment, _, _, _ = mods

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sản Phẩm"
    headers = ["STT", "Mã Sản Phẩm", "Tên Sản Phẩm (Thuế)", "Tên Gói Học (Nội bộ)", "Đơn Giá (VND)", "Mã Hóa Đơn"]
    col_widths = [5, 14, 40, 36, 18, 16]
    bord = _style_header(ws, headers, col_widths, "ED7D31", mods)

    for ri, o in enumerate(orders, 2):
        row_vals = [
            ri - 1,
            o.get("taxProductCode", ""),
            o.get("taxProductName", "") or o.get("goiHoc", ""),
            o.get("goiHoc", ""),
            int(o.get("tongTien", 0)),
            o.get("taxInvoiceCode", ""),
        ]
        for ci, val in enumerate(row_vals, 1):
            cell = ws.cell(row=ri, column=ci, value=val)
            cell.border = bord
            cell.alignment = Alignment(horizontal="center" if ci == 1 else "left", vertical="center")
            if ci == 5:
                cell.number_format = "#,##0"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Route registration — same closure pattern as admin_routes.py
# ---------------------------------------------------------------------------
def register_invoice_routes(app, get_supabase) -> None:
    """Attach /invoice/* routes to the FastAPI app."""

    def _sb():
        sb = get_supabase()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")
        return sb

    # ------------------------------------------------------------------
    # GET /invoice/m3-pending
    # ------------------------------------------------------------------
    @app.get("/invoice/m3-pending")
    def m3_pending(authorization: str | None = Header(None)):
        """Tất cả đơn đã có tiền về — bao gồm cả đã xác nhận / đã xuất để hiển thị lịch sử."""
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        try:
            res = (
                sb.table("don_hang")
                .select("*, khach_hang(*)")
                .eq("tien_ve", True)
                .order("created_at", desc=True)
                .execute()
            )
            out = []
            for row in res.data or []:
                kh = row.pop("khach_hang", None) if isinstance(row, dict) else None
                out.append(_row_to_invoice_order(row, kh))
            return {"orders": out, "count": len(out)}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi lấy danh sách M3: {exc}") from exc

    # ------------------------------------------------------------------
    # POST /invoice/m3-save  — lưu crmOrderId không đổi trạng thái
    # ------------------------------------------------------------------
    @app.post("/invoice/m3-save")
    def m3_save(body: M3SaveBody, authorization: str | None = Header(None)):
        """Lưu crmOrderId cho đơn mà không thay đổi trang_thai_thu_tuc."""
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        try:
            res = (
                sb.table("don_hang")
                .update({
                    "crm_order_id": body.crmOrderId.strip() or None,
                    "don_crm": True,
                })
                .eq("id", body.id)
                .execute()
            )
            if not res.data:
                raise HTTPException(404, "Không tìm thấy đơn hàng")
            row = res.data[0]
            kh_res = (
                sb.table("khach_hang")
                .select("*")
                .eq("id", row.get("khach_hang_id"))
                .limit(1)
                .execute()
            )
            return _row_to_invoice_order(row, kh_res.data[0] if kh_res.data else None)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi lưu CRM ID: {exc}") from exc

    # ------------------------------------------------------------------
    # POST /invoice/m3-approve
    # ------------------------------------------------------------------
    @app.post("/invoice/m3-approve")
    def m3_approve(body: M3ApproveBody, authorization: str | None = Header(None)):
        """Ops xác nhận: điền taxProductName + crmOrderId, chuyển sang CHO_XUAT_HD."""
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)

        if not body.taxProductName.strip():
            raise HTTPException(400, "taxProductName không được để trống")

        try:
            patch: dict[str, Any] = {
                "tax_product_name": body.taxProductName.strip(),
                "crm_order_id": body.crmOrderId.strip() or None,
                "m3_approved_at": datetime.now(timezone.utc).isoformat(),
                "trang_thai_thu_tuc": TRANG_THAI_CHO_XUAT_HD,
            }
            res = (
                sb.table("don_hang")
                .update(patch)
                .eq("id", body.id)
                .eq("trang_thai_thu_tuc", TRANG_THAI_CHO_XAC_NHAN)
                .execute()
            )
            if not res.data:
                raise HTTPException(
                    404, "Đơn không tìm thấy hoặc không còn ở trạng thái CHO_XAC_NHAN"
                )
            row = res.data[0]
            kh_res = (
                sb.table("khach_hang")
                .select("*")
                .eq("id", row.get("khach_hang_id"))
                .limit(1)
                .execute()
            )
            return _row_to_invoice_order(row, kh_res.data[0] if kh_res.data else None)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi M3 approve: {exc}") from exc

    # ------------------------------------------------------------------
    # POST /invoice/m3-approve-bulk
    # ------------------------------------------------------------------
    @app.post("/invoice/m3-approve-bulk")
    def m3_approve_bulk(authorization: str | None = Header(None)):
        """Bulk-approve tất cả đơn CHO_XAC_NHAN → CHO_XUAT_HD.

        Dùng goi_hoc làm tax_product_name (fallback: ma_don_hang).
        Trả về số đơn được duyệt.
        """
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)

        try:
            res = (
                sb.table("don_hang")
                .select("id, goi_hoc, ma_don_hang, crm_order_id")
                .eq("trang_thai_thu_tuc", TRANG_THAI_CHO_XAC_NHAN)
                .eq("tien_ve", True)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(500, f"Lỗi đọc danh sách CHO_XAC_NHAN: {exc}") from exc

        rows = res.data or []
        if not rows:
            return {"approved": 0, "ids": []}

        now_iso = datetime.now(timezone.utc).isoformat()
        approved_ids: list[str] = []
        for row in rows:
            tax_name = (row.get("goi_hoc") or row.get("ma_don_hang") or "").strip()
            if not tax_name:
                continue
            try:
                upd = (
                    sb.table("don_hang")
                    .update({
                        "tax_product_name": tax_name,
                        "m3_approved_at": now_iso,
                        "trang_thai_thu_tuc": TRANG_THAI_CHO_XUAT_HD,
                    })
                    .eq("id", row["id"])
                    .eq("trang_thai_thu_tuc", TRANG_THAI_CHO_XAC_NHAN)
                    .execute()
                )
                if upd.data:
                    approved_ids.append(row["id"])
            except Exception:
                pass  # skip đơn lỗi, tiếp tục các đơn còn lại

        return {"approved": len(approved_ids), "ids": approved_ids}

    # ------------------------------------------------------------------
    # GET /invoice/m4-queue
    # ------------------------------------------------------------------
    @app.get("/invoice/m4-queue")
    def m4_queue(authorization: str | None = Header(None)):
        """Queue các đơn đã qua M3, đang chờ xuất hóa đơn thuế."""
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        try:
            res = (
                sb.table("don_hang")
                .select("*, khach_hang(*)")
                .eq("trang_thai_thu_tuc", TRANG_THAI_CHO_XUAT_HD)
                .order("m3_approved_at", desc=False)
                .execute()
            )
            out = []
            for row in res.data or []:
                kh = row.pop("khach_hang", None) if isinstance(row, dict) else None
                out.append(_row_to_invoice_order(row, kh))
            return {"orders": out, "count": len(out)}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi lấy queue M4: {exc}") from exc

    # ------------------------------------------------------------------
    # POST /invoice/m4-cancel
    # ------------------------------------------------------------------
    @app.post("/invoice/m4-cancel")
    def m4_cancel(body: M4CancelBody, authorization: str | None = Header(None)):
        """Revert đơn từ CHO_XUAT_HD về CHO_XAC_NHAN (hủy queue)."""
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        try:
            res = (
                sb.table("don_hang")
                .update(
                    {
                        "trang_thai_thu_tuc": TRANG_THAI_CHO_XAC_NHAN,
                        "m3_approved_at": None,
                        "tax_product_name": None,
                        "crm_order_id": None,
                    }
                )
                .eq("id", body.id)
                .eq("trang_thai_thu_tuc", TRANG_THAI_CHO_XUAT_HD)
                .execute()
            )
            if not res.data:
                raise HTTPException(
                    404, "Đơn không tìm thấy hoặc không ở trạng thái CHO_XUAT_HD"
                )
            return {"ok": True, "id": body.id}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi hủy queue M4: {exc}") from exc

    # ------------------------------------------------------------------
    # POST /invoice/export-batch  ← quan trọng nhất
    # ------------------------------------------------------------------
    @app.post("/invoice/export-batch")
    def export_batch(authorization: str | None = Header(None)):
        """Xuất hóa đơn thuế: cấp mã M.../PF..., cập nhật DB, trả ZIP 3 file Excel.

        Luồng:
          1. Lock-read tất cả đơn CHO_XUAT_HD
          2. Batch-allocate sequences từ tax_sequences
          3. Gán mã + update từng đơn → DA_XUAT_HD
          4. Insert bản ghi export_batches
          5. Tạo 3 file Excel trong memory
          6. Nén ZIP → StreamingResponse
        """
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)

        # 1. Lấy toàn bộ đơn CHO_XUAT_HD
        try:
            res = (
                sb.table("don_hang")
                .select("*, khach_hang(*)")
                .eq("trang_thai_thu_tuc", TRANG_THAI_CHO_XUAT_HD)
                .order("m3_approved_at", desc=False)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(500, f"Lỗi đọc queue xuất hóa đơn: {exc}") from exc

        raw_orders = res.data or []
        if not raw_orders:
            raise HTTPException(400, "Hàng đợi trống — không có đơn nào để xuất hóa đơn")

        n = len(raw_orders)
        today = date.today()
        date_key = today.strftime("%d%m%y")  # DDMMYY — reset daily

        # 2. Cấp sequences (batch)
        try:
            inv_start, prod_start = _alloc_sequences(sb, n, date_key)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi cấp sequence hóa đơn: {exc}") from exc

        # 3. Gán mã + cập nhật DB
        enriched: list[dict[str, Any]] = []
        order_ids: list[str] = []

        for i, row in enumerate(raw_orders):
            kh = row.pop("khach_hang", None) if isinstance(row, dict) else None
            tax_invoice_code = f"M{date_key}{inv_start + i + 1:03d}"
            tax_product_code = f"PF{prod_start + i + 1:06d}"

            try:
                upd = (
                    sb.table("don_hang")
                    .update(
                        {
                            "tax_invoice_code": tax_invoice_code,
                            "tax_product_code": tax_product_code,
                            "trang_thai_thu_tuc": TRANG_THAI_DA_XUAT_HD,
                        }
                    )
                    .eq("id", row["id"])
                    .execute()
                )
                if not upd.data:
                    raise HTTPException(
                        500, f"Không cập nhật được đơn {row.get('ma_don_hang')} — id={row['id']}"
                    )
                updated_row = upd.data[0]
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(
                    500, f"Lỗi cập nhật đơn {row.get('ma_don_hang')}: {exc}"
                ) from exc

            order_data = _row_to_invoice_order(updated_row, kh)
            # Overwrite with freshly allocated codes (row may not return them in all Supabase versions)
            order_data["taxInvoiceCode"] = tax_invoice_code
            order_data["taxProductCode"] = tax_product_code
            enriched.append(order_data)
            order_ids.append(row["id"])

        # 4. Ghi lịch sử batch (non-fatal nếu bảng chưa tồn tại)
        try:
            sb.table("export_batches").insert(
                {
                    "batch_date": today.isoformat(),
                    "order_ids": order_ids,
                    "order_count": n,
                    "created_by": actor.email,
                }
            ).execute()
        except Exception as exc:
            print(f"[invoice] Ghi export_batches thất bại (non-fatal): {exc}")

        # 5. Tạo 3 file Excel trong bộ nhớ
        try:
            excel_orders = _build_excel_orders(enriched)
            excel_customers = _build_excel_customers(enriched)
            excel_products = _build_excel_products(enriched)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi tạo file Excel: {exc}") from exc

        # 6. Nén ZIP + trả StreamingResponse
        batch_label = today.strftime("%Y%m%d")
        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(f"01_don_hang_{batch_label}.xlsx", excel_orders)
            zf.writestr(f"02_khach_hang_{batch_label}.xlsx", excel_customers)
            zf.writestr(f"03_san_pham_{batch_label}.xlsx", excel_products)
        zip_buf.seek(0)

        filename = f"hoa_don_thue_{batch_label}_{n}don.zip"
        return StreamingResponse(
            zip_buf,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition, X-Batch-Count, X-Batch-Date",
                "X-Batch-Count": str(n),
                "X-Batch-Date": batch_label,
            },
        )
