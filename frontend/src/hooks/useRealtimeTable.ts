import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

type EventType = "INSERT" | "UPDATE" | "DELETE";

const DEBOUNCE_MS = 5_000;
const JITTER_MS = 3_000;

/**
 * Subscribe to Supabase Realtime postgres_changes on one or more tables.
 * Calls `onChange` (debounced) when any INSERT/UPDATE/DELETE arrives.
 */
export function useRealtimeTable(
  tables: string[],
  onChange: () => void,
  events: EventType[] = ["INSERT", "UPDATE", "DELETE"],
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const tablesKey = tables.join(",");
  const eventsKey = events.join(",");

  useEffect(() => {
    if (!tablesKey) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    function debouncedChange() {
      if (timer) clearTimeout(timer);
      const delay = DEBOUNCE_MS + Math.floor(Math.random() * JITTER_MS);
      timer = setTimeout(() => {
        onChangeRef.current();
      }, delay);
    }

    const channelName = `realtime:${tablesKey}`;
    let channel = supabase.channel(channelName);

    for (const table of tablesKey.split(",")) {
      for (const event of eventsKey.split(",") as EventType[]) {
        channel = channel.on(
          "postgres_changes" as never,
          { event, schema: "public", table },
          debouncedChange,
        );
      }
    }

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [tablesKey, eventsKey]);
}
