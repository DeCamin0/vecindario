import { profileAvatarSrc } from '../utils/profileAvatar.js'
import './UserAvatarDisplay.css'

/**
 * Avatar circular: foto si existe, si no inicial (opcional ocultar sin foto).
 * @param {{ name?: string | null, profileImageUrl?: string | null, size?: 'sm' | 'md' | 'lg', hideWithoutPhoto?: boolean, className?: string }} props
 */
export default function UserAvatarDisplay({
  name,
  profileImageUrl,
  size = 'md',
  hideWithoutPhoto = false,
  className = '',
}) {
  const src = profileAvatarSrc(profileImageUrl)
  const initial = (name || 'V').charAt(0).toUpperCase()

  if (!src && hideWithoutPhoto) return null

  const sizeClass = `user-avatar-display--${size}`

  return (
    <div
      className={`user-avatar-display ${sizeClass} ${className}`.trim()}
      aria-hidden={src ? 'true' : undefined}
    >
      {src ? (
        <img src={src} alt="" className="user-avatar-display__img" />
      ) : (
        <span className="user-avatar-display__initial">{initial}</span>
      )}
    </div>
  )
}
