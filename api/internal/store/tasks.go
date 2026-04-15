package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/haywardsolutions/backlog/api/internal/domain"
)

// CreateTask inserts the task and atomically allocates its board-scoped key
// (e.g. "DEM-042") by incrementing boards.task_seq. The composed key is
// written to both the passed-in struct and the database so the caller can
// return the final value to clients.
func (s *Store) CreateTask(ctx context.Context, t *domain.Task) error {
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var boardKey string
		var seq int
		if err := tx.QueryRow(ctx,
			`UPDATE boards SET task_seq = task_seq + 1
			 WHERE id = $1
			 RETURNING key, task_seq`, t.BoardID).Scan(&boardKey, &seq); err != nil {
			return err
		}
		t.Key = boardKey + "-" + padSeq(seq)
		_, err := tx.Exec(ctx,
			`INSERT INTO tasks (id, board_id, column_id, epic_id, is_epic, key, title, description,
				priority, assignee_id, reporter_id, estimate_hours, deadline_at, position, completed_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
			t.ID, t.BoardID, t.ColumnID, t.EpicID, t.IsEpic, t.Key, t.Title, t.Description,
			string(t.Priority), t.AssigneeID, t.ReporterID, t.EstimateHours, t.DeadlineAt, t.Position, t.CompletedAt)
		return err
	})
}

func (s *Store) GetTask(ctx context.Context, id uuid.UUID) (domain.Task, error) {
	var t domain.Task
	var pr string
	err := s.Pool.QueryRow(ctx,
		`SELECT id, board_id, column_id, epic_id, is_epic, key, title, description, priority,
			assignee_id, reporter_id, estimate_hours, deadline_at, position, created_at, completed_at
		 FROM tasks WHERE id = $1`, id).
		Scan(&t.ID, &t.BoardID, &t.ColumnID, &t.EpicID, &t.IsEpic, &t.Key, &t.Title, &t.Description, &pr,
			&t.AssigneeID, &t.ReporterID, &t.EstimateHours, &t.DeadlineAt, &t.Position, &t.CreatedAt, &t.CompletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}
	if err != nil {
		return t, err
	}
	t.Priority = domain.Priority(pr)
	t.LabelIDs, err = s.taskLabels(ctx, id)
	return t, err
}

func (s *Store) taskLabels(ctx context.Context, taskID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := s.Pool.Query(ctx, `SELECT label_id FROM task_labels WHERE task_id = $1`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []uuid.UUID{}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func (s *Store) ListTasksByBoard(ctx context.Context, boardID uuid.UUID) ([]domain.Task, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, board_id, column_id, epic_id, is_epic, key, title, description, priority,
			assignee_id, reporter_id, estimate_hours, deadline_at, position, created_at, completed_at
		 FROM tasks WHERE board_id = $1 ORDER BY column_id, position`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Task
	for rows.Next() {
		var t domain.Task
		var pr string
		if err := rows.Scan(&t.ID, &t.BoardID, &t.ColumnID, &t.EpicID, &t.IsEpic, &t.Key, &t.Title, &t.Description, &pr,
			&t.AssigneeID, &t.ReporterID, &t.EstimateHours, &t.DeadlineAt, &t.Position, &t.CreatedAt, &t.CompletedAt); err != nil {
			return nil, err
		}
		t.Priority = domain.Priority(pr)
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Hydrate labels in one query.
	lrows, err := s.Pool.Query(ctx,
		`SELECT tl.task_id, tl.label_id FROM task_labels tl
		 JOIN tasks t ON t.id = tl.task_id WHERE t.board_id = $1`, boardID)
	if err != nil {
		return nil, err
	}
	defer lrows.Close()
	idx := map[uuid.UUID]int{}
	for i, t := range out {
		idx[t.ID] = i
		out[i].LabelIDs = []uuid.UUID{}
	}
	for lrows.Next() {
		var tid, lid uuid.UUID
		if err := lrows.Scan(&tid, &lid); err != nil {
			return nil, err
		}
		if i, ok := idx[tid]; ok {
			out[i].LabelIDs = append(out[i].LabelIDs, lid)
		}
	}
	return out, lrows.Err()
}

type TaskUpdate struct {
	Title         *string
	Description   *string
	Priority      *domain.Priority
	AssigneeID    *uuid.UUID
	ClearAssignee bool
	EstimateHours *float64
	ClearEstimate bool
	DeadlineAt    *time.Time
	ClearDeadline bool
	EpicID        *uuid.UUID
	ClearEpic     bool
	ReporterID    *uuid.UUID
}

func (s *Store) UpdateTask(ctx context.Context, id uuid.UUID, u TaskUpdate) error {
	// Build dynamic update. Keep it simple.
	q := `UPDATE tasks SET `
	args := []any{id}
	sets := []string{}
	add := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, col+" = $"+itoa(len(args)))
	}
	if u.Title != nil {
		add("title", *u.Title)
	}
	if u.Description != nil {
		add("description", *u.Description)
	}
	if u.Priority != nil {
		add("priority", string(*u.Priority))
	}
	if u.ClearAssignee {
		sets = append(sets, "assignee_id = NULL")
	} else if u.AssigneeID != nil {
		add("assignee_id", *u.AssigneeID)
	}
	if u.ClearEstimate {
		sets = append(sets, "estimate_hours = NULL")
	} else if u.EstimateHours != nil {
		add("estimate_hours", *u.EstimateHours)
	}
	if u.ClearDeadline {
		sets = append(sets, "deadline_at = NULL")
	} else if u.DeadlineAt != nil {
		add("deadline_at", *u.DeadlineAt)
	}
	if u.ClearEpic {
		sets = append(sets, "epic_id = NULL")
	} else if u.EpicID != nil {
		add("epic_id", *u.EpicID)
	}
	if u.ReporterID != nil {
		add("reporter_id", *u.ReporterID)
	}
	if len(sets) == 0 {
		return nil
	}
	q += joinComma(sets) + ` WHERE id = $1`
	_, err := s.Pool.Exec(ctx, q, args...)
	return err
}

