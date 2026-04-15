package events

import (
	"sync"

	"github.com/google/uuid"
)

type Event struct {
	Kind    string `json:"kind"`
	BoardID string `json:"board_id"`
	Payload any    `json:"payload"`
}

type Hub struct {
	mu   sync.RWMutex
	subs map[uuid.UUID]map[chan Event]struct{}
}

func NewHub() *Hub {
	return &Hub{subs: map[uuid.UUID]map[chan Event]struct{}{}}
}

func (h *Hub) Subscribe(boardID uuid.UUID) chan Event {
	ch := make(chan Event, 16)
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.subs[boardID]; !ok {
		h.subs[boardID] = map[chan Event]struct{}{}
	}
	h.subs[boardID][ch] = struct{}{}
	return ch
}

func (h *Hub) Unsubscribe(boardID uuid.UUID, ch chan Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if m, ok := h.subs[boardID]; ok {
		delete(m, ch)
		if len(m) == 0 {
			delete(h.subs, boardID)
		}
	}
	close(ch)
}

func (h *Hub) Publish(boardID uuid.UUID, ev Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subs[boardID] {
		select {
		case ch <- ev:
		default:
			// drop if subscriber is slow
		}
	}
}
