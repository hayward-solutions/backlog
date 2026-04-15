package handlers

import (
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/haywardsolutions/backlog/api/internal/domain"
	"github.com/haywardsolutions/backlog/api/internal/events"
	mw "github.com/haywardsolutions/backlog/api/internal/http/middleware"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

type TaskHandler struct {
	Store *store.Store
	Hub   *events.Hub
}

func (h *TaskHandler) Create(w http.ResponseWriter, r *http.Request) {
	boardID, _ := urlUUID(r, "boardID")
	u, _ := mw.UserFrom(r.Context())
	var body struct {
		Title         string      `json:"title"`
		Description   string      `json:"description"`
		ColumnID      uuid.UUID   `json:"column_id"`
		EpicID        *uuid.UUID  `json:"epic_id,omitempty"`
		IsEpic        bool        `json:"is_epic"`
		Priority      domain.Priority `json:"priority"`
		AssigneeID    *uuid.UUID  `json:"assignee_id,omitempty"`
		ReporterID    *uuid.UUID  `json:"reporter_id,omitempty"`
		EstimateHours *float64    `json:"estimate_hours,omitempty"`
		DeadlineAt    *time.Time  `json:"deadline_at,omitempty"`
		LabelIDs      []uuid.UUID `json:"label_ids"`
	}
	if err := readJSON(r, &body); err != nil || body.Title == "" || body.ColumnID == uuid.Nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if body.Priority == "" {
		body.Priority = domain.PrioMed
	}
	if !body.Priority.Valid() {
		httpErr(w, http.StatusBadRequest, "bad priority")
		return
	}
	// position = max+1 within column for simplicity
	var pos float64
	_ = h.Store.Pool.QueryRow(r.Context(),
		`SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE column_id = $1`, body.ColumnID).Scan(&pos)

	t := domain.Task{
		ID:            uuid.Must(uuid.NewV7()),
		BoardID:       boardID,
		ColumnID:      body.ColumnID,
		EpicID:        body.EpicID,
		IsEpic:        body.IsEpic,
		Title:         body.Title,
		Description:   body.Description,
		Priority:      body.Priority,
		AssigneeID:    body.AssigneeID,
		ReporterID: func() uuid.UUID {
			if body.ReporterID != nil {
				return *body.ReporterID
			}
			return u.ID
		}(),
		EstimateHours: body.EstimateHours,
		DeadlineAt:    body.DeadlineAt,
		Position:      pos,
		CreatedAt:     time.Now().UTC(),
	}
	// if creating in a done column, mark completed
	c, _ := h.Store.GetColumn(r.Context(), body.ColumnID)
	if c.Type == domain.ColDone {
		now := time.Now().UTC()
		t.CompletedAt = &now
	}
	if err := h.Store.CreateTask(r.Context(), t); err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(body.LabelIDs) > 0 {
		if err := h.Store.SetTaskLabels(r.Context(), t.ID, body.LabelIDs); err != nil {
			httpErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		t.LabelIDs = body.LabelIDs
	} else {
		t.LabelIDs = []uuid.UUID{}
	}
	h.writeEvent(r, t.ID, "created", map[string]any{"title": t.Title, "column_id": t.ColumnID})
	h.Hub.Publish(boardID, events.Event{Kind: "task.created", BoardID: boardID.String(), Payload: t})
	writeJSON(w, http.StatusCreated, t)
}

func (h *TaskHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "taskID")
	t, err := h.Store.GetTask(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (h *TaskHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "taskID")
	before, err := h.Store.GetTask(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	var body struct {
		Title         *string          `json:"title,omitempty"`
		Description   *string          `json:"description,omitempty"`
		Priority      *domain.Priority `json:"priority,omitempty"`
		AssigneeID    *uuid.UUID       `json:"assignee_id,omitempty"`
		ClearAssignee bool             `json:"clear_assignee,omitempty"`
		EstimateHours *float64         `json:"estimate_hours,omitempty"`
		ClearEstimate bool             `json:"clear_estimate,omitempty"`
		DeadlineAt    *time.Time       `json:"deadline_at,omitempty"`
		ClearDeadline bool             `json:"clear_deadline,omitempty"`
		EpicID        *uuid.UUID       `json:"epic_id,omitempty"`
		ClearEpic     bool             `json:"clear_epic,omitempty"`
		ReporterID    *uuid.UUID       `json:"reporter_id,omitempty"`
		LabelIDs      *[]uuid.UUID     `json:"label_ids,omitempty"`
	}
	if err := readJSON(r, &body); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	upd := store.TaskUpdate{
		Title:         body.Title,
		Description:   body.Description,
		Priority:      body.Priority,
		AssigneeID:    body.AssigneeID,
		ClearAssignee: body.ClearAssignee,
		EstimateHours: body.EstimateHours,
		ClearEstimate: body.ClearEstimate,
		DeadlineAt:    body.DeadlineAt,
		ClearDeadline: body.ClearDeadline,
		EpicID:        body.EpicID,
		ClearEpic:     body.ClearEpic,
		ReporterID:    body.ReporterID,
	}
	if err := h.Store.UpdateTask(r.Context(), id, upd); err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if body.LabelIDs != nil {
		if err := h.Store.SetTaskLabels(r.Context(), id, *body.LabelIDs); err != nil {
			httpErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	after, _ := h.Store.GetTask(r.Context(), id)

	// Emit granular events
	if body.Title != nil && *body.Title != before.Title {
		h.writeEvent(r, id, "title_changed", map[string]any{"from": before.Title, "to": *body.Title})
	}
	if body.Description != nil && *body.Description != before.Description {
		h.writeEvent(r, id, "description_changed", map[string]any{})
	}
	if body.Priority != nil && *body.Priority != before.Priority {
		h.writeEvent(r, id, "priority_changed", map[string]any{"from": before.Priority, "to": *body.Priority})
	}
	if body.ClearAssignee {
		h.writeEvent(r, id, "unassigned", map[string]any{})
	} else if body.AssigneeID != nil {
		h.writeEvent(r, id, "assigned", map[string]any{"user_id": *body.AssigneeID})
	}
	if body.ClearEstimate || body.EstimateHours != nil {
		h.writeEvent(r, id, "estimate_changed", map[string]any{"to": body.EstimateHours})
	}
	if body.ClearDeadline || body.DeadlineAt != nil {
		h.writeEvent(r, id, "deadline_changed", map[string]any{"to": body.DeadlineAt})
	}
	if body.ClearEpic || body.EpicID != nil {
		h.writeEvent(r, id, "epic_changed", map[string]any{"to": body.EpicID})
	}
	if body.ReporterID != nil && *body.ReporterID != before.ReporterID {
		h.writeEvent(r, id, "reporter_changed", map[string]any{"from": before.ReporterID, "to": *body.ReporterID})
	}

	h.Hub.Publish(after.BoardID, events.Event{Kind: "task.updated", BoardID: after.BoardID.String(), Payload: after})
	writeJSON(w, http.StatusOK, after)
}

func (h *TaskHandler) Move(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "taskID")
	var body struct {
		ColumnID uuid.UUID `json:"column_id"`
		Position float64   `json:"position"`
	}
	if err := readJSON(r, &body); err != nil || body.ColumnID == uuid.Nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	before, err := h.Store.GetTask(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	toDone, err := h.Store.MoveTask(r.Context(), id, body.ColumnID, body.Position)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.writeEvent(r, id, "moved_column", map[string]any{"from": before.ColumnID, "to": body.ColumnID})
	if toDone && before.CompletedAt == nil {
		h.writeEvent(r, id, "completed", map[string]any{})
	}
	if !toDone && before.CompletedAt != nil {
		h.writeEvent(r, id, "reopened", map[string]any{})
	}
	after, _ := h.Store.GetTask(r.Context(), id)
	h.Hub.Publish(after.BoardID, events.Event{Kind: "task.moved", BoardID: after.BoardID.String(), Payload: after})
	writeJSON(w, http.StatusOK, after)
}

func (h *TaskHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "taskID")
	t, err := h.Store.GetTask(r.Context(), id)
	if err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err := h.Store.DeleteTask(r.Context(), id); err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.Hub.Publish(t.BoardID, events.Event{Kind: "task.deleted", BoardID: t.BoardID.String(), Payload: map[string]string{"id": id.String()}})
	w.WriteHeader(http.StatusNoContent)
}

func (h *TaskHandler) Events(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "taskID")
	es, err := h.Store.ListEvents(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, es)
}

func (h *TaskHandler) writeEvent(r *http.Request, taskID uuid.UUID, kind string, payload any) {
	u, _ := mw.UserFrom(r.Context())
	_ = h.Store.WriteEvent(r.Context(), domain.TaskEvent{
		ID:        uuid.Must(uuid.NewV7()),
		TaskID:    taskID,
		ActorID:   u.ID,
		Kind:      kind,
		Payload:   payload,
		CreatedAt: time.Now().UTC(),
	})
}

func ResolveTeamIDFromTask(s *store.Store) func(r *http.Request) (uuid.UUID, error) {
	return func(r *http.Request) (uuid.UUID, error) {
		id, err := urlUUID(r, "taskID")
		if err != nil {
			return uuid.Nil, err
		}
		t, err := s.GetTask(r.Context(), id)
		if err != nil {
			return uuid.Nil, err
		}
		b, err := s.GetBoard(r.Context(), t.BoardID)
		if err != nil {
			return uuid.Nil, err
		}
		return b.TeamID, nil
	}
}
