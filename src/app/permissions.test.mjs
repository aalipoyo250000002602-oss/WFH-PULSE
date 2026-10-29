import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessPage, getRolePermissions } from './permissions.mjs'

test('employees retain personal pages and cannot open team pages', () => {
    for (const page of ['home', 'calendar', 'analytics', 'settings']) {
        assert.equal(canAccessPage(page, 'employee'), true)
    }
    for (const page of ['dashboard', 'employee-details']) {
        assert.equal(canAccessPage(page, 'employee'), false)
    }
    assert.equal(getRolePermissions('employee').canManageWorkingHours, false)
})

test('admins and HR can manage team pages and company hours', () => {
    for (const role of ['admin', 'hr_manager']) {
        for (const page of ['dashboard', 'employee-details']) {
            assert.equal(canAccessPage(page, role), true)
        }
        assert.equal(getRolePermissions(role).canManageWorkingHours, true)
    }
    assert.equal(getRolePermissions('hr_manager').canEditProfile, false)
    assert.equal(getRolePermissions('hr_manager').canEditLeaveCredits, false)
    assert.equal(getRolePermissions('admin').canEditProfile, true)
    assert.equal(getRolePermissions('admin').canEditLeaveCredits, true)
})

test('unknown or missing roles cannot open privileged areas', () => {
    for (const role of [undefined, null, '', 'owner']) {
        assert.equal(canAccessPage('dashboard', role), false)
        assert.equal(canAccessPage('employee-details', role), false)
        assert.equal(getRolePermissions(role).canManageTeam, false)
    }
    assert.equal(canAccessPage('unknown', 'admin'), false)
})
