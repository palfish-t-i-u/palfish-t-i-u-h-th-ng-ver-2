import type { RequestBucket } from "./paymentRequestUtils";

const tabs: { key: RequestBucket; label: string; icon: string }[] = [
  { key: "tracking", label: "Đang theo dõi", icon: "▣" },
  { key: "created", label: "Gói học đã tạo", icon: "✣" },
  { key: "cancelled", label: "Đã huỷ", icon: "⊗" },
];

export default function PaymentRequestSubTabs({
  active,
  counts,
  resultCount,
  onChange,
}: {
  active: RequestBucket;
  counts: Record<RequestBucket, number>;
  resultCount: number;
  onChange: (value: RequestBucket) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-gmv-border bg-gmv-canvas px-4">
      <div className="flex items-center gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`inline-flex min-h-[52px] items-center gap-2 border-b-2 px-3 text-sm font-semibold transition ${
              active === tab.key
                ? "border-gmv-primary text-gmv-primary"
                : "border-transparent text-gmv-muted hover:text-gmv-text-strong"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            <span className="rounded-full bg-gmv-primary-soft px-2 py-0.5 text-xs text-gmv-primary">{counts[tab.key]}</span>
          </button>
        ))}
      </div>
      <div className="text-xs text-gmv-muted">{resultCount} kết quả</div>
    </div>
  );
}

