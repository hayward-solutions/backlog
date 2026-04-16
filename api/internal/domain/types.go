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
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	CreatedAt time.Time `json:"created_at"`
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

type Board struct {
	ID          uuid.UUID  `json:"id"`
	TeamID      uuid.UUID  `json:"team_id"`
	Name        string     `json:"name"`
	Key         string     `json:"key"`
	Description string     `json:"description"`
	ArchivedAt  *time.Time `json:"archived_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
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
