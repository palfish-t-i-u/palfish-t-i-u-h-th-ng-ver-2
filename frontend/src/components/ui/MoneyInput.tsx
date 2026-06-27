import { useRef, useCallback, useLayoutEffect, useState, type InputHTMLAttributes, type Ref } from "react";
import { formatVndInput, digitsOnly } from "../../lib/vndFormat";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (digits: string) => void;
  inputRef?: Ref<HTMLInputElement>;
};

export function MoneyInput({ value, onValueChange, inputRef, ...rest }: Props) {
  const innerRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);

  const setRef = useCallback(
    (el: HTMLInputElement | null) => {
      (innerRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
      if (typeof inputRef === "function") inputRef(el);
      else if (inputRef && typeof inputRef === "object")
        (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
    },
    [inputRef],
  );

  useLayoutEffect(() => {
    if (cursor !== null && innerRef.current) {
      innerRef.current.setSelectionRange(cursor, cursor);
    }
  });

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const el = e.target;
      const raw = el.value;
      const digits = digitsOnly(raw);

      const posBefore = el.selectionStart ?? raw.length;
      const dotsBefore = (raw.slice(0, posBefore).match(/\./g) || []).length;
      const digitsBeforeCursor = posBefore - dotsBefore;

      onValueChange(digits);

      const formatted = formatVndInput(digits);
      let digitsSeen = 0;
      let newPos = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (formatted[i] !== ".") digitsSeen++;
        if (digitsSeen >= digitsBeforeCursor) {
          newPos = i + 1;
          break;
        }
      }
      if (digitsBeforeCursor === 0) newPos = 0;
      setCursor(newPos);
    },
    [onValueChange],
  );

  return (
    <input
      {...rest}
      ref={setRef}
      type="text"
      inputMode="numeric"
      value={formatVndInput(value)}
      onChange={handleChange}
      onFocus={() => setCursor(null)}
    />
  );
}
