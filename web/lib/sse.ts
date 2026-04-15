"use client";

import { useEffect } from "react";
import { API_BASE } from "./api";

export interface SseEvent {
  kind: string;
  board_id: string;
  payload: any;
}

export function useBoardStream(
  boardId: string | null,
  onEvent: (ev: SseEvent) => void
) {
  useEffect(() => {
    if (!boardId) return;
    const es = new EventSource(
      `${API_BASE}/api/v1/boards/${boardId}/stream`,
      { withCredentials: true }
    );
    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onEvent(data);
      } catch {}
    };
    [
      "task.created",
      "task.updated",
      "task.moved",
      "task.deleted",
      "column.created",
      "column.updated",
      "column.deleted",
      "board.updated",
    ].forEach((k) => es.addEventListener(k, handler as EventListener));
    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do.
    };
    return () => es.close();
  }, [boardId, onEvent]);
}
