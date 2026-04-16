package handlers

import (
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/haywardsolutions/backlog/api/internal/domain"
	"github.com/haywardsolutions/backlog/api/internal/events"
	mw "github.com/haywardsolutions/backlog/api/internal/http/middleware"
	"github.com/haywardsolutions/backlog/api/internal/storage"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

type CommentHandler struct {
	Store   *store.Store
	Hub     *events.Hub
	Storage *storage.Client
}

func (h *CommentHandler) List(w http.ResponseWriter, r *http.Request) {
	taskID, _ := urlUUID(r, "taskID")
	comments, err := h.Store.ListCommentsByTask(r.Context(), taskID)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	ids := make([]uuid.UUID, 0, len(comments))
	for _, c := range comments {
		ids = append(ids, c.ID)
	}
	attMap, err := h.Store.ListAttachmentsForComments(r.Context(), ids)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	for i := range comments {
		atts := attMap[comments[i].ID]
		for j := range atts {
			decorateAttachment(r.Context(), &atts[j], h.Storage)
		}
		if atts == nil {
			atts = []domain.Attachment{}
		}
		comments[i].Attachments = atts
	}
	writeJSON(w, http.StatusOK, comments)
}

func (h *CommentHandler) Create(w http.ResponseWriter, r *http.Request) {
	taskID, _ := urlUUID(r, "taskID")
	u, _ := mw.UserFrom(r.Context())
	var body struct {
		Body          string      `json:"body"`
		AttachmentIDs []uuid.UUID `json:"attachment_ids"`
	}
	if err := readJSON(r, &body); err != nil || body.Body == "" {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	c := domain.Comment{
		ID:       uuid.Must(uuid.NewV7()),
		TaskID:   taskID,
		AuthorID: u.ID,
		Body:     body.Body,
	}
	if err := h.Store.CreateComment(r.Context(), &c); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	for _, aid := range body.AttachmentIDs {
		_ = h.Store.AddAttachmentRef(r.Context(), aid, "comment", c.ID)
	}
	c.Attachments, _ = h.Store.ListAttachmentsForParent(r.Context(), "comment", c.ID)
	for i := range c.Attachments {
		decorateAttachment(r.Context(), &c.Attachments[i], h.Storage)
	}

	t, _ := h.Store.GetTask(r.Context(), taskID)
	_ = h.Store.WriteEvent(r.Context(), domain.TaskEvent{
		ID:        uuid.Must(uuid.NewV7()),
		TaskID:    taskID,
		ActorID:   u.ID,
		Kind:      "commented",
		Payload:   map[string]any{"comment_id": c.ID},
		CreatedAt: time.Now().UTC(),
	})
	h.Hub.Publish(t.BoardID, events.Event{Kind: "comment.created", BoardID: t.BoardID.String(), Payload: c})
	writeJSON(w, http.StatusCreated, c)
}

func (h *CommentHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "commentID")
	u, _ := mw.UserFrom(r.Context())
	_, authorID, err := h.Store.GetCommentTeam(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	if authorID != u.ID && !u.IsSystemAdmin {
		httpErr(w, http.StatusForbidden, "not author")
		return
	}
	var body struct {
		Body string `json:"body"`
	}
	if err := readJSON(r, &body); err != nil || body.Body == "" {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if err := h.Store.UpdateComment(r.Context(), id, body.Body); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	c, _ := h.Store.GetComment(r.Context(), id)
	c.Attachments, _ = h.Store.ListAttachmentsForParent(r.Context(), "comment", id)
	for i := range c.Attachments {
		decorateAttachment(r.Context(), &c.Attachments[i], h.Storage)
	}
	writeJSON(w, http.StatusOK, c)
}

func (h *CommentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "commentID")
	u, _ := mw.UserFrom(r.Context())
	_, authorID, err := h.Store.GetCommentTeam(r.Context(), id)
	if err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// Only the author (or system admin) can delete their own comment.
	if authorID != u.ID && !u.IsSystemAdmin {
		httpErr(w, http.StatusForbidden, "forbidden")
		return
	}
	if err := h.Store.DeleteComment(r.Context(), id); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func ResolveTeamIDFromComment(s *store.Store) func(r *http.Request) (uuid.UUID, error) {
	return func(r *http.Request) (uuid.UUID, error) {
		id, err := urlUUID(r, "commentID")
		if err != nil {
			return uuid.Nil, err
		}
		tid, _, err := s.GetCommentTeam(r.Context(), id)
		return tid, err
	}
}
