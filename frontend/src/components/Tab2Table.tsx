import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import PaymentModal from "./PaymentModal";
import { endpoints } from "../lib/api";
import { compressImageFile } from "../lib/imageCompress";
import type { Order } from "../types/order";
import { Button } from "./ui";
import Badge from "./ui/Badge";
import Modal from "./ui/Modal";
import { TableWrap, Table, Th, Td, Tr } from "./ui/Table";
import { cn } from "../lib/cn";

interface Props {
  orders: Order[];
  onDbLoaded: (db: { uid: string; diaChi: string }[], fileName: string) => void;
  dbFileName: string;
  canConfirmPayment: boolean;
  onOrderUpdated: (order: Order) => void;
}

export default function Tab2Table({
  orders,
  onDbLoaded,
  dbFileName,
  canConfirmPayment,
  onOrderUpdated,
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

      <TableWrap>
        <Table className="min-w-[1300px]">
          <thead>
            <tr>
              <Th>STT</Th>
              <Th>Mã đơn</Th>
              <Th>UID</Th>
              <Th>Tên khách</Th>
              <Th>Số điện thoại</Th>
              <Th>Gói học</Th>
              <Th>Tổng tiền</Th>
              <Th>Nguồn</Th>
              <Th>Nội dung CK (Info Code)</Th>
              <Th>TT Tiền về</Th>
              <Th>TT CRM</Th>
              <Th>Địa chỉ</Th>
              <Th>Biên lai</Th>
              <Th>Hành động</Th>
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

                return (
                  <Tr
                    key={o.id}
                    className={cn(isCancelled && "opacity-55 line-through bg-gmv-bg")}
                  >
                    <Td>{idx + 1}</Td>
                    <Td className="font-bold">
                      {o.maDonHang}
                      {isCancelled && (
                        <Badge tone="danger" className="ml-1 normal-case no-underline">
                          Đã huỷ
                        </Badge>
                      )}
                    </Td>
                    <Td className="text-left">{o.uid || "—"}</Td>
                    <Td className="text-left">{o.tenKhach}</Td>
                    <Td>{o.sdt || "—"}</Td>
                    <Td className="text-left">{o.goiHoc || "—"}</Td>
                    <Td className="text-right font-bold text-gmv-warn">{tongTienFmt}</Td>
                    <Td>
                      {o.nguon ? (
                        <Badge tone="ok" className="normal-case">
                          {o.nguon}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <span className="inline-block whitespace-nowrap rounded-gmv-sm border border-gmv-primary/30 bg-gmv-primary-soft px-1.5 py-0.5 text-xs font-bold text-gmv-primary">
                        {o.infoCode}
                      </span>
                    </Td>
                    <Td>
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
                    <Td>
                      <input
                        type="checkbox"
                        className="h-[18px] w-[18px] disabled:cursor-not-allowed disabled:opacity-50"
                        checked={o.donCRM}
                        disabled={isCancelled}
                        onChange={(e) => handleDonCRMChange(o, e.target.checked, operatorRole)}
                      />
                    </Td>
                    <Td className="max-w-[220px] text-left text-xs">{o.diaChi || "—"}</Td>
                    <Td>
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
                    <Td>
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
      </TableWrap>

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
