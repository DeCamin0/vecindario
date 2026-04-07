const STAFF_ROLES = new Set(['community_admin', 'concierge', 'president'])

export function shouldShowManagedCommunitySwitcher(userRole, managedCommunities) {
  return STAFF_ROLES.has(userRole) && managedCommunities.length > 1
}
