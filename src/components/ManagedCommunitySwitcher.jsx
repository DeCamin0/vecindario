import { useAuth } from '../context/AuthContext'
import { shouldShowManagedCommunitySwitcher } from '../utils/managedCommunitySwitcherUtils.js'

/**
 * Selector de comunidad activa para personal con varias fichas (mismo correo).
 * Solo se muestra si hay más de una comunidad gestionada.
 */
export default function ManagedCommunitySwitcher({ className = '' }) {
  const {
    communityId,
    setCommunity,
    userRole,
    managedCommunities,
    managedCommunitiesLoading,
  } = useAuth()

  if (!shouldShowManagedCommunitySwitcher(userRole, managedCommunities)) return null

  const validIds = new Set(managedCommunities.map((c) => c.id))
  const value =
    communityId != null && validIds.has(communityId)
      ? String(communityId)
      : String(managedCommunities[0].id)

  return (
    <select
      className={className}
      aria-label="Cambiar comunidad"
      disabled={managedCommunitiesLoading}
      value={value}
      onChange={(e) => {
        const id = Number(e.target.value)
        const c = managedCommunities.find((x) => x.id === id)
        if (c) setCommunity(c.name, { id: c.id, accessCode: c.accessCode || '' })
      }}
    >
      {managedCommunities.map((c) => (
        <option key={c.id} value={String(c.id)}>
          {c.name.length > 48 ? `${c.name.slice(0, 48)}…` : c.name}
        </option>
      ))}
    </select>
  )
}
