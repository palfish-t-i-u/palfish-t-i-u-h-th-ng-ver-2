import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import PaymentModal from "./PaymentModal";
import { endpoints } from "../lib/api";
import { compressImageFile } from "../lib/imageCompress";
import type { Order } from "../types/order";
import { Button } from "./ui";
import Badge from "./ui/Badge";
import Modal from "./ui/Modal";
import {
  TableScrollWrap,
  Table,
  Th,
  Td,
  Tr,
  stickyTableCell,
  stickyTableCellRight,
  stickyTableHead,
  stickyTableHeadCorner,
  stickyTableHeadRight,
  stickyTableHeadTop,
} from "./ui/Table";
import { cn } from "../lib/cn";

interface Props {
  orders: Order[];
  onDbLoaded: (db: { uid: string; diaChi: string }[], fileName: string) => void;
  dbFileName: string;
  canConfirmPayment: boolean;
  onOrderUpdated: (order: Order) => void;
  onOpenCreateOrder?: () => void;
}

export default function Tab2Table({
  orders,
  onDbLoaded,
  dbFileName,
  canConfirmPayment,
  onOrderUpdated,
  onOpenCreateOrder,
}: Props) {
  const [qrModal, setQrModal] = useState<{
    open: boolean;
    maDonHang: string;
    tongTien: number;
    infoCode: string;
  }>({ open: false, maDonHang: "", tongTien: 0, infoCode: "" });
  const [billModal, setBillModal] = useState<{ open: boolean; maDon: string; src: string }>({
    open: false,
    maDon: "",
    src: "",
  });
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const billInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function loadExcel(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
      if (rows.length === 0) {
        alert("File Excel trống!");
        return;
      }
      const db = rows
        .map((row) => {
          let uid = "",
            diaChi = "";
          for (const key in row) {
            const k = key.toLowerCase();
            if (k.includes("uid") || k.includes("id") || k.includes("tên") || k.includes("học sinh"))
              uid = String(row[key]);
            else if (k.includes("địa chỉ") || k.includes("diachi") || k.includes("address"))
              diaChi = String(row[key]);
          }
          return { uid: uid.trim(), diaChi: diaChi.trim() };
        })
        .filter((r) => r.uid !== "");
      onDbLoaded(db, file.name);
      alert(`Đã nạp thành công ${db.length} UID để đối chiếu Địa chỉ!`);
    };
    reader.readAsArrayBuffer(file);
  }

  async function patchOrder(
    order: Order,
    patch: { tienVe?: boolean; donCRM?: boolean; billImage?: string | null },
    operatorRole: string,
    timeout?: number
  ) {
    const res = await endpoints.orders.patch(order.id, patch, operatorRole, timeout);
    onOrderUpdated(res.data);
  }

  async function handleTienVeChange(order: Order, checked: boolean, operatorRole: string) {
    if (!canConfirmPayment) return;
    try {
      await patchOrder(order, { tienVe: checked }, operatorRole);
    } catch {
      alert("Không cập nhật được trạng thái tiền về.");
    }
  }

  async function handleDonCRMChange(order: Order, checked: boolean, operatorRole: string) {
    try {
      await patchOrder(order, { donCRM: checked }, operatorRole);
    } catch {
      alert("Không cập nhật được trạng thái CRM.");
    }
  }

  async function handleCancel(order: Order) {
    if (order.tienVe) {
      alert("Đơn đã ghi nhận tiền về — không thể huỷ tự động. Liên hệ ops xử lý hoàn tiền.");
      return;
    }
    if (!window.confirm(`Huỷ đơn ${order.maDonHang}? Không khôi phục được.`)) return;
    try {
      const res = await endpoints.orders.cancel(order.id);
      onOrderUpdated(res.data);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      alert(`Không huỷ được: ${err?.response?.data?.detail || err?.message || "lỗi"}`);
    }
  }

  async function handleBillFile(order: Order, file: File, operatorRole: string) {
    if (!file.type.startsWith("image/")) {
      alert("Vui lòng chọn định dạng ảnh!");
      return;
    }
    setUploading(order.id);
    try {
      const compressed = await compressImageFile(file);
      const blob = await (await fetch(compressed)).blob();
      try {
        const up = await endpoints.orders.uploadBill(order.id, blob, `${order.id}.jpg`);
        onOrderUpdated(up.data.order);
      } catch {
        await patchOrder(order, { billImage: compressed }, operatorRole, 60000);
      }
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const msg = err?.response?.data?.detail || err?.message || "Lỗi không xác định";
      alert(`Không lưu được ảnh biên lai: ${msg}`);
    } finally {
      setUploading(null);
    }
  }

  return (
    <div>
      {onOpenCreateOrder && (
        <div className="mb-4 flex justify-end">
          <Button type="button" onClick={onOpenCreateOrder}>
            + Tạo mã QR mới
          </Button>
        </div>
      )}
      <div className="mb-5 flex flex-col items-stretch justify-between gap-4 rounded-gmv-md border border-dashed border-gmv-primary/50 bg-gmv-canvas p-4 shadow-gmv-1 sm:flex-row sm:items-center">
        <div
          className={cn(
            "flex-1 cursor-pointer rounded-gmv-md border border-dashed px-3 py-2.5 text-center text-sm text-gmv-muted transition",
            isDragOver ? "border-gmv-primary bg-gmv-primary-soft" : "border-gmv-border bg-gmv-bg"
          )}
          onClick={() => excelInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files.length) loadExcel(e.dataTransfer.files[0]);
          }}
        >
          {dbFileName || "Kéo thả file Excel chứa cột UID và Địa chỉ vào đây để đối chiếu"}
        </div>
        <Button type="button" variant="ok" onClick={() => excelInputRef.current?.click()}>
          Nạp file gốc
        </Button>
        <input
          ref={excelInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              loadExcel(e.target.files[0]);
              e.target.value = "";
            }
          }}
        />
      </div>

      <TableScrollWrap>
        <Table className="min-w-[1600px]">
          <thead>
            <tr>
              <Th className={cn(stickyTableHead, stickyTableHeadTop, stickyTableHeadCorner, "left-0 w-12 min-w-[3rem]")}>
                STT
              </Th>
              <Th
                className={cn(stickyTableHead, stickyTableHeadTop, stickyTableHeadCorner, "left-12 w-24 min-w-[6rem]")}
              >
                Mã đơn
              </Th>
              <Th
                className={cn(
                  stickyTableHead,
                  stickyTableHeadTop,
                  stickyTableHeadCorner,
                  "left-36 w-28 min-w-[7rem] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.1)]"
                )}
              >
                UID
              </Th>
              <Th className={cn("sticky z-30", stickyTableHeadTop, "min-w-[7rem]")}>Tên khách</Th>
              <Th className={cn("sticky z-30", stickyTableHeadTop, "min-w-[8.5rem]")}>Số điện thoại</Th>
              <Th className={cn("sticky z-30", stickyTableHeadTop, "min-w-[12rem]")}>Gói học</Th>
              <Th className={cn("sticky z-30", stickyTableHeadTop, "min-w-[6.5rem]")}>Tổng tiền</Th>
              <Th className={cn("sticky z-30", stickyTableHeadTop, "min-w-[5.5rem]")}>Nguồn</Th>
              <Th className={cn("sticky z-30", stickyTableHeadTop, "min-w-[11rem]")}>Nội dung CK (Info Code)</Th>
              <Th className={cn("sticky z-30", stickyTableHeadTop, "min-w-[5rem]")}>TT Tiền về</Th>
              <Th className={cn("sticky z-30", stickyTableHeadTop, "min-w-[4.5rem]")}>TT CRM</Th>
              <Th className={cn("sticky z-30", stickyTableHeadTop, "min-w-[10rem]")}>Địa chỉ</Th>
              <Th
                className={cn(
                  stickyTableHeadRight,
                  stickyTableHeadTop,
                  stickyTableHeadCorner,
                  "right-[8.25rem] w-[7.5rem] min-w-[7.5rem]"
                )}
              >
                Biên lai
              </Th>
              <Th
                className={cn(
                  stickyTableHeadRight,
                  stickyTableHeadTop,
                  stickyTableHeadCorner,
                  "right-0 w-[8.25rem] min-w-[8.25rem] shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.1)]"
                )}
              >
                Hành động
              </Th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <Td colSpan={14} className="py-5 text-gmv-muted">
                  Chưa có đơn hàng nào. Tạo đơn ở Tab 1.
                </Td>
              </tr>
            ) : (
              orders.map((o, idx) => {
                const operatorRole = canConfirmPayment ? "ops" : "sale";
                const tongTienFmt = o.tongTien > 0 ? `${o.tongTien.toLocaleString("vi-VN")} đ` : "";
                const isCancelled = o.trangThai === "huy";

                const rowBg = isCancelled ? "bg-gmv-bg" : "bg-gmv-canvas";
                const stickyCell = cn(stickyTableCell, rowBg, "group-hover:bg-gmv-row-hover");
                const stickyCellRight = cn(stickyTableCellRight, rowBg, "group-hover:bg-gmv-row-hover");

                return (
                  <Tr
                    key={o.id}
                    className={cn(isCancelled && "opacity-55 line-through bg-gmv-bg")}
                  >
                    <Td className={cn(stickyCell, "left-0 w-12 min-w-[3rem]")}>{idx + 1}</Td>
                    <Td className={cn(stickyCell, "left-12 w-24 min-w-[6rem] font-bold")}>
                      {o.maDonHang}
                      {isCancelled && (
                        <Badge tone="danger" className="ml-1 normal-case no-underline">
                          Đã huỷ
                        </Badge>
                      )}
                    </Td>
                    <Td
                      className={cn(
                        stickyCell,
                        "left-36 w-28 min-w-[7rem] text-left shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]"
                      )}
                    >
                      {o.uid || "—"}
                    </Td>
                    <Td className="min-w-[7rem] text-left group-hover:bg-gmv-row-hover">{o.tenKhach}</Td>
                    <Td className="min-w-[8.5rem] whitespace-nowrap group-hover:bg-gmv-row-hover">
                      {o.sdt || "—"}
                    </Td>
                    <Td className="min-w-[12rem] text-left group-hover:bg-gmv-row-hover">{o.goiHoc || "—"}</Td>
                    <Td className="min-w-[6.5rem] text-right font-bold text-gmv-warn group-hover:bg-gmv-row-hover">
                      {tongTienFmt}
                    </Td>
                    <Td className="min-w-[5.5rem] group-hover:bg-gmv-row-hover">
                      {o.nguon ? (
                        <Badge tone="ok" className="normal-case">
                          {o.nguon}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="min-w-[11rem] group-hover:bg-gmv-row-hover">
                      <span className="inline-block whitespace-nowrap rounded-gmv-sm border border-gmv-primary/30 bg-gmv-primary-soft px-1.5 py-0.5 text-xs font-bold text-gmv-primary">
                        {o.infoCode}
                      </span>
                    </Td>
                    <Td className="min-w-[5rem] group-hover:bg-gmv-row-hover">
                      <input
                        type="checkbox"
                        className="h-[18px] w-[18px] disabled:cursor-not-allowed disabled:opacity-50"
                        checked={o.tienVe}
                        disabled={!canConfirmPayment || isCancelled}
                        title={
                          canConfirmPayment
                            ? "Thu Hiền / hệ thống xác nhận thủ công"
                            : "Chỉ bộ phận hệ thống được tích"
                        }
                        onChange={(e) => handleTienVeChange(o, e.target.checked, operatorRole)}
                      />
                    </Td>
                    <Td className="min-w-[4.5rem] group-hover:bg-gmv-row-hover">
                      <input
                        type="checkbox"
                        className="h-[18px] w-[18px] disabled:cursor-not-allowed disabled:opacity-50"
                        checked={o.donCRM}
                        disabled={isCancelled}
                        onChange={(e) => handleDonCRMChange(o, e.target.checked, operatorRole)}
                      />
                    </Td>
                    <Td className="min-w-[10rem] text-left text-xs group-hover:bg-gmv-row-hover">
                      {o.diaChi || "—"}
                    </Td>
                    <Td
                      className={cn(stickyCellRight, "right-[8.25rem] w-[7.5rem] min-w-[7.5rem]")}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={(el) => {
                          billInputRefs.current[o.id] = el;
                        }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleBillFile(o, f, operatorRole);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant={o.billImage ? "ok" : "secondary"}
                        disabled={uploading === o.id || (isCancelled && !o.billImage)}
                        onClick={() => {
                          if (o.billImage) {
                            setBillModal({ open: true, maDon: o.maDonHang, src: o.billImage });
                          } else if (!isCancelled) {
                            billInputRefs.current[o.id]?.click();
                          }
                        }}
                        title={isCancelled && !o.billImage ? "Đơn đã huỷ" : undefined}
                      >
                        {uploading === o.id ? "Đang tải..." : o.billImage ? "Xem ảnh" : "Up ảnh bill"}
                      </Button>
                    </Td>
                    <Td
                      className={cn(
                        stickyCellRight,
                        "right-0 w-[8.25rem] min-w-[8.25rem] shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]"
                      )}
                    >
                      <div className="flex flex-wrap justify-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isCancelled}
                          onClick={() =>
                            setQrModal({
                              open: true,
                              maDonHang: o.maDonHang,
                              tongTien: o.tongTien,
                              infoCode: o.infoCode,
                            })
                          }
                        >
                          QR Code
                        </Button>
                        {!isCancelled && !o.tienVe && (
                          <Button type="button" size="sm" variant="danger" onClick={() => handleCancel(o)}>
                            Hủy
                          </Button>
                        )}
                        {o.tienVe && !isCancelled && (
                          <span className="self-center text-[11px] text-gmv-muted" title="Đã có tiền về">
                            —
                          </span>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
      </TableScrollWrap>

      <div className="mt-5 text-xs leading-relaxed text-gmv-muted">
        <strong className="text-gmv-text-strong">* Ghi chú:</strong>
        <br />
        - Dữ liệu tách từng cột để lọc và xuất báo cáo.
        <br />
        - Cột &quot;TT Tiền về&quot; tự động khi bank khớp Info Code; tick thủ công chỉ dành Thu Hiền / hệ thống.
        <br />
        - Upload biên lai tại cột &quot;Biên lai&quot;.
      </div>

      <PaymentModal
        open={qrModal.open}
        maDonHang={qrModal.maDonHang}
        tongTien={qrModal.tongTien}
        infoCode={qrModal.infoCode}
        onClose={() => setQrModal((m) => ({ ...m, open: false }))}
      />

      <Modal
        open={billModal.open}
        onClose={() => setBillModal((m) => ({ ...m, open: false }))}
        title={`Biên lai: ${billModal.maDon}`}
        wide
        className="text-center"
      >
        <img
          src={billModal.src}
          alt="Biên lai"
          className="mx-auto mt-2 max-h-[70vh] max-w-full rounded-gmv-md"
        />
      </Modal>
    </div>
  );
}
