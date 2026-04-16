package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/haywardsolutions/backlog/api/internal/domain"
	"github.com/haywardsolutions/backlog/api/internal/events"
	mw "github.com/haywardsolutions/backlog/api/internal/http/middleware"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

// ServiceDeskHandler groups endpoints for templates, public/internal desk
// browse/submit, and the submitter tracking page. It shares the board hub
// so generated tasks still surface on the live board.
type ServiceDeskHandler struct {
	Store *store.Store
	Hub   *events.Hub
}

// --- Authenticated template CRUD ---

func (h *ServiceDeskHandler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	boardID, _ := urlUUID(r, "boardID")
	includeArchived := r.URL.Query().Get("include_archived") == "1"
	ts, err := h.Store.ListRequestTemplates(r.Context(), boardID, includeArchived)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	if ts == nil {
		ts = []domain.RequestTemplate{}
	}
	writeJSON(w, http.StatusOK, ts)
}

func (h *ServiceDeskHandler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	boardID, _ := urlUUID(r, "boardID")
	// Only service-desk boards carry templates; reject early so standard
	// boards can't accumulate orphan request forms.
	b, err := h.Store.GetBoard(r.Context(), boardID)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	if b.Type != domain.BoardServiceDesk {
		httpErr(w, http.StatusBadRequest, "board is not a service desk")
		return
	}
	var body struct {
		Name            string          `json:"name"`
		Description     string          `json:"description"`
		Position        float64         `json:"position"`
		DefaultPriority domain.Priority `json:"default_priority"`
	}
	if err := readJSON(r, &body); err != nil || strings.TrimSpace(body.Name) == "" {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if body.DefaultPriority == "" {
		body.DefaultPriority = domain.PrioMed
	}
	if !body.DefaultPriority.Valid() {
		httpErr(w, http.StatusBadRequest, "bad priority")
		return
	}
	t := domain.RequestTemplate{
		ID:              uuid.Must(uuid.NewV7()),
		BoardID:         boardID,
		Name:            strings.TrimSpace(body.Name),
		Description:     body.Description,
		Position:        body.Position,
		DefaultPriority: body.DefaultPriority,
	}
	if err := h.Store.CreateRequestTemplate(r.Context(), t); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	// Seed a single "summary" field so the template is usable without
	// further configuration. The submitter form always renders a header
	// + email, so the shortest viable template is one free-text field.
	summary := domain.RequestTemplateField{
		ID:         uuid.Must(uuid.NewV7()),
		TemplateID: t.ID,
		Key:        "summary",
		Label:      "Summary",
		Type:       domain.FieldText,
		Required:   true,
		Position:   1,
		Options:    []string{},
	}
	_ = h.Store.CreateRequestField(r.Context(), summary)
	full, _ := h.Store.GetRequestTemplate(r.Context(), t.ID)
	writeJSON(w, http.StatusCreated, full)
}

func (h *ServiceDeskHandler) GetTemplate(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "templateID")
	t, err := h.Store.GetRequestTemplate(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (h *ServiceDeskHandler) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "templateID")
	var body struct {
		Name            *string          `json:"name,omitempty"`
		Description     *string          `json:"description,omitempty"`
		Position        *float64         `json:"position,omitempty"`
		DefaultPriority *domain.Priority `json:"default_priority,omitempty"`
		Archived        *bool            `json:"archived,omitempty"`
	}
	if err := readJSON(r, &body); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if body.DefaultPriority != nil && !body.DefaultPriority.Valid() {
		httpErr(w, http.StatusBadRequest, "bad priority")
		return
	}
	if err := h.Store.UpdateRequestTemplate(r.Context(), id, store.RequestTemplateUpdate{
		Name:            body.Name,
		Description:     body.Description,
		Position:        body.Position,
		DefaultPriority: body.DefaultPriority,
		Archived:        body.Archived,
	}); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	t, _ := h.Store.GetRequestTemplate(r.Context(), id)
	writeJSON(w, http.StatusOK, t)
}

func (h *ServiceDeskHandler) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "templateID")
	if err := h.Store.DeleteRequestTemplate(r.Context(), id); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Fields ---

