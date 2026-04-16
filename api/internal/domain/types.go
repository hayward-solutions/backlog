package domain

import (
	"time"

	"github.com/google/uuid"
)

type Role string

const (
	RoleOwner  Role = "owner"
	RoleEditor Role = "editor"
	RoleMember Role = "member"
	RoleViewer Role = "viewer"
)

func (r Role) Valid() bool {
	switch r {
	case RoleOwner, RoleEditor, RoleMember, RoleViewer:
		return true
	}
	return false
}

// rank higher = more privileged
func (r Role) rank() int {
	switch r {
	case RoleOwner:
		return 4
	case RoleEditor:
		return 3
	case RoleMember:
		return 2
	case RoleViewer:
		return 1
	}
	return 0
}

func (r Role) AtLeast(min Role) bool { return r.rank() >= min.rank() }

type User struct {
	ID            uuid.UUID  `json:"id"`
	Email         string     `json:"email"`
	DisplayName   string     `json:"display_name"`
	IsSystemAdmin bool       `json:"is_system_admin"`
	DisabledAt    *time.Time `json:"disabled_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

type Team struct {
	ID                  uuid.UUID `json:"id"`
	Name                string    `json:"name"`
	Slug                string    `json:"slug"`
	ServiceDeskEnabled  bool      `json:"service_desk_enabled"`
	CreatedAt           time.Time `json:"created_at"`
}

type Membership struct {
	TeamID    uuid.UUID `json:"team_id"`
	UserID    uuid.UUID `json:"user_id"`
	Role      Role      `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

type Member struct {
	User User `json:"user"`
	Role Role `json:"role"`
}

type Invite struct {
	ID         uuid.UUID  `json:"id"`
	TeamID     uuid.UUID  `json:"team_id"`
	Email      string     `json:"email"`
	Role       Role       `json:"role"`
	InvitedBy  uuid.UUID  `json:"invited_by"`
	ExpiresAt  time.Time  `json:"expires_at"`
	AcceptedAt *time.Time `json:"accepted_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

type BoardType string

const (
	BoardStandard    BoardType = "standard"
	BoardServiceDesk BoardType = "service_desk"
)

func (t BoardType) Valid() bool {
	switch t {
	case BoardStandard, BoardServiceDesk:
		return true
	}
	return false
}

type BoardVisibility string

const (
	VisibilityPrivate  BoardVisibility = "private"
	VisibilityInternal BoardVisibility = "internal"
	VisibilityPublic   BoardVisibility = "public"
)

func (v BoardVisibility) Valid() bool {
	switch v {
	case VisibilityPrivate, VisibilityInternal, VisibilityPublic:
		return true
	}
	return false
}

type Board struct {
	ID             uuid.UUID       `json:"id"`
	TeamID         uuid.UUID       `json:"team_id"`
	Name           string          `json:"name"`
	Key            string          `json:"key"`
	Description    string          `json:"description"`
	Type           BoardType       `json:"type"`
	Visibility     BoardVisibility `json:"visibility"`
	PublicSlug     *string         `json:"public_slug,omitempty"`
	IntakeColumnID *uuid.UUID      `json:"intake_column_id,omitempty"`
	ArchivedAt     *time.Time      `json:"archived_at,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
}

type ColumnType string

const (
	ColTodo       ColumnType = "todo"
	ColInProgress ColumnType = "in_progress"
	ColDone       ColumnType = "done"
)

type Column struct {
	ID       uuid.UUID  `json:"id"`
	BoardID  uuid.UUID  `json:"board_id"`
	Name     string     `json:"name"`
	Position float64    `json:"position"`
	Type     ColumnType `json:"type"`
	WIPLimit *int       `json:"wip_limit,omitempty"`
}

type Label struct {
	ID     uuid.UUID `json:"id"`
	TeamID uuid.UUID `json:"team_id"`
	Name   string    `json:"name"`
	Color  string    `json:"color"`
}

type Priority string

const (
	PrioLow    Priority = "low"
	PrioMed    Priority = "med"
	PrioHigh   Priority = "high"
	PrioUrgent Priority = "urgent"
)

func (p Priority) Valid() bool {
	switch p {
	case PrioLow, PrioMed, PrioHigh, PrioUrgent:
		return true
	}
	return false
}

type Task struct {
	ID            uuid.UUID   `json:"id"`
	BoardID       uuid.UUID   `json:"board_id"`
	ColumnID      uuid.UUID   `json:"column_id"`
	EpicID        *uuid.UUID  `json:"epic_id,omitempty"`
	IsEpic        bool        `json:"is_epic"`
	Key           string      `json:"key"`
	Title         string      `json:"title"`
	Description   string      `json:"description"`
	Priority      Priority    `json:"priority"`
	AssigneeID    *uuid.UUID  `json:"assignee_id,omitempty"`
	ReporterID    uuid.UUID   `json:"reporter_id"`
	EstimateHours *float64    `json:"estimate_hours,omitempty"`
	StartAt       *time.Time  `json:"start_at,omitempty"`
	DueAt         *time.Time  `json:"due_at,omitempty"`
	Position      float64     `json:"position"`
	CreatedAt     time.Time   `json:"created_at"`
	CompletedAt   *time.Time  `json:"completed_at,omitempty"`
	LabelIDs      []uuid.UUID `json:"label_ids"`
}

type TaskEvent struct {
	ID        uuid.UUID `json:"id"`
	TaskID    uuid.UUID `json:"task_id"`
	ActorID   uuid.UUID `json:"actor_id"`
	Kind      string    `json:"kind"`
	Payload   any       `json:"payload"`
	CreatedAt time.Time `json:"created_at"`
}

type Comment struct {
	ID        uuid.UUID   `json:"id"`
	TaskID    uuid.UUID   `json:"task_id"`
	AuthorID  uuid.UUID   `json:"author_id"`
	Body      string      `json:"body"`
	CreatedAt time.Time   `json:"created_at"`
	EditedAt  *time.Time  `json:"edited_at,omitempty"`
	Attachments []Attachment `json:"attachments"`
}

type AttachmentKind string

const (
	AttachmentFile     AttachmentKind = "file"
	AttachmentInternal AttachmentKind = "internal"
)

func (k AttachmentKind) Valid() bool {
	switch k {
	case AttachmentFile, AttachmentInternal:
		return true
	}
	return false
}

type Attachment struct {
	ID           uuid.UUID      `json:"id"`
	TeamID       uuid.UUID      `json:"team_id"`
	UploaderID   uuid.UUID      `json:"uploader_id"`
	Kind         AttachmentKind `json:"kind"`
	Title        string         `json:"title"`
	StorageKey   *string        `json:"-"`
	Filename     *string        `json:"filename,omitempty"`
	ContentType  *string        `json:"content_type,omitempty"`
	SizeBytes    *int64         `json:"size_bytes,omitempty"`
	URL          *string        `json:"-"` // retained for legacy rows; no longer populated
	TargetType   *string        `json:"target_type,omitempty"`
	TargetID     *uuid.UUID     `json:"target_id,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
	DownloadURL  string         `json:"download_url,omitempty"`
}

type Session struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	ExpiresAt time.Time
}

// RequestFieldType enumerates the form-field input variants a template can
// declare. Kept deliberately small — anything exotic (file upload, multi-
// select) can be added later without migrating existing data.
type RequestFieldType string

const (
	FieldText     RequestFieldType = "text"
	FieldLongtext RequestFieldType = "longtext"
	FieldSelect   RequestFieldType = "select"
	FieldEmail    RequestFieldType = "email"
	FieldURL      RequestFieldType = "url"
	FieldNumber   RequestFieldType = "number"
	FieldDate     RequestFieldType = "date"
)

func (t RequestFieldType) Valid() bool {
	switch t {
	case FieldText, FieldLongtext, FieldSelect, FieldEmail, FieldURL, FieldNumber, FieldDate:
		return true
	}
	return false
}

type RequestTemplateField struct {
	ID         uuid.UUID        `json:"id"`
	TemplateID uuid.UUID        `json:"template_id"`
	Key        string           `json:"key"`
	Label      string           `json:"label"`
	Type       RequestFieldType `json:"type"`
	Required   bool             `json:"required"`
	Position   float64          `json:"position"`
	Options    []string         `json:"options"`
	HelpText   string           `json:"help_text"`
}

type RequestTemplate struct {
	ID              uuid.UUID              `json:"id"`
	BoardID         uuid.UUID              `json:"board_id"`
	Name            string                 `json:"name"`
	Description     string                 `json:"description"`
	Position        float64                `json:"position"`
	DefaultPriority Priority               `json:"default_priority"`
	ArchivedAt      *time.Time             `json:"archived_at,omitempty"`
	CreatedAt       time.Time              `json:"created_at"`
	Fields          []RequestTemplateField `json:"fields"`
}

type RequestSubmission struct {
	ID              uuid.UUID         `json:"id"`
	TemplateID      uuid.UUID         `json:"template_id"`
	TaskID          uuid.UUID         `json:"task_id"`
	SubmitterEmail  string            `json:"submitter_email"`
	SubmitterName   string            `json:"submitter_name"`
	SubmitterUserID *uuid.UUID        `json:"submitter_user_id,omitempty"`
	Values          map[string]string `json:"values"`
	CreatedAt       time.Time         `json:"created_at"`
}

// DeskMessage is one turn of the submitter<->team conversation attached to a
// submission. FromSubmitter=true means the external requester wrote it;
// false means a team member did. Kept separate from Comments so team-only
// discussion can never be leaked to the tracking page.
type DeskMessage struct {
	ID             uuid.UUID  `json:"id"`
	SubmissionID   uuid.UUID  `json:"submission_id"`
	FromSubmitter  bool       `json:"from_submitter"`
	AuthorUserID   *uuid.UUID `json:"author_user_id,omitempty"`
	AuthorName     string     `json:"author_name"`
	Body           string     `json:"body"`
	CreatedAt      time.Time  `json:"created_at"`
}
