package http

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/haywardsolutions/backlog/api/internal/domain"
	"github.com/haywardsolutions/backlog/api/internal/events"
	"github.com/haywardsolutions/backlog/api/internal/http/handlers"
	mw "github.com/haywardsolutions/backlog/api/internal/http/middleware"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

func NewRouter(s *store.Store, hub *events.Hub) http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(corsForDev)

	auth := &handlers.AuthHandler{Store: s}
	admin := &handlers.AdminHandler{Store: s}
	teamH := &handlers.TeamHandler{Store: s}
	labelH := &handlers.LabelHandler{Store: s}
	boardH := &handlers.BoardHandler{Store: s, Hub: hub}
	taskH := &handlers.TaskHandler{Store: s, Hub: hub}
	streamH := &handlers.StreamHandler{Hub: hub}

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/auth/login", auth.Login)
		// invite accept (authed but no team-role)
		r.Group(func(r chi.Router) {
			r.Use(mw.RequireAuth(s))
			r.Post("/auth/logout", auth.Logout)
			r.Get("/auth/me", auth.Me)
			r.Patch("/auth/me", auth.UpdateMe)
			r.Post("/auth/change-password", auth.ChangePassword)
			r.Post("/invites/{token}/accept", teamH.AcceptInvite)
		})

		// Admin
		r.Group(func(r chi.Router) {
			r.Use(mw.RequireAuth(s))
			r.Use(mw.RequireAdmin)
			r.Get("/admin/users", admin.ListUsers)
			r.Post("/admin/users", admin.CreateUser)
			r.Patch("/admin/users/{userID}", admin.UpdateUser)
			r.Post("/admin/teams", admin.CreateTeam)
		})

		// Teams list (authed)
		r.Group(func(r chi.Router) {
			r.Use(mw.RequireAuth(s))
			r.Get("/teams", teamH.List)
		})

		// Team-scoped routes
		r.Route("/teams/{teamID}", func(r chi.Router) {
			r.Use(mw.RequireAuth(s))
			r.Use(mw.ResolveTeamRole(s, handlers.ResolveTeamIDFromURL))

			r.With(mw.RequirePerm(domain.PermViewTeam)).Get("/", teamH.Get)
			r.With(mw.RequirePerm(domain.PermViewTeam)).Get("/members", teamH.ListMembers)
			r.With(mw.RequirePerm(domain.PermViewTeam)).Get("/labels", labelH.List)
			r.With(mw.RequirePerm(domain.PermViewTeam)).Get("/boards", boardH.List)
			r.With(mw.RequirePerm(domain.PermViewTeam)).Get("/invites", teamH.ListInvites)

			r.With(mw.RequirePerm(domain.PermDeleteTeam)).Patch("/", teamH.Update)
			r.With(mw.RequirePerm(domain.PermDeleteTeam)).Delete("/", teamH.Delete)

			r.With(mw.RequirePerm(domain.PermManageMembers)).Patch("/members/{userID}", teamH.UpdateMember)
			r.With(mw.RequirePerm(domain.PermManageMembers)).Delete("/members/{userID}", teamH.RemoveMember)
			r.With(mw.RequirePerm(domain.PermManageMembers)).Post("/invites", teamH.CreateInvite)

			r.With(mw.RequirePerm(domain.PermManageLabels)).Post("/labels", labelH.Create)

			r.With(mw.RequirePerm(domain.PermManageBoards)).Post("/boards", boardH.Create)
		})

		// Label mutate/delete — resolve team via label
		r.Route("/labels/{labelID}", func(r chi.Router) {
			r.Use(mw.RequireAuth(s))
			r.Use(mw.ResolveTeamRole(s, handlers.ResolveTeamIDFromLabel(s)))
			r.With(mw.RequirePerm(domain.PermManageLabels)).Patch("/", labelH.Update)
			r.With(mw.RequirePerm(domain.PermManageLabels)).Delete("/", labelH.Delete)
		})

		// Board-scoped
		r.Route("/boards/{boardID}", func(r chi.Router) {
			r.Use(mw.RequireAuth(s))
			r.Use(mw.ResolveTeamRole(s, handlers.ResolveTeamIDFromBoard(s)))

			r.With(mw.RequirePerm(domain.PermViewTeam)).Get("/", boardH.Get)
			r.With(mw.RequirePerm(domain.PermViewTeam)).Get("/stream", streamH.Board)

			r.With(mw.RequirePerm(domain.PermManageBoards)).Patch("/", boardH.Update)
			r.With(mw.RequirePerm(domain.PermDeleteBoards)).Delete("/", boardH.Delete)

			r.With(mw.RequirePerm(domain.PermManageBoards)).Post("/columns", boardH.CreateColumn)
			r.With(mw.RequirePerm(domain.PermManageTasks)).Post("/tasks", taskH.Create)
		})

		// Column-scoped (resolve team via column)
		r.Route("/columns/{columnID}", func(r chi.Router) {
			r.Use(mw.RequireAuth(s))
			r.Use(mw.ResolveTeamRole(s, handlers.ResolveTeamIDFromColumn(s)))
			r.With(mw.RequirePerm(domain.PermManageBoards)).Patch("/", boardH.UpdateColumn)
			r.With(mw.RequirePerm(domain.PermManageBoards)).Delete("/", boardH.DeleteColumn)
		})

		// Task-scoped
		r.Route("/tasks/{taskID}", func(r chi.Router) {
			r.Use(mw.RequireAuth(s))
			r.Use(mw.ResolveTeamRole(s, handlers.ResolveTeamIDFromTask(s)))
			r.With(mw.RequirePerm(domain.PermViewTeam)).Get("/", taskH.Get)
			r.With(mw.RequirePerm(domain.PermViewTeam)).Get("/events", taskH.Events)
			r.With(mw.RequirePerm(domain.PermManageTasks)).Patch("/", taskH.Update)
			r.With(mw.RequirePerm(domain.PermManageTasks)).Post("/move", taskH.Move)
			r.With(mw.RequirePerm(domain.PermManageTasks)).Delete("/", taskH.Delete)
		})
	})

	return r
}

func corsForDev(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
