import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { RowCard, RowCardList } from "../ui/RowCard";
import { Icons } from "../payment-request/Icons";
import { formatPaymentDateTime } from "../payment-request/paymentRequestUtils";
import { formatPhoneIntl } from "../payment-request/phoneUtils";
import { findCountry } from "../payment-request/CountryCombo";
import { formatAddress, invoiceDateFor, type InvoiceRow, vnd } from "../payment-flow/paymentFlowUtils";

interface DefaultsResult {
  customerType: string;
  name: string;
  phone: string;
  country: string;
  email: string;
  address: string;
  ward: string;
  province: string;
  taxCode: string;
  companyName: string;
  note: string;
}

interface Props {
  rows: InvoiceRow[];
  tab: "pending" | "issued";
  openKey: string | null;
  selectedKeys: Set<string>;
  onSelect: (key: string) => void;
  onToggleSelect: (key: string) => void;
  onIssue: (row: InvoiceRow) => void;
  isRowComplete: (row: InvoiceRow) => boolean;
  defaultsFor: (row: InvoiceRow) => DefaultsResult | null;
  readOnly: boolean;
  remindedPrMap: Map<string, unknown>;
  emptyText: string;
}

export default function InvoiceRowCards({
  rows,
  tab,
  openKey,
  selectedKeys,
  onSelect,
  onToggleSelect,
  onIssue,
  isRowComplete,
  defaultsFor,
  readOnly,
  remindedPrMap,
  emptyText,
}: Props) {
  return (
    <RowCardList empty={emptyText}>
      {rows.map((r) => {
        const d = defaultsFor(r);
        if (!d) return null;
        const country = findCountry(d.country);
        const complete = isRowComplete(r);
        const ts = formatPaymentDateTime(invoiceDateFor(r));
        const reminded = remindedPrMap.has(r.ar.prId || "") && !r.course.invoiced;
        return (
          <RowCard
            key={r.key}
            className={openKey === r.key ? "ring-2 ring-gmv-primary" : undefined}
            title={
              <span>
                {d.name}
                {reminded && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
                    <Icons.Bell size={10} /> Nhắc
                  </span>
                )}
              </span>
            }
            value={vnd(r.course.amount)}
            badges={
              <>
                {r.course.invoiced ? (
                  <span className="invoice-chip" style={{ fontSize: 11 }}>
                    <Icons.Doc size={10} /> {r.course.invoiceId}
                  </span>
                ) : (
                  <span className="code-chip cc" style={{ fontSize: 11 }}>
                    <Icons.Sparkle size={10} /> {r.course.courseCode}
                  </span>
                )}
                <Badge tone={d.customerType === "business" ? "primary" : "neutral"}>
                  {d.customerType === "business" ? "DN" : "CN"}
                </Badge>
              </>
            }
            meta={[
              { label: "SĐT", value: `${country.flag} ${formatPhoneIntl(d.country, d.phone)}` },
              { label: "UID", value: r.uidObj.uid || "—" },
              { label: "Địa chỉ", value: formatAddress(r.pr, r) || "—" },
              { label: "Thời gian", value: `${ts.date} ${ts.time || ""}`.trim() },
            ]}
            onClick={() => onSelect(r.key)}
            actions={
              <div className="flex w-full items-center justify-between">
                {(tab === "pending" || tab === "issued") && (
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(r.key)}
                      disabled={tab === "pending" && !complete}
                      onChange={() => onToggleSelect(r.key)}
                    />
                    Chọn
                  </label>
                )}
                {tab === "pending" && complete && !readOnly && (
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => onIssue(r)}
                  >
                    <Icons.Doc size={12} /> Xuất HĐ
                  </Button>
                )}
              </div>
            }
          />
        );
      })}
    </RowCardList>
  );
}
