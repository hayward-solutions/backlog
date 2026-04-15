package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/haywardsolutions/backlog/api/internal/events"
	mw "github.com/haywardsolutions/backlog/api/internal/http/middleware"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

type StreamHandler struct {
	Hub   *events.Hub
	Store *store.Store
}

func (h *StreamHandler) Board(w http.ResponseWriter, r *http.Request) {
	boardID, err := urlUUID(r, "boardID")
	if err != nil {
		httpErr(w, http.StatusBadRequest, "bad id")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		httpErr(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	ch := h.Hub.Subscribe(boardID)
	defer h.Hub.Unsubscribe(boardID, ch)

	// initial hello
	fmt.Fprintf(w, "event: hello\ndata: {}\n\n")
	flusher.Flush()

	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			// Revalidate the session on each heartbeat so that a logout or
			// expired session promptly terminates the long-lived stream.
			if h.Store != nil {
				if sid, ok := mw.SessionIDFrom(r.Context()); ok {
					if _, err := h.Store.GetSession(r.Context(), sid); err != nil {
						return
					}
				}
			}
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case ev, ok := <-ch:
			if !ok {
				return
			}
			data, err := json.Marshal(ev)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Kind, data)
			flusher.Flush()
		}
	}
}
