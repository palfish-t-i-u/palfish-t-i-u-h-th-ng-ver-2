import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../lib/api";
import { Button, Input, Select } from "./ui";
import Badge from "./ui/Badge";
import { Card, CardBody } from "./ui/Card";
import { TableWrap, Table, Th, Td, Tr } from "./ui/Table";

interface PayosTxn {
  id: string;
  maGiaoDichBank: string;
  soTien: number;
  noiDung: string;
  thoiGian: string;
  infoCode: string;
  trangThaiDoiSoat: string;
  maDonHang?: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "khop", label: "Đã khớp (mã + tiền)" },
  { value: "sai_tien", label: "Sai số tiền" },
  { value: "chua_xu_ly", label: "Chưa khớp đơn" },
];

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const isMatched = s === "khop";
  const isWrongAmount = s === "sai_tien";
  const tone = isMatched ? "ok" : isWrongAmount ? "warn" : "neutral";
  const label = isMatched ? "Đã khớp" : isWrongAmount ? "Sai tiền" : "Chưa khớp";
  return (
    <Badge tone={tone} className="normal-case">
      {label}
    </Badge>
  );
}

export default function PayosHistoryTab() {
  const [txns, setTxns] = useState<PayosTxn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const fetchTxns = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string | number> = { limit: 200 };
      if (from) params.from = from;
      if (to) params.to = to;
      if (status) params.status = status;
      if (q) params.q = q;
      const res = await endpoints.payos.transactions(params);
      setTxns(res.data.transactions || []);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setError(err?.response?.data?.detail || err?.message || "Lỗi tải giao dịch");
      setTxns([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, status, q]);

  useEffect(() => {
    fetchTxns();
  }, [fetchTxns]);

  const fmtTime = (s: string) => {
    if (!s) return "—";
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString("vi-VN");
  };

  return (
    <div>
      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="mb-1 block text-xs text-gmv-muted">Từ ngày</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gmv-muted">Đến ngày</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs text-gmv-muted">Tìm theo Info Code / Nội dung</label>
            <Input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="VD: ABC123..."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gmv-muted">Trạng thái</label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[160px]">
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" variant="primary" size="sm" onClick={fetchTxns} disabled={loading}>
            {loading ? "Đang tải..." : "Lọc"}
          </Button>
        </CardBody>
      </Card>

      {error && (
        <div className="mb-3 rounded-gmv-md border border-gmv-warn/40 bg-gmv-warn-soft px-3 py-2 text-sm text-gmv-warn">
          ⚠️ {error}
        </div>
      )}

      <TableWrap>
        <Table className="min-w-[1100px]">
          <thead>
            <tr>
              <Th>Thời gian</Th>
              <Th>Mã GD Bank</Th>
              <Th>Số tiền</Th>
              <Th>Nội dung CK</Th>
              <Th>Info Code</Th>
              <Th>Mã đơn match</Th>
              <Th>Trạng thái đối soát</Th>
            </tr>
          </thead>
          <tbody>
            {txns.length === 0 ? (
              <tr>
                <Td colSpan={7} className="py-5 text-gmv-muted">
                  {loading ? "Đang tải..." : "Không có giao dịch nào."}
                </Td>
              </tr>
            ) : (
              txns.map((t) => (
                <Tr key={t.id}>
                  <Td>{fmtTime(t.thoiGian)}</Td>
                  <Td className="font-mono text-xs">{t.maGiaoDichBank}</Td>
                  <Td className="text-right font-bold text-gmv-warn">
                    {t.soTien.toLocaleString("vi-VN")} đ
                  </Td>
                  <Td className="max-w-[280px] text-left text-xs">{t.noiDung}</Td>
                  <Td>
                    {t.infoCode ? (
                      <span className="inline-block rounded-gmv-sm border border-gmv-primary/30 bg-gmv-primary-soft px-1.5 py-0.5 text-xs font-bold text-gmv-primary">
                        {t.infoCode}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="font-semibold">{t.maDonHang || "—"}</Td>
                  <Td>
                    <StatusBadge status={t.trangThaiDoiSoat} />
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
