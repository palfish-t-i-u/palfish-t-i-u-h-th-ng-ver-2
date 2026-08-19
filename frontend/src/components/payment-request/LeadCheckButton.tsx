import Tooltip from "../ui/Tooltip";
import { Icons } from "./Icons";

interface Props {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  tooltip?: string;
}

export default function LeadCheckButton({
  onClick,
  disabled,
  loading,
  tooltip = "Tra cứu lead trên hệ thống",
}: Props) {
  const off = disabled || loading;
  return (
    <Tooltip content={tooltip}>
      <button
        type="button"
        onClick={onClick}
        disabled={off}
        aria-label={tooltip}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 34,
          height: 34,
          flex: "0 0 auto",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: off ? "var(--gmv-bg, #f3f4f6)" : "var(--surface, #fff)",
          cursor: off ? "not-allowed" : "pointer",
          opacity: off ? 0.6 : 1,
        }}
      >
        <Icons.Search size={16} />
      </button>
    </Tooltip>
  );
}