func (h *ServiceDeskHandler) CreateField(w http.ResponseWriter, r *http.Request) {
	tid, _ := urlUUID(r, "templateID")
	var body struct {
		Key      string                  `json:"key"`
		Label    string                  `json:"label"`
		Type     domain.RequestFieldType `json:"type"`
		Required bool                    `json:"required"`
		Position float64                 `json:"position"`
		Options  []string                `json:"options"`
		HelpText string                  `json:"help_text"`
	}
	if err := readJSON(r, &body); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	body.Key = strings.TrimSpace(body.Key)
	body.Label = strings.TrimSpace(body.Label)
	if body.Key == "" || body.Label == "" {
		httpErr(w, http.StatusBadRequest, "key and label required")
		return
	}
	if !body.Type.Valid() {
		httpErr(w, http.StatusBadRequest, "bad field type")
		return
	}
	if body.Options == nil {
		body.Options = []string{}
	}
	f := domain.RequestTemplateField{
		ID:         uuid.Must(uuid.NewV7()),
		TemplateID: tid,
		Key:        body.Key,
		Label:      body.Label,
		Type:       body.Type,
		Required:   body.Required,
		Position:   body.Position,
		Options:    body.Options,
		HelpText:   body.HelpText,
	}
	if err := h.Store.CreateRequestField(r.Context(), f); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, f)
}

func (h *ServiceDeskHandler) UpdateField(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "fieldID")
	var body struct {
		Key      *string                  `json:"key,omitempty"`
		Label    *string                  `json:"label,omitempty"`
		Type     *domain.RequestFieldType `json:"type,omitempty"`
		Required *bool                    `json:"required,omitempty"`
		Position *float64                 `json:"position,omitempty"`
		Options  *[]string                `json:"options,omitempty"`
		HelpText *string                  `json:"help_text,omitempty"`
	}
	if err := readJSON(r, &body); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if body.Type != nil && !body.Type.Valid() {
		httpErr(w, http.StatusBadRequest, "bad field type")
		return
	}
	if err := h.Store.UpdateRequestField(r.Context(), id, store.RequestFieldUpdate{
		Key:      body.Key,
		Label:    body.Label,
		Type:     body.Type,
		Required: body.Required,
		Position: body.Position,
		Options:  body.Options,
		HelpText: body.HelpText,
	}); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	f, _ := h.Store.GetRequestField(r.Context(), id)
	writeJSON(w, http.StatusOK, f)
}

func (h *ServiceDeskHandler) DeleteField(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "fieldID")
	if err := h.Store.DeleteRequestField(r.Context(), id); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Submission panel on task drawer ---

// GetTaskSubmission returns the raw intake record for a task, or 404 if the
// task wasn't created via the service desk.
func (h *ServiceDeskHandler) GetTaskSubmission(w http.ResponseWriter, r *http.Request) {
	taskID, _ := urlUUID(r, "taskID")
	sub, err := h.Store.GetSubmissionForTask(r.Context(), taskID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		internalErr(w, r, err, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, sub)
}

// --- Public / internal desk endpoints ---

// DeskView is the subset of a board that unauthenticated (or any authed)
// users can see on /desk/{slug}. It intentionally omits team id, task
// contents, etc. — only what's needed to render the intake form and
// link back to the owning team's desk list.
type DeskView struct {
	Name        string                   `json:"name"`
	Description string                   `json:"description"`
	Slug        string                   `json:"slug"`
	Visibility  domain.BoardVisibility   `json:"visibility"`
	TeamName    string                   `json:"team_name"`
	TeamSlug    string                   `json:"team_slug"`
	Templates   []domain.RequestTemplate `json:"templates"`
}

// resolveDesk loads a board by slug and enforces visibility rules. For
// "internal" boards the caller must be authenticated (session cookie). For
// "public" boards nobody needs to be signed in. Private boards cannot be
// reached via this path at all.
func (h *ServiceDeskHandler) resolveDesk(r *http.Request, requireAuthForInternal bool) (domain.Board, int, string) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		return domain.Board{}, http.StatusBadRequest, "bad slug"
	}
	b, err := h.Store.GetBoardByPublicSlug(r.Context(), slug)
	if err != nil {
		return domain.Board{}, http.StatusNotFound, "not found"
	}
	if b.ArchivedAt != nil {
		return domain.Board{}, http.StatusGone, "desk archived"
	}
	if b.Type != domain.BoardServiceDesk {
		return domain.Board{}, http.StatusNotFound, "not found"
	}
	t, err := h.Store.GetTeam(r.Context(), b.TeamID)
	if err != nil || !t.ServiceDeskEnabled {
		return domain.Board{}, http.StatusNotFound, "not found"
	}
	switch b.Visibility {
	case domain.VisibilityPublic:
		// fine, any visitor.
	case domain.VisibilityInternal:
		if requireAuthForInternal {
			if _, ok := mw.UserFrom(r.Context()); !ok {
				return domain.Board{}, http.StatusUnauthorized, "sign in to submit"
			}
		}
	default:
		return domain.Board{}, http.StatusNotFound, "not found"
	}
	return b, 0, ""
}

