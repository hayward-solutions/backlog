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
		Name        string                 `json:"name"`
		Key         string                 `json:"key"`
		Description string                 `json:"description"`
		Type        domain.BoardType       `json:"type,omitempty"`
		Visibility  domain.BoardVisibility `json:"visibility,omitempty"`
		PublicSlug  string                 `json:"public_slug,omitempty"`
	}
	if err := readJSON(r, &body); err != nil || body.Name == "" {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if body.Type == "" {
		body.Type = domain.BoardStandard
	}
	if !body.Type.Valid() {
		httpErr(w, http.StatusBadRequest, "bad type")
		return
	}
	if body.Visibility == "" {
		body.Visibility = domain.VisibilityPrivate
	}
	if !body.Visibility.Valid() {
		httpErr(w, http.StatusBadRequest, "bad visibility")
		return
	}
	// Standard boards cannot be public-facing — that's a service-desk thing.
	if body.Type == domain.BoardStandard && body.Visibility != domain.VisibilityPrivate {
		httpErr(w, http.StatusBadRequest, "standard boards must be private")
		return
	}
	// Service desks require the team opt-in flag to keep the attack surface
	// gated behind an owner decision.
	if body.Type == domain.BoardServiceDesk {
		t, err := h.Store.GetTeam(r.Context(), teamID)
		if err != nil {
			internalErr(w, r, err, "internal error")
			return
		}
		if !t.ServiceDeskEnabled {
			httpErr(w, http.StatusForbidden, "service desk not enabled for this team")
			return
		}
	}
	slug := normaliseSlug(body.PublicSlug)
	// Public/internal visibility needs a slug for the /desk URL; private doesn't.
	var slugPtr *string
	if body.Visibility != domain.VisibilityPrivate {
		if slug == "" {
			httpErr(w, http.StatusBadRequest, "public_slug required for public/internal boards")
			return
		}
		slugPtr = &slug
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
		Type:        body.Type,
		Visibility:  body.Visibility,
		PublicSlug:  slugPtr,
	}
	var intakeID uuid.UUID
	err = h.Store.WithTx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(),
			`INSERT INTO boards (id, team_id, name, key, description, type, visibility, public_slug)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			b.ID, b.TeamID, b.Name, b.Key, b.Description, string(b.Type), string(b.Visibility), b.PublicSlug); err != nil {
			return err
		}
		// Service desks get a richer default flow that mirrors a typical
		// support pipeline. Standard boards keep the existing 3-column layout.
		type colDef struct {
			name string
			pos  float64
			typ  domain.ColumnType
		}
		var defaults []colDef
		if b.Type == domain.BoardServiceDesk {
			defaults = []colDef{
				{"New", 1, domain.ColTodo},
				{"Triaging", 2, domain.ColTodo},
				{"In progress", 3, domain.ColInProgress},
				{"Waiting on customer", 4, domain.ColInProgress},
				{"Resolved", 5, domain.ColDone},
			}
		} else {
			defaults = []colDef{
				{"Backlog", 1, domain.ColTodo},
				{"In Progress", 2, domain.ColInProgress},
				{"Done", 3, domain.ColDone},
			}
		}
		var first uuid.UUID
		for i, d := range defaults {
			c := domain.Column{
				ID:       uuid.Must(uuid.NewV7()),
				BoardID:  b.ID,
				Name:     d.name,
				Position: d.pos,
				Type:     d.typ,
			}
			if i == 0 {
				first = c.ID
			}
			if err := h.Store.CreateColumn(r.Context(), tx, c); err != nil {
				return err
			}
		}
		// Intake column points at the first column so incoming submissions
		// have a landing spot before anyone touches board settings.
		if b.Type == domain.BoardServiceDesk {
			intakeID = first
			if _, err := tx.Exec(r.Context(),
				`UPDATE boards SET intake_column_id = $2 WHERE id = $1`, b.ID, first); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	_ = intakeID
	b, _ = h.Store.GetBoard(r.Context(), b.ID)
	writeJSON(w, http.StatusCreated, b)
}

// normaliseSlug lowercases and strips characters that don't belong in a URL
// segment. We keep it predictable so owners don't have to guess why their
// slug was rejected.
func normaliseSlug(s string) string {
	out := make([]byte, 0, len(s))
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			out = append(out, byte(r))
		case r >= 'A' && r <= 'Z':
			out = append(out, byte(r-'A'+'a'))
		case r == '-', r == '_':
			out = append(out, byte(r))
		case r == ' ':
			out = append(out, '-')
		}
	}
	// Trim leading/trailing separators.
	for len(out) > 0 && (out[0] == '-' || out[0] == '_') {
		out = out[1:]
	}
	for len(out) > 0 && (out[len(out)-1] == '-' || out[len(out)-1] == '_') {
		out = out[:len(out)-1]
	}
	return string(out)
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
	team, err := h.Store.GetTeam(r.Context(), b.TeamID)
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
		"team_name": team.Name,
		"your_role": role,
	})
}

func (h *BoardHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "boardID")
	before, err := h.Store.GetBoard(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	var body struct {
		Name           *string                 `json:"name,omitempty"`
		Description    *string                 `json:"description,omitempty"`
		Archived       *bool                   `json:"archived,omitempty"`
		Visibility     *domain.BoardVisibility `json:"visibility,omitempty"`
		PublicSlug     *string                 `json:"public_slug,omitempty"`
		ClearSlug      bool                    `json:"clear_public_slug,omitempty"`
		IntakeColumnID *uuid.UUID              `json:"intake_column_id,omitempty"`
		ClearIntake    bool                    `json:"clear_intake_column,omitempty"`
	}
	if err := readJSON(r, &body); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	upd := store.BoardUpdate{
		Name:           body.Name,
		Description:    body.Description,
		Archived:       body.Archived,
		Visibility:     body.Visibility,
		IntakeColumnID: body.IntakeColumnID,
		ClearSlug:      body.ClearSlug,
		ClearIntake:    body.ClearIntake,
	}
	if body.PublicSlug != nil {
		slug := normaliseSlug(*body.PublicSlug)
		if slug == "" && !body.ClearSlug {
			httpErr(w, http.StatusBadRequest, "slug has no usable characters")
			return
		}
		upd.PublicSlug = &slug
	}
	if body.Visibility != nil {
		if !body.Visibility.Valid() {
			httpErr(w, http.StatusBadRequest, "bad visibility")
			return
		}
		// Standard boards can't go public/internal — visibility is a
		// service-desk affordance.
		if before.Type == domain.BoardStandard && *body.Visibility != domain.VisibilityPrivate {
			httpErr(w, http.StatusBadRequest, "standard boards must be private")
			return
		}
	}
	// Can't silently expose a public board with no slug.
	if body.Visibility != nil && *body.Visibility != domain.VisibilityPrivate {
		if upd.ClearSlug || (upd.PublicSlug != nil && *upd.PublicSlug == "") {
			httpErr(w, http.StatusBadRequest, "public/internal boards require a slug")
			return
		}
		// If caller didn't supply a slug but the board doesn't have one,
		// reject — the UI should send slug + visibility together.
		if upd.PublicSlug == nil && (before.PublicSlug == nil || *before.PublicSlug == "") {
			httpErr(w, http.StatusBadRequest, "public/internal boards require a slug")
			return
		}
	}
	// Intake column sanity check: must belong to this board.
	if body.IntakeColumnID != nil {
		c, err := h.Store.GetColumn(r.Context(), *body.IntakeColumnID)
		if err != nil || c.BoardID != id {
			httpErr(w, http.StatusBadRequest, "intake column must belong to this board")
			return
		}
	}
	if err := h.Store.UpdateBoard(r.Context(), id, upd); err != nil {
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