func (s *Store) MoveTask(ctx context.Context, id, columnID uuid.UUID, position float64) (bool, error) {
	// Returns whether the task transitioned to a done column.
	var completed *time.Time
	var colType string
	if err := s.Pool.QueryRow(ctx, `SELECT type FROM columns WHERE id = $1`, columnID).Scan(&colType); err != nil {
		return false, err
	}
	if colType == string(domain.ColDone) {
		now := time.Now().UTC()
		completed = &now
	}
	_, err := s.Pool.Exec(ctx,
		`UPDATE tasks SET column_id = $2, position = $3, completed_at = $4 WHERE id = $1`,
		id, columnID, position, completed)
	return colType == string(domain.ColDone), err
}

func (s *Store) DeleteTask(ctx context.Context, id uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM tasks WHERE id = $1`, id)
	return err
}

// Labels on tasks

func (s *Store) SetTaskLabels(ctx context.Context, taskID uuid.UUID, labelIDs []uuid.UUID) error {
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM task_labels WHERE task_id = $1`, taskID); err != nil {
			return err
		}
		for _, l := range labelIDs {
			if _, err := tx.Exec(ctx,
				`INSERT INTO task_labels (task_id, label_id) VALUES ($1,$2)`, taskID, l); err != nil {
				return err
			}
		}
		return nil
	})
}

// Events

func (s *Store) WriteEvent(ctx context.Context, e domain.TaskEvent) error {
	payload, err := json.Marshal(e.Payload)
	if err != nil {
		return err
	}
	_, err = s.Pool.Exec(ctx,
		`INSERT INTO task_events (id, task_id, actor_id, kind, payload) VALUES ($1,$2,$3,$4,$5)`,
		e.ID, e.TaskID, e.ActorID, e.Kind, payload)
	return err
}

func (s *Store) ListEvents(ctx context.Context, taskID uuid.UUID) ([]domain.TaskEvent, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, task_id, actor_id, kind, payload, created_at
		 FROM task_events WHERE task_id = $1 ORDER BY created_at`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.TaskEvent
	for rows.Next() {
		var e domain.TaskEvent
		var payload []byte
		if err := rows.Scan(&e.ID, &e.TaskID, &e.ActorID, &e.Kind, &payload, &e.CreatedAt); err != nil {
			return nil, err
		}
		if len(payload) > 0 {
			_ = json.Unmarshal(payload, &e.Payload)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// Helpers

// padSeq formats n as a zero-padded decimal with a minimum width of 3. Longer
// sequences grow naturally (e.g. "001", "042", "1234").
func padSeq(n int) string {
	s := itoa(n)
	if len(s) >= 3 {
		return s
	}
	return "000"[:3-len(s)] + s
}

func itoa(i int) string {
	// small, allocates less than strconv for short use
	if i < 10 {
		return string(rune('0' + i))
	}
	var b [20]byte
	n := len(b)
	for i > 0 {
		n--
		b[n] = byte('0' + i%10)
		i /= 10
	}
	return string(b[n:])
}

func joinComma(parts []string) string {
	if len(parts) == 0 {
		return ""
	}
	n := len(parts) - 1
	for _, p := range parts {
		n += len(p)
	}
	out := make([]byte, 0, n)
	for i, p := range parts {
		if i > 0 {
			out = append(out, ',', ' ')
		}
		out = append(out, p...)
	}
	return string(out)
}