// allowedDeskVisibilities picks which desk visibilities the current
// request may discover. Anonymous visitors see only public desks;
// authenticated users additionally see internal ones. Private desks are
// never reachable through the public surface.
func allowedDeskVisibilities(r *http.Request) []string {
	if _, ok := mw.UserFrom(r.Context()); ok {
		return []string{string(domain.VisibilityPublic), string(domain.VisibilityInternal)}
	}
	return []string{string(domain.VisibilityPublic)}
}

// ListServiceDeskTeams backs the /service-desk landing page. It returns
// only teams the caller can actually use — i.e. teams with service desk
// enabled and at least one desk that matches the caller's visibility.
// Team ids are intentionally omitted from the public shape; consumers
// navigate by slug.
func (h *ServiceDeskHandler) ListServiceDeskTeams(w http.ResponseWriter, r *http.Request) {
	vis := allowedDeskVisibilities(r)
	teams, err := h.Store.ListPublicServiceDeskTeams(r.Context(), vis)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	type teamLite struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	}
	out := make([]teamLite, 0, len(teams))
	for _, t := range teams {
		out = append(out, teamLite{Name: t.Name, Slug: t.Slug})
	}
	writeJSON(w, http.StatusOK, out)
}

// GetServiceDeskTeam returns the list of desks visible to the caller for
// a given team. Unknown teams, teams without the feature enabled, and
// teams whose only desks are private or internal (for anon callers) all
// surface as 404 so we don't leak existence of internal surfaces.
func (h *ServiceDeskHandler) GetServiceDeskTeam(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "teamSlug")
	if slug == "" {
		httpErr(w, http.StatusBadRequest, "bad slug")
		return
	}
	t, err := h.Store.GetTeamBySlug(r.Context(), slug)
	if err != nil || !t.ServiceDeskEnabled {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	vis := allowedDeskVisibilities(r)
	boards, err := h.Store.ListPublicDesksForTeam(r.Context(), t.ID, vis)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	// Hide teams whose desks are all invisible to this caller. Prevents
	// revealing that "team X exists and has internal-only forms".
	if len(boards) == 0 {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	type deskLite struct {
		Name        string                 `json:"name"`
		Description string                 `json:"description"`
		Slug        string                 `json:"slug"`
		Visibility  domain.BoardVisibility `json:"visibility"`
	}
	desks := make([]deskLite, 0, len(boards))
	for _, b := range boards {
		desks = append(desks, deskLite{
			Name:        b.Name,
			Description: b.Description,
			Slug:        derefString(b.PublicSlug),
			Visibility:  b.Visibility,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"team":  map[string]string{"name": t.Name, "slug": t.Slug},
		"desks": desks,
	})
}

func (h *ServiceDeskHandler) DeskInfo(w http.ResponseWriter, r *http.Request) {
	// Require auth for internal boards so the form content itself is
	// gated. The public route is unauthenticated at the chi level, so
	// this check is what actually blocks leak of internal-only forms.
	b, status, msg := h.resolveDesk(r, true)
	if status != 0 {
		httpErr(w, status, msg)
		return
	}
	templates, err := h.Store.ListRequestTemplates(r.Context(), b.ID, false)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	// Fetch the owning team so the UI can show a breadcrumb back to the
	// team's desk list. resolveDesk already confirmed the team exists
	// and has service desk enabled.
	team, err := h.Store.GetTeam(r.Context(), b.TeamID)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	// Strip internal positions but keep everything the UI needs.
	view := DeskView{
		Name:        b.Name,
		Description: b.Description,
		Slug:        derefString(b.PublicSlug),
		Visibility:  b.Visibility,
		TeamName:    team.Name,
		TeamSlug:    team.Slug,
		Templates:   templates,
	}
	writeJSON(w, http.StatusOK, view)
}

// deskSubmissionLimiter throttles the public submit endpoint. Separate
// from the auth limiter so bursty form usage doesn't bleed into login
// budgets. Keyed by IP+slug so one abusive submitter can't poison a
// neighbouring desk.
var deskSubmissionLimiter = &simpleLimiter{
	capacity:   20,
	refillRate: 20.0 / 60.0, // twenty per minute steady-state
	buckets:    map[string]*limitBucket{},
}

type simpleLimiter struct {
	capacity   float64
	refillRate float64
	mu         sync.Mutex
	buckets    map[string]*limitBucket
	lastSweep  time.Time
}

type limitBucket struct {
	tokens float64
	last   time.Time
}

func (l *simpleLimiter) allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if now.Sub(l.lastSweep) > 15*time.Minute {
		for k, b := range l.buckets {
			if now.Sub(b.last) > time.Hour {
				delete(l.buckets, k)
			}
		}
		l.lastSweep = now
	}
	b, ok := l.buckets[key]
	if !ok {
		l.buckets[key] = &limitBucket{tokens: l.capacity - 1, last: now}
		return true
	}
	elapsed := now.Sub(b.last).Seconds()
	b.tokens += elapsed * l.refillRate
	if b.tokens > l.capacity {
		b.tokens = l.capacity
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func clientIPFor(r *http.Request) string {
	addr := r.RemoteAddr
	if i := strings.LastIndex(addr, ":"); i > 0 {
		addr = addr[:i]
	}
	return strings.Trim(addr, "[]")
}

// Submit receives form values and materialises a task. Shared by public
// and internal endpoints; the caller scope is determined by the route.
func (h *ServiceDeskHandler) Submit(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	b, status, msg := h.resolveDesk(r, true)
	if status != 0 {
		httpErr(w, status, msg)
		return
	}
	// Rate limit per IP+slug. Internal submitters still count — it's not
	// about auth, it's about protecting downstream task creation.
	ipKey := clientIPFor(r) + "|" + slug
	if !deskSubmissionLimiter.allow(ipKey, time.Now()) {
		w.Header().Set("Retry-After", "60")
		httpErr(w, http.StatusTooManyRequests, "too many submissions")
		return
	}

	var body struct {
		TemplateID uuid.UUID         `json:"template_id"`
		Email      string            `json:"email"`
		Name       string            `json:"name"`
		Values     map[string]string `json:"values"`
		// Honeypot: a visually-hidden input populated by naive bots. Any
		// non-empty value gets silently 202'd so the bot moves on without
		// retrying.
		Website string `json:"website,omitempty"`
	}
	if err := readJSON(r, &body); err != nil || body.TemplateID == uuid.Nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	body.Email = strings.TrimSpace(strings.ToLower(body.Email))
	body.Name = strings.TrimSpace(body.Name)
	if !looksLikeEmail(body.Email) {
		httpErr(w, http.StatusBadRequest, "email required")
		return
	}
	if body.Website != "" {
		// Honeypot triggered — pretend it worked.
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "ok"})
		return
	}
	tmpl, err := h.Store.GetRequestTemplate(r.Context(), body.TemplateID)
	if err != nil || tmpl.BoardID != b.ID || tmpl.ArchivedAt != nil {
		httpErr(w, http.StatusBadRequest, "bad template")
		return
	}
	if body.Values == nil {
		body.Values = map[string]string{}
	}
	// Validate required fields and enforce select-option membership. We
	// keep validation server-side so the public form can't be bypassed by
	// submitting raw JSON.
	allowed := map[string]domain.RequestTemplateField{}
	for _, f := range tmpl.Fields {
		allowed[f.Key] = f
	}
	cleanValues := map[string]string{}
	for key, val := range body.Values {
		f, ok := allowed[key]
		if !ok {
			continue
		}
		val = strings.TrimSpace(val)
		if val == "" {
			continue
		}
		if f.Type == domain.FieldSelect && len(f.Options) > 0 {
			found := false
			for _, o := range f.Options {
				if o == val {
					found = true
					break
				}
			}
			if !found {
				httpErr(w, http.StatusBadRequest, "invalid option for "+f.Key)
				return
			}
		}
		cleanValues[key] = val
	}
	for _, f := range tmpl.Fields {
		if f.Required && cleanValues[f.Key] == "" {
			httpErr(w, http.StatusBadRequest, "missing required: "+f.Key)
			return
		}
	}

	// Pick landing column. Prefer the board's intake column; fall back to
	// the first column by position so submissions always land somewhere.
	intakeID, err := h.resolveIntakeColumn(r.Context(), b)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}

	// Title strategy: use the "summary" field if present, otherwise the
	// template name. Description is a rendered key/value dump of
	// everything else so the queue reader sees it at a glance.
	title := cleanValues["summary"]
	if title == "" {
		title = tmpl.Name
	}
	description := renderSubmissionBody(tmpl, cleanValues, body.Email, body.Name)

	reporterID := systemReporterID(r, b)
	submitterUserID := callerUserID(r)

	// Generate tracking token for the submitter status URL. Raw token
	// returned once; hash stored.
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	trackingToken := base64.RawURLEncoding.EncodeToString(raw)
	sum := sha256.Sum256([]byte(trackingToken))
	trackingHash := hex.EncodeToString(sum[:])

	task := domain.Task{
		ID:          uuid.Must(uuid.NewV7()),
		BoardID:     b.ID,
		ColumnID:    intakeID,
		Title:       title,
		Description: description,
		Priority:    tmpl.DefaultPriority,
		ReporterID:  reporterID,
		Position:    nextPosition(r.Context(), h.Store, intakeID),
		CreatedAt:   time.Now().UTC(),
	}
	sub := domain.RequestSubmission{
		ID:              uuid.Must(uuid.NewV7()),
		TemplateID:      tmpl.ID,
		TaskID:          task.ID,
		SubmitterEmail:  body.Email,
		SubmitterName:   body.Name,
		SubmitterUserID: submitterUserID,
		Values:          cleanValues,
	}
	ipHashSum := sha256.Sum256([]byte(clientIPFor(r)))
	ipHash := hex.EncodeToString(ipHashSum[:])
	ua := r.Header.Get("User-Agent")
	if len(ua) > 256 {
		ua = ua[:256]
	}

	err = h.Store.WithTx(r.Context(), func(tx pgx.Tx) error {
		if err := h.Store.CreateTaskInTx(r.Context(), tx, &task); err != nil {
			return err
		}
		return h.Store.CreateSubmission(r.Context(), tx, sub, trackingHash, ipHash, ua)
	})
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	// Publish so internal board watchers see the new task in real time.
	task.LabelIDs = []uuid.UUID{}
	h.Hub.Publish(b.ID, events.Event{Kind: "task.created", BoardID: b.ID.String(), Payload: task})

	writeJSON(w, http.StatusCreated, map[string]any{
		"tracking_token": trackingToken,
		"tracking_url":   "/service-desk/" + slug + "/track/" + trackingToken,
		"task_key":       task.Key,
	})
}

