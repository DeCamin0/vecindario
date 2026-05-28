import { useRef, useState } from 'react'
import { apiUrl, jsonAuthHeaders } from '../config/api.js'
import { profileAvatarSrc, resizeImageFileForAvatar } from '../utils/profileAvatar.js'

/**
 * Avatar + controles de foto. El nombre/rol van en `children` al lado del avatar.
 */
export default function ProfileAvatarEditor({
  accessToken,
  displayName,
  profileImageUrl,
  onImageChange,
  children,
}) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cacheBust, setCacheBust] = useState(0)

  const initial = (displayName || 'V').charAt(0).toUpperCase()
  const imgSrc = profileAvatarSrc(profileImageUrl, cacheBust || undefined)

  const handlePick = () => {
    if (busy) return
    setError('')
    inputRef.current?.click()
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !accessToken) return
    setBusy(true)
    setError('')
    try {
      const dataUrl = await resizeImageFileForAvatar(file)
      const res = await fetch(apiUrl('/api/auth/me/avatar'), {
        method: 'PUT',
        headers: jsonAuthHeaders(accessToken),
        body: JSON.stringify({ dataUrl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || data.message || 'No se pudo guardar la foto')
      }
      const url = data.profileImageUrl ?? null
      setCacheBust(Date.now())
      onImageChange?.(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir la foto')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    if (busy || !accessToken || !profileImageUrl) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/auth/me/avatar'), {
        method: 'DELETE',
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo quitar la foto')
      }
      setCacheBust(0)
      onImageChange?.(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al quitar la foto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="profile-head">
      <div className="profile-head__row">
        <div className="profile-head__avatar-wrap">
          <button
            type="button"
            className="user-avatar user-avatar--profile user-avatar--editable"
            onClick={handlePick}
            disabled={busy}
            aria-label={imgSrc ? 'Cambiar foto de perfil' : 'Añadir foto de perfil'}
          >
            {imgSrc ? (
              <img src={imgSrc} alt="" className="user-avatar-img" />
            ) : (
              <span className="user-avatar-inner">{initial}</span>
            )}
            <span className="user-avatar-edit-badge" aria-hidden="true">
              {busy ? '…' : '📷'}
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            className="profile-avatar-file-input"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleFile}
          />
        </div>
        {children ? <div className="profile-head__identity">{children}</div> : null}
      </div>

      <div className="profile-head__toolbar">
        <button
          type="button"
          className="profile-photo-btn"
          onClick={handlePick}
          disabled={busy}
        >
          {imgSrc ? 'Cambiar' : 'Añadir foto'}
        </button>
        {imgSrc ? (
          <button
            type="button"
            className="profile-photo-btn profile-photo-btn--muted"
            onClick={handleRemove}
            disabled={busy}
          >
            Quitar
          </button>
        ) : null}
        {!error ? (
          <span className="profile-head__hint">JPEG, PNG o WebP · opcional</span>
        ) : null}
      </div>

      {error ? (
        <p className="profile-avatar-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
