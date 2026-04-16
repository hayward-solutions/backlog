package handlers

import (
	"context"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/haywardsolutions/backlog/api/internal/domain"
	mw "github.com/haywardsolutions/backlog/api/internal/http/middleware"
	"github.com/haywardsolutions/backlog/api/internal/storage"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

const (
	maxUploadBytes  = 25 * 1024 * 1024 // 25 MB
	presignTTL      = 5 * time.Minute
)

type AttachmentHandler struct {
	Store   *store.Store
	Storage *storage.Client
}

// Create handles both multipart file uploads and JSON link/internal creation.
func (h *AttachmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	teamID, _ := urlUUID(r, "teamID")
	u, _ := mw.UserFrom(r.Context())

	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "multipart/form-data") {
		h.createFile(w, r, teamID, u.ID)
		return
	}
	h.createMeta(w, r, teamID, u.ID)
}

func (h *AttachmentHandler) createFile(w http.ResponseWriter, r *http.Request, teamID, uploaderID uuid.UUID) {
	if h.Storage == nil {
		httpErr(w, http.StatusServiceUnavailable, "object storage not configured")
		return
	}
	// Enforce overall request size.
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes+1024)
	if err := r.ParseMultipartForm(maxUploadBytes + 1024); err != nil {
		httpErr(w, http.StatusRequestEntityTooLarge, "file too large (max 25MB)")
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		httpErr(w, http.StatusBadRequest, "file missing")
		return
	}
	defer file.Close()
	if hdr.Size > maxUploadBytes {
		httpErr(w, http.StatusRequestEntityTooLarge, "file too large (max 25MB)")
		return
	}

	title := r.FormValue("title")
	if title == "" {
		title = hdr.Filename
	}
	ctype := hdr.Header.Get("Content-Type")
	if ctype == "" {
		ctype = "application/octet-stream"
	}

	id := uuid.Must(uuid.NewV7())
	safeName := filepath.Base(hdr.Filename)
	key := fmt.Sprintf("teams/%s/%s/%s", teamID, id, safeName)

	if err := h.Storage.Put(r.Context(), key, ctype, file, hdr.Size); err != nil {
		internalErr(w, r, err, "upload failed")
		return
	}

	size := hdr.Size
	a := domain.Attachment{
		ID:          id,
		TeamID:      teamID,
		UploaderID:  uploaderID,
		Kind:        domain.AttachmentFile,
		Title:       title,
		StorageKey:  &key,
		Filename:    &safeName,
		ContentType: &ctype,
		SizeBytes:   &size,
	}
	if err := h.Store.CreateAttachment(r.Context(), &a); err != nil {
		_ = h.Storage.Delete(r.Context(), key)
		internalErr(w, r, err, "internal error")
		return
	}
	decorateAttachment(r.Context(), &a, h.Storage)
	writeJSON(w, http.StatusCreated, a)
}