// Track returns the status + thread a submitter needs to follow their
// request: current column, the values they submitted, and the back-and-
// forth conversation with the team. We deliberately still avoid exposing
// anything internal (labels, assignees, estimates, team-side comments).
func (h *ServiceDeskHandler) Track(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	token := chi.URLParam(r, "token")
	b, status, msg := h.resolveDesk(r, false)
	if status != 0 {
		httpErr(w, status, msg)
		return
	}
	if token == "" {
		httpErr(w, http.StatusBadRequest, "missing token")
		return
	}
	sum := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(sum[:])
	sub, err := h.Store.GetSubmissionByTrackingHash(r.Context(), hash)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	task, err := h.Store.GetTask(r.Context(), sub.TaskID)
	if err != nil || task.BoardID != b.ID {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	col, err := h.Store.GetColumn(r.Context(), task.ColumnID)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	messages, err := h.Store.ListDeskMessages(r.Context(), sub.ID)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	if messages == nil {
		messages = []domain.DeskMessage{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"desk": map[string]string{
			"slug": slug,
			"name": b.Name,
		},
		"task_key":        task.Key,
		"title":           task.Title,
		"status":          col.Name,
		"status_kind":     col.Type,
		"submitted_at":    sub.CreatedAt,
		"submitter_email": sub.SubmitterEmail,
		"submitter_name":  sub.SubmitterName,
		"values":          sub.Values,
		"completed":       task.CompletedAt != nil,
		"messages":        messages,
	})
}

// TrackReply lets the external submitter append to the portal thread
// using only their tracking token for auth. The token itself is the
// capability — if you have it, you can reply.
func (h *ServiceDeskHandler) TrackReply(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	b, status, msg := h.resolveDesk(r, false)
	if status != 0 {
		httpErr(w, status, msg)
		return
	}
	if token == "" {
		httpErr(w, http.StatusBadRequest, "missing token")
		return
	}
	// Throttle per IP+slug so a leaked token can't be used to flood the
	// team's queue.
	ipKey := clientIPFor(r) + "|" + chi.URLParam(r, "slug")
	if !deskSubmissionLimiter.allow(ipKey, time.Now()) {
		w.Header().Set("Retry-After", "60")
		httpErr(w, http.StatusTooManyRequests, "too many messages")
		return
	}
	sum := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(sum[:])
	sub, err := h.Store.GetSubmissionByTrackingHash(r.Context(), hash)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	task, err := h.Store.GetTask(r.Context(), sub.TaskID)
	if err != nil || task.BoardID != b.ID {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	var body struct {
		Body string `json:"body"`
	}
	if err := readJSON(r, &body); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	body.Body = strings.TrimSpace(body.Body)
	if body.Body == "" {
		httpErr(w, http.StatusBadRequest, "empty message")
		return
	}
	if len(body.Body) > 8000 {
		httpErr(w, http.StatusBadRequest, "message too long")
		return
	}
	m := domain.DeskMessage{
		ID:            uuid.Must(uuid.NewV7()),
		SubmissionID:  sub.ID,
		FromSubmitter: true,
		AuthorUserID:  sub.SubmitterUserID, // may be nil for public submitters
		Body:          body.Body,
		CreatedAt:     time.Now().UTC(),
	}
	if err := h.Store.CreateDeskMessage(r.Context(), m); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	// Nudge board watchers — surface the reply live on the task drawer.
	h.Hub.Publish(b.ID, events.Event{
		Kind:    "desk_message.created",
		BoardID: b.ID.String(),
		Payload: map[string]any{"task_id": task.ID, "message": m},
	})
	writeJSON(w, http.StatusCreated, m)
}

// ListTaskDeskMessages returns the portal thread for a task. 404 for
// tasks that weren't created via an intake form.
func (h *ServiceDeskHandler) ListTaskDeskMessages(w http.ResponseWriter, r *http.Request) {
	taskID, _ := urlUUID(r, "taskID")
	sub, err := h.Store.GetSubmissionForTask(r.Context(), taskID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		internalErr(w, r, err, "internal error")
		return
	}
	msgs, err := h.Store.ListDeskMessages(r.Context(), sub.ID)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	if msgs == nil {
		msgs = []domain.DeskMessage{}
	}
	writeJSON(w, http.StatusOK, msgs)
}

// CreateTaskDeskMessage lets a signed-in team member post a reply that
// the submitter will see on the tracking page.
func (h *ServiceDeskHandler) CreateTaskDeskMessage(w http.ResponseWriter, r *http.Request) {
	taskID, _ := urlUUID(r, "taskID")
	u, ok := mw.UserFrom(r.Context())
	if !ok {
		httpErr(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sub, err := h.Store.GetSubmissionForTask(r.Context(), taskID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpErr(w, http.StatusNotFound, "not a service desk task")
			return
		}
		internalErr(w, r, err, "internal error")
		return
	}
	var body struct {
		Body string `json:"body"`
	}
	if err := readJSON(r, &body); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	body.Body = strings.TrimSpace(body.Body)
	if body.Body == "" {
		httpErr(w, http.StatusBadRequest, "empty message")
		return
	}
	if len(body.Body) > 8000 {
		httpErr(w, http.StatusBadRequest, "message too long")
		return
	}
	uid := u.ID
	m := domain.DeskMessage{
		ID:            uuid.Must(uuid.NewV7()),
		SubmissionID:  sub.ID,
		FromSubmitter: false,
		AuthorUserID:  &uid,
		AuthorName:    u.DisplayName,
		Body:          body.Body,
		CreatedAt:     time.Now().UTC(),
	}
	if m.AuthorName == "" {
		m.AuthorName = u.Email
	}
	if err := h.Store.CreateDeskMessage(r.Context(), m); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	task, err := h.Store.GetTask(r.Context(), taskID)
	if err == nil {
		h.Hub.Publish(task.BoardID, events.Event{
			Kind:    "desk_message.created",
			BoardID: task.BoardID.String(),
			Payload: map[string]any{"task_id": taskID, "message": m},
		})
	}
	writeJSON(w, http.StatusCreated, m)
}

// --- Authenticated "my requests" endpoints ---

// ListMySubmissions returns every intake the current user has submitted
// while signed in, newest first. Anonymous submissions from before the
// user signed in are not shown here — those are keyed off the tracking
// token, not the user id.
func (h *ServiceDeskHandler) ListMySubmissions(w http.ResponseWriter, r *http.Request) {
	u, ok := mw.UserFrom(r.Context())
	if !ok {
		httpErr(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	rows, err := h.Store.ListSubmissionsByUser(r.Context(), u.ID)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

// loadOwnSubmission resolves + authorises a submission for the caller and
// returns the submission + task + board + column in one helper so handlers
// don't duplicate the checks.
func (h *ServiceDeskHandler) loadOwnSubmission(r *http.Request) (domain.RequestSubmission, domain.Task, domain.Board, domain.Column, int, string) {
	u, ok := mw.UserFrom(r.Context())
	if !ok {
		return domain.RequestSubmission{}, domain.Task{}, domain.Board{}, domain.Column{}, http.StatusUnauthorized, "unauthorized"
	}
	id, err := urlUUID(r, "submissionID")
	if err != nil {
		return domain.RequestSubmission{}, domain.Task{}, domain.Board{}, domain.Column{}, http.StatusBadRequest, "bad id"
	}
	sub, err := h.Store.GetSubmissionForUser(r.Context(), u.ID, id)
	if err != nil {
		return domain.RequestSubmission{}, domain.Task{}, domain.Board{}, domain.Column{}, http.StatusNotFound, "not found"
	}
	task, err := h.Store.GetTask(r.Context(), sub.TaskID)
	if err != nil {
		return domain.RequestSubmission{}, domain.Task{}, domain.Board{}, domain.Column{}, http.StatusNotFound, "not found"
	}
	board, err := h.Store.GetBoard(r.Context(), task.BoardID)
	if err != nil || board.ArchivedAt != nil {
		return domain.RequestSubmission{}, domain.Task{}, domain.Board{}, domain.Column{}, http.StatusNotFound, "not found"
	}
	col, err := h.Store.GetColumn(r.Context(), task.ColumnID)
	if err != nil {
		return domain.RequestSubmission{}, domain.Task{}, domain.Board{}, domain.Column{}, http.StatusInternalServerError, "internal error"
	}
	return sub, task, board, col, 0, ""
}

// GetMySubmission mirrors the public /track/{token} response but is
// authorised via session auth + submitter ownership. The response shape is
// deliberately identical so the same tracking UI can render for both
// external and signed-in submitters.
func (h *ServiceDeskHandler) GetMySubmission(w http.ResponseWriter, r *http.Request) {
	sub, task, board, col, status, msg := h.loadOwnSubmission(r)
	if status != 0 {
		httpErr(w, status, msg)
		return
	}
	messages, err := h.Store.ListDeskMessages(r.Context(), sub.ID)
	if err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	if messages == nil {
		messages = []domain.DeskMessage{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"desk": map[string]string{
			"slug": derefString(board.PublicSlug),
			"name": board.Name,
		},
		"task_key":        task.Key,
		"title":           task.Title,
		"status":          col.Name,
		"status_kind":     col.Type,
		"submitted_at":    sub.CreatedAt,
		"submitter_email": sub.SubmitterEmail,
		"submitter_name":  sub.SubmitterName,
		"values":          sub.Values,
		"completed":       task.CompletedAt != nil,
		"messages":        messages,
	})
}

// CreateMySubmissionMessage lets a signed-in submitter append to their own
// portal thread without needing the original tracking token. Stays inside
// the desk_messages table so team members see it on the task drawer just
// like any other submitter reply.
func (h *ServiceDeskHandler) CreateMySubmissionMessage(w http.ResponseWriter, r *http.Request) {
	sub, task, board, _, status, msg := h.loadOwnSubmission(r)
	if status != 0 {
		httpErr(w, status, msg)
		return
	}
	u, _ := mw.UserFrom(r.Context()) // loadOwnSubmission already checked.
	var body struct {
		Body string `json:"body"`
	}
	if err := readJSON(r, &body); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	body.Body = strings.TrimSpace(body.Body)
	if body.Body == "" {
		httpErr(w, http.StatusBadRequest, "empty message")
		return
	}
	if len(body.Body) > 8000 {
		httpErr(w, http.StatusBadRequest, "message too long")
		return
	}
	uid := u.ID
	m := domain.DeskMessage{
		ID:            uuid.Must(uuid.NewV7()),
		SubmissionID:  sub.ID,
		FromSubmitter: true,
		AuthorUserID:  &uid,
		Body:          body.Body,
		CreatedAt:     time.Now().UTC(),
	}
	if err := h.Store.CreateDeskMessage(r.Context(), m); err != nil {
		internalErr(w, r, err, "internal error")
		return
	}
	h.Hub.Publish(board.ID, events.Event{
		Kind:    "desk_message.created",
		BoardID: board.ID.String(),
		Payload: map[string]any{"task_id": task.ID, "message": m},
	})
	writeJSON(w, http.StatusCreated, m)
}

// --- helpers ---

func (h *ServiceDeskHandler) resolveIntakeColumn(ctx context.Context, b domain.Board) (uuid.UUID, error) {
	if b.IntakeColumnID != nil {
		c, err := h.Store.GetColumn(ctx, *b.IntakeColumnID)
		if err == nil && c.BoardID == b.ID {
			return c.ID, nil
		}
	}
	cols, err := h.Store.ListColumns(ctx, b.ID)
	if err != nil {
		return uuid.Nil, err
	}
	if len(cols) == 0 {
		return uuid.Nil, errors.New("board has no columns")
	}
	return cols[0].ID, nil
}

func nextPosition(ctx context.Context, s *store.Store, columnID uuid.UUID) float64 {
	var pos float64
	_ = s.Pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE column_id = $1`, columnID).Scan(&pos)
	if pos == 0 {
		pos = 1
	}
	return pos
}

// systemReporterID picks a plausible reporter for the synthesised task.
// When an authenticated user submits via the internal endpoint we use
// them; otherwise we need a stable user id. We fall back to any team
// owner so the reporter foreign key stays valid.
func systemReporterID(r *http.Request, b domain.Board) uuid.UUID {
	if u, ok := mw.UserFrom(r.Context()); ok {
		return u.ID
	}
	// Try first team owner as reporter.
	ctx := r.Context()
	hctx := serviceDeskStoreFrom(ctx)
	if hctx != nil {
		members, _ := hctx.ListMembers(ctx, b.TeamID)
		for _, m := range members {
			if m.Role == domain.RoleOwner {
				return m.User.ID
			}
		}
		if len(members) > 0 {
			return members[0].User.ID
		}
	}
	return uuid.Nil
}

func callerUserID(r *http.Request) *uuid.UUID {
	if u, ok := mw.UserFrom(r.Context()); ok {
		id := u.ID
		return &id
	}
	return nil
}

// serviceDeskStoreFrom is a small indirection so systemReporterID can
// reach the store without passing it explicitly. Set at router wiring
// time. Not ideal, but avoids threading Store through every helper.
var serviceDeskStoreRef *store.Store

func serviceDeskStoreFrom(_ context.Context) *store.Store { return serviceDeskStoreRef }

// RegisterServiceDeskStore lets the router register the store reference
// the handler helpers use to fall back to team-level lookups.
func RegisterServiceDeskStore(s *store.Store) { serviceDeskStoreRef = s }

// ResolveTeamIDFromTemplate walks template -> board -> team so the
// standard ResolveTeamRole middleware can apply.
func ResolveTeamIDFromTemplate(s *store.Store) func(r *http.Request) (uuid.UUID, error) {
	return func(r *http.Request) (uuid.UUID, error) {
		id, err := urlUUID(r, "templateID")
		if err != nil {
			return uuid.Nil, err
		}
		t, err := s.GetRequestTemplate(r.Context(), id)
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

// ResolveTeamIDFromField walks field -> template -> board -> team.
func ResolveTeamIDFromField(s *store.Store) func(r *http.Request) (uuid.UUID, error) {
	return func(r *http.Request) (uuid.UUID, error) {
		id, err := urlUUID(r, "fieldID")
		if err != nil {
			return uuid.Nil, err
		}
		f, err := s.GetRequestField(r.Context(), id)
		if err != nil {
			return uuid.Nil, err
		}
		t, err := s.GetRequestTemplate(r.Context(), f.TemplateID)
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

func looksLikeEmail(s string) bool {
	if len(s) < 3 || len(s) > 254 {
		return false
	}
	at := strings.IndexByte(s, '@')
	if at < 1 || at >= len(s)-1 {
		return false
	}
	if strings.IndexByte(s[at+1:], '.') < 0 {
		return false
	}
	return true
}

func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func renderSubmissionBody(tmpl domain.RequestTemplate, values map[string]string, email, name string) string {
	var b strings.Builder
	b.WriteString("**Submitted via service desk**\n\n")
	b.WriteString("- **Email:** ")
	b.WriteString(email)
	b.WriteString("\n")
	if name != "" {
		b.WriteString("- **Name:** ")
		b.WriteString(name)
		b.WriteString("\n")
	}
	b.WriteString("- **Template:** ")
	b.WriteString(tmpl.Name)
	b.WriteString("\n\n")
	for _, f := range tmpl.Fields {
		v, ok := values[f.Key]
		if !ok || v == "" {
			continue
		}
		b.WriteString("**")
		b.WriteString(f.Label)
		b.WriteString("**\n")
		if f.Type == domain.FieldLongtext {
			b.WriteString(v)
			b.WriteString("\n\n")
		} else {
			b.WriteString(v)
			b.WriteString("\n\n")
		}
	}
	return b.String()
}
