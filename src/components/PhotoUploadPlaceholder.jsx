import './PhotoUploadPlaceholder.css'

/**
 * UI-only photo upload placeholder. No real file upload.
 * Optional onSelect() for visual feedback (e.g. show "file added" state).
 */
export default function PhotoUploadPlaceholder({ label = 'Añadir foto', hint = 'Opcional', hasFile, onSelect }) {
  const handleClick = () => {
    onSelect?.()
  }

  return (
    <button
      type="button"
      className={`photo-upload-placeholder ${hasFile ? 'photo-upload-placeholder--has-file' : ''}`}
      onClick={handleClick}
      aria-label={label}
    >
      <span className="photo-upload-icon" aria-hidden="true">
        {hasFile ? '✓' : '📷'}
      </span>
      <span className="photo-upload-text">{hasFile ? 'Foto añadida' : label}</span>
      {hint && !hasFile && <span className="photo-upload-hint">{hint}</span>}
    </button>
  )
}
