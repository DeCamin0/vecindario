import { useEffect, useRef } from 'react'
import './DialogLayer.css'

/**
 * Capa visual del diálogo (confirm / prompt). Controlada por DialogContext.
 */
export default function DialogLayer({ state, onResolve }) {
  const inputRef = useRef(null)

  useEffect(() => {
    if (!state) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onResolve(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [state, onResolve])

  useEffect(() => {
    if (state?.type === 'prompt' && inputRef.current) {
      inputRef.current.focus()
    }
  }, [state])

  if (!state) return null

  const {
    type,
    title,
    message,
    variant = 'default',
    confirmLabel,
    cancelLabel,
    placeholder,
    inputValue = '',
    onInputChange,
  } = state

  const icon =
    variant === 'danger' ? '!' : variant === 'warning' ? '⚠' : 'i'

  const confirmBtnClass =
    variant === 'danger' ? 'btn btn--danger' : 'btn btn--primary'

  const handleOverlayClick = () => {
    onResolve(type === 'prompt' ? null : false)
  }

  const handleConfirm = () => {
    if (type === 'prompt') {
      onResolve(inputValue.trim() || null)
    } else {
      onResolve(true)
    }
  }

  return (
    <div
      className="vecindario-dialog-overlay"
      role="presentation"
      onClick={handleOverlayClick}
    >
      <div
        className={`vecindario-dialog vecindario-dialog--${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vecindario-dialog-title"
        aria-describedby="vecindario-dialog-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vecindario-dialog__head">
          <span className="vecindario-dialog__icon" aria-hidden="true">
            {icon}
          </span>
          <div>
            <h2 id="vecindario-dialog-title" className="vecindario-dialog__title">
              {title}
            </h2>
            {message ? (
              <p id="vecindario-dialog-desc" className="vecindario-dialog__message">
                {message}
              </p>
            ) : null}
          </div>
        </div>

        {type === 'prompt' ? (
          <input
            ref={inputRef}
            type="text"
            className="vecindario-dialog__input"
            value={inputValue}
            placeholder={placeholder || ''}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleConfirm()
              }
            }}
            autoComplete="off"
            aria-label={placeholder || title}
          />
        ) : null}

        <div className="vecindario-dialog__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onResolve(type === 'prompt' ? null : false)}
          >
            {cancelLabel}
          </button>
          <button type="button" className={confirmBtnClass} onClick={handleConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
