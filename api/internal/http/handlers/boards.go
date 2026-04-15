package handlers

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/haywardsolutions/backlog/api/internal/domain"
	"github.com/haywardsolutions/backlog/api/internal/events"
	mw "github.com/haywardsolutions/backlog/api/internal/http/middleware"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

type BoardHandler struct {
	Store *store.Store
	Hub   *events.Hub
}

func (h *BoardHandler) List(w http.ResponseWriter, r *http.Request) {
	teamID, _ := urlUUID(r, "teamID")
	bs, err := h.Store.ListBoards(r.Context(), teamID)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, bs)
}

func (h *BoardHandler) Create(w http.ResponseWriter, r *http.Request) {
	teamID, _ := urlUUID(r, "teamID")
	var body struct {
		Name        string `json:"name"`
		Key         string `json:"key"`
		Description string `json:"description"`
	}
	if err := readJSON(r, &body); err != nil || body.Name == "" {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	key, err := h.Store.AllocateBoardKey(r.Context(), teamID, body.Key, body.Name)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	b := domain.Board{
		ID:          uuid.Must(uuid.NewV7()),
		TeamID:      teamID,
		Name:        body.Name,
		Key:         key,
		Description: body.Description,
	}
	err = h.Store.WithTx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(),
			`INSERT INTO boards (id, team_id, name, key, description) VALUES ($1,$2,$3,$4,$5)`,
			b.ID, b.TeamID, b.Name, b.Key, b.Description); err != nil {
			return err
		}
		defaults := []struct {
			name string
			pos  float64
			typ  domain.ColumnType
		}{
			{"Backlog", 1, domain.ColTodo},
			{"In Progress", 2, domain.ColInProgress},
			{"Done", 3, domain.ColDone},
		}
		for _, d := range defaults {
			c := domain.Column{
				ID:       uuid.Must(uuid.NewV7()),
				BoardID:  b.ID,
				Name:     d.name,
				Position: d.pos,
				Type:     d.typ,
			}
			if err := h.Store.CreateColumn(r.Context(), tx, c); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	b, _ = h.Store.GetBoard(r.Context(), b.ID)
	writeJSON(w, http.StatusCreated, b)
}

// Full tree — board + columns + tasks + labels.
func (h *BoardHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "boardID")
	b, err := h.Store.GetBoard(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	cols, err := h.Store.ListColumns(r.Context(), id)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	tasks, err := h.Store.ListTasksByBoard(r.Context(), id)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	labels, err := h.Store.ListLabels(r.Context(), b.TeamID)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	if cols == nil {
		cols = []domain.Column{}
	}
	if tasks == nil {
		tasks = []domain.Task{}
	}
	if labels == nil {
		labels = []domain.Label{}
	}
	role, _ := mw.TeamRoleFrom(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"board":     b,
		"columns":   cols,
		"tasks":     tasks,
		"labels":    labels,
		"your_role": role,
	})
}

func (h *BoardHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "boardID")
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Archived    bool   `json:"archived"`
	}
	if err := readJSON(r, &body); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if err := h.Store.UpdateBoard(r.Context(), id, body.Name, body.Description, body.Archived); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	b, _ := h.Store.GetBoard(r.Context(), id)
	h.Hub.Publish(id, events.Event{Kind: "board.updated", BoardID: id.String(), Payload: b})
	writeJSON(w, http.StatusOK, b)
}

func (h *BoardHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "boardID")
	if err := h.Store.DeleteBoard(r.Context(), id); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Columns

func (h *BoardHandler) CreateColumn(w http.ResponseWriter, r *http.Request) {
	boardID, _ := urlUUID(r, "boardID")
	var body struct {
		Name     string            `json:"name"`
		Position float64           `json:"position"`
		Type     domain.ColumnType `json:"type"`
	}
	if err := readJSON(r, &body); err != nil || body.Name == "" {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if body.Type == "" {
		body.Type = domain.ColTodo
	}
	c := domain.Column{
		ID:       uuid.Must(uuid.NewV7()),
		BoardID:  boardID,
		Name:     body.Name,
		Position: body.Position,
		Type:     body.Type,
	}
	if err := h.Store.CreateColumn(r.Context(), nil, c); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	h.Hub.Publish(boardID, events.Event{Kind: "column.created", BoardID: boardID.String(), Payload: c})
	writeJSON(w, http.StatusCreated, c)
}

func (h *BoardHandler) UpdateColumn(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "columnID")
	c, err := h.Store.GetColumn(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	var body struct {
		Name     *string            `json:"name,omitempty"`
		Position *float64           `json:"position,omitempty"`
		Type     *domain.ColumnType `json:"type,omitempty"`
		WIPLimit *int               `json:"wip_limit,omitempty"`
	}
	if err := readJSON(r, &body); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if body.Name != nil {
		c.Name = *body.Name
	}
	if body.Position != nil {
		c.Position = *body.Position
	}
	if body.Type != nil {
		c.Type = *body.Type
	}
	if body.WIPLimit != nil {
		c.WIPLimit = body.WIPLimit
	}
	if err := h.Store.UpdateColumn(r.Context(), c); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	h.Hub.Publish(c.BoardID, events.Event{Kind: "column.updated", BoardID: c.BoardID.String(), Payload: c})
	writeJSON(w, http.StatusOK, c)
}

func (h *BoardHandler) DeleteColumn(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "columnID")
	c, err := h.Store.GetColumn(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	if err := h.Store.DeleteColumn(r.Context(), id); err != nil {
		internalErr(w, r, err, "failed to delete column")
		return
	}
	h.Hub.Publish(c.BoardID, events.Event{Kind: "column.deleted", BoardID: c.BoardID.String(), Payload: map[string]string{"id": id.String()}})
	w.WriteHeader(http.StatusNoContent)
}

// Resolvers for team-role middleware

func ResolveTeamIDFromBoard(s *store.Store) func(r *http.Request) (uuid.UUID, error) {
	return func(r *http.Request) (uuid.UUID, error) {
		id, err := urlUUID(r, "boardID")
		if err != nil {
			return uuid.Nil, err
		}
		b, err := s.GetBoard(r.Context(), id)
		if err != nil {
			return uuid.Nil, err
		}
		return b.TeamID, nil
	}
}

func ResolveTeamIDFromColumn(s *store.Store) func(r *http.Request) (uuid.UUID, error) {
	return func(r *http.Request) (uuid.UUID, error) {
		id, err := urlUUID(r, "columnID")
		if err != nil {
			return uuid.Nil, err
		}
		c, err := s.GetColumn(r.Context(), id)
		if err != nil {
			return uuid.Nil, err
		}
		b, err := s.GetBoard(r.Context(), c.BoardID)
		if err != nil {
			return uuid.Nil, err
		}
		return b.TeamID, nil
	}
}
