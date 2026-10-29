export function getRolePermissions(role) {
    const canManageTeam = role === 'admin' || role === 'hr_manager'
    return {
        canManageTeam,
        canManageWorkingHours: canManageTeam,
        canEditProfile: role === 'admin',
        canEditLeaveCredits: role === 'admin',
    }
}

export function canAccessPage(page, role) {
    if (['home', 'calendar', 'analytics', 'settings'].includes(page)) return true
    if (['dashboard', 'employee-details'].includes(page)) {
        return getRolePermissions(role).canManageTeam
    }
    return false
}
