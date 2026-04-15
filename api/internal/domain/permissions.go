package domain

type Permission string

const (
	PermViewTeam       Permission = "view_team"
	PermManageTasks    Permission = "manage_tasks"
	PermManageLabels   Permission = "manage_labels"
	PermManageBoards   Permission = "manage_boards"
	PermDeleteBoards   Permission = "delete_boards"
	PermManageMembers  Permission = "manage_members"
	PermDeleteTeam     Permission = "delete_team"
	PermGlobalAdmin    Permission = "global_admin"
)

// Allows returns whether a role within a team grants the permission.
// System admin is handled at the call site (it bypasses team role checks).
func Allows(role Role, p Permission) bool {
	switch p {
	case PermViewTeam:
		return role.AtLeast(RoleViewer)
	case PermManageTasks:
		return role.AtLeast(RoleMember)
	case PermManageLabels, PermManageBoards:
		return role.AtLeast(RoleEditor)
	case PermDeleteBoards, PermManageMembers, PermDeleteTeam:
		return role == RoleOwner
	case PermGlobalAdmin:
		return false
	}
	return false
}
