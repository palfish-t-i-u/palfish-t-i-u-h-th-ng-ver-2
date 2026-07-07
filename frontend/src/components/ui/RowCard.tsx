import { Children, isValidElement, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface RowCardMeta {
  label: string;
  value: ReactNode;
}

interface RowCardProps {
  /** Dòng đầu bên trái — tên khách / mã PR */
  title: ReactNode;
  /** Dòng đầu bên phải — giá trị chính (số tiền) */
  value?: ReactNode;
  /** Hàng badge trạng thái */
  badges?: ReactNode;
  /** Các cặp label–value phụ */
  meta?: RowCardMeta[];
  /** Hàng nút thao tác — tự chặn event lan lên onClick của thẻ */
  actions?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function RowCard({
  title,
  value,
  badges,
  meta,
  actions,
  onClick,
  className,
}: RowCardProps) {
  const clickable = Boolean(onClick);
  return (
    <div
      className={cn(
        "rounded-gmv-md border border-gmv-border bg-gmv-canvas p-3 shadow-gmv-1",
        clickable && "cursor-pointer transition active:bg-gmv-bg",
        className
      )}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === " ") e.preventDefault(); // block scroll, don't fire yet
              if (e.key === "Enter" && !e.repeat) onClick!();
            }
          : undefined
      }
      onKeyUp={
        clickable
          ? (e) => {
              if (e.key === " ") onClick!();
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 text-sm font-semibold text-gmv-text-strong">
          {title}
        </div>
        {value !== undefined && (
          <div className="shrink-0 text-sm font-bold text-gmv-primary">
            {value}
          </div>
        )}
      </div>
      {badges && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {badges}
        </div>
      )}
      {meta && meta.length > 0 && (
        <dl className="mt-2 space-y-1">
          {meta.map((m) => (
            <div key={m.label} className="flex justify-between gap-3 text-xs">
              <dt className="shrink-0 text-gmv-muted">{m.label}</dt>
              <dd className="min-w-0 truncate text-right text-gmv-text">
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {actions && (
        <div
          className="mt-2.5 flex flex-wrap gap-2 border-t border-gmv-border pt-2.5"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

interface RowCardListProps {
  children: ReactNode;
  /** Hiển thị khi không có thẻ nào */
  empty?: ReactNode;
  className?: string;
}

export function RowCardList({ children, empty, className }: RowCardListProps) {
  const hasChildren = Children.toArray(children).some(isValidElement);
  return (
    <div className={cn("space-y-2", className)}>
      {hasChildren ? (
        children
      ) : (
        <div className="rounded-gmv-md border border-dashed border-gmv-border p-6 text-center text-sm text-gmv-muted">
          {empty ?? "Không có dữ liệu"}
        </div>
      )}
    </div>
  );
}
