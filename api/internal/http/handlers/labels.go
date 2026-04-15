package handlers

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/haywardsolutions/backlog/api/internal/domain"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

type LabelHandler struct{ Store *store.Store }

func (h *LabelHandler) List(w http.ResponseWriter, r *http.Request) {
	teamID, _ := urlUUID(r, "teamID")
	ls, err := h.Store.ListLabels(r.Context(), teamID)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, ls)
}

func (h *LabelHandler) Create(w http.ResponseWriter, r *http.Request) {
	teamID, _ := urlUUID(r, "teamID")
	var body struct{ Name, Color string }
	if err := readJSON(r, &body); err != nil || body.Name == "" {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if body.Color == "" {
		body.Color = "#888888"
	}
	l := domain.Label{
		ID:     uuid.Must(uuid.NewV7()),
		TeamID: teamID,
		Name:   body.Name,
		Color:  body.Color,
	}
	if err := h.Store.CreateLabel(r.Context(), l); err != nil {
		internalErr(w, r, err, "failed to create label")
		return
	}
	writeJSON(w, http.StatusCreated, l)
}

// For Update/Delete we resolve the team via the label row.
// The router wires this through a label-team resolver.
func ResolveTeamIDFromLabel(s *store.Store) func(r *http.Request) (uuid.UUID, error) {
	return func(r *http.Request) (uuid.UUID, error) {
		id, err := urlUUID(r, "labelID")
		if err != nil {
			return uuid.Nil, err
		}
		l, err := s.GetLabel(r.Context(), id)
		if err != nil {
			return uuid.Nil, err
		}
		return l.TeamID, nil
	}
}

func (h *LabelHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "labelID")
	var body struct{ Name, Color string }
	if err := readJSON(r, &body); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if err := h.Store.UpdateLabel(r.Context(), id, body.Name, body.Color); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	l, _ := h.Store.GetLabel(r.Context(), id)
	writeJSON(w, http.StatusOK, l)
}

func (h *LabelHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "labelID")
	if err := h.Store.DeleteLabel(r.Context(), id); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