func (h *AttachmentHandler) createMeta(w http.ResponseWriter, r *http.Request, teamID, uploaderID uuid.UUID) {
	var body struct {
		Kind       domain.AttachmentKind `json:"kind"`
		Title      string                `json:"title"`
		TargetType string                `json:"target_type"`
		TargetID   *uuid.UUID            `json:"target_id"`
	}
	if err := readJSON(r, &body); err != nil || !body.Kind.Valid() {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	a := domain.Attachment{
		ID:         uuid.Must(uuid.NewV7()),
		TeamID:     teamID,
		UploaderID: uploaderID,
		Kind:       body.Kind,
		Title:      body.Title,
	}
	switch body.Kind {
	case domain.AttachmentInternal:
		if body.TargetID == nil || (body.TargetType != "task" && body.TargetType != "board") {
			httpErr(w, http.StatusBadRequest, "target_type/target_id required")
			return
		}
		tt := body.TargetType
		a.TargetType = &tt
		a.TargetID = body.TargetID
	default:
		httpErr(w, http.StatusBadRequest, "use multipart for file kind")
		return
	}
	if err := h.Store.CreateAttachment(r.Context(), &a); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

func (h *AttachmentHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "attachmentID")
	a, err := h.Store.GetAttachment(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	decorateAttachment(r.Context(), &a, h.Storage)
	writeJSON(w, http.StatusOK, a)
}

// Download returns a 302 redirect to a fresh presigned URL.
func (h *AttachmentHandler) Download(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "attachmentID")
	a, err := h.Store.GetAttachment(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	if a.Kind != domain.AttachmentFile || a.StorageKey == nil {
		httpErr(w, http.StatusBadRequest, "not a file attachment")
		return
	}
	if h.Storage == nil {
		httpErr(w, http.StatusServiceUnavailable, "object storage not configured")
		return
	}
	url, err := h.Storage.PresignGet(r.Context(), *a.StorageKey, presignTTL)
	if err != nil {
		internalErr(w, r, err, "presign failed")
		return
	}
	http.Redirect(w, r, url, http.StatusFound)
}

func (h *AttachmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "attachmentID")
	u, _ := mw.UserFrom(r.Context())
	a, err := h.Store.GetAttachment(r.Context(), id)
	if err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if a.UploaderID != u.ID && !u.IsSystemAdmin {
		httpErr(w, http.StatusForbidden, "forbidden")
		return
	}
	if a.Kind == domain.AttachmentFile && a.StorageKey != nil && h.Storage != nil {
		_ = h.Storage.Delete(r.Context(), *a.StorageKey)
	}
	if err := h.Store.DeleteAttachment(r.Context(), id); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// AttachToTask links an existing attachment to a task.
func (h *AttachmentHandler) AttachToTask(w http.ResponseWriter, r *http.Request) {
	taskID, _ := urlUUID(r, "taskID")
	var body struct {
		AttachmentID uuid.UUID `json:"attachment_id"`
	}
	if err := readJSON(r, &body); err != nil || body.AttachmentID == uuid.Nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	// Ensure attachment belongs to the same team as the task.
	a, err := h.Store.GetAttachment(r.Context(), body.AttachmentID)
	if err != nil {
		httpErr(w, http.StatusNotFound, "attachment not found")
		return
	}
	t, err := h.Store.GetTask(r.Context(), taskID)
	if err != nil {
		httpErr(w, http.StatusNotFound, "task not found")
		return
	}
	b, _ := h.Store.GetBoard(r.Context(), t.BoardID)
	if a.TeamID != b.TeamID {
		httpErr(w, http.StatusForbidden, "cross-team attachment")
		return
	}
	if err := h.Store.AddAttachmentRef(r.Context(), body.AttachmentID, "task", taskID); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AttachmentHandler) DetachFromTask(w http.ResponseWriter, r *http.Request) {
	taskID, _ := urlUUID(r, "taskID")
	attID, _ := urlUUID(r, "attachmentID")
	if err := h.Store.RemoveAttachmentRef(r.Context(), attID, "task", taskID); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AttachmentHandler) ListForTask(w http.ResponseWriter, r *http.Request) {
	taskID, _ := urlUUID(r, "taskID")
	atts, err := h.Store.ListAttachmentsForParent(r.Context(), "task", taskID)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	for i := range atts {
		decorateAttachment(r.Context(), &atts[i], h.Storage)
	}
	writeJSON(w, http.StatusOK, atts)
}

// decorateAttachment fills DownloadURL for file attachments (presigned, 5 min).
func decorateAttachment(ctx context.Context, a *domain.Attachment, sc *storage.Client) {
	if a.Kind != domain.AttachmentFile || a.StorageKey == nil || sc == nil {
		return
	}
	url, err := sc.PresignGet(ctx, *a.StorageKey, presignTTL)
	if err == nil {
		a.DownloadURL = url
	}
}

func ResolveTeamIDFromAttachment(s *store.Store) func(r *http.Request) (uuid.UUID, error) {
	return func(r *http.Request) (uuid.UUID, error) {
		id, err := urlUUID(r, "attachmentID")
		if err != nil {
			return uuid.Nil, err
		}
		return s.GetAttachmentTeam(r.Context(), id)
	}
}
