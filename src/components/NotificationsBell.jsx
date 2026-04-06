import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useNotifications } from '../context/NotificationsContext'
import './NotificationsBell.css'

export default function NotificationsBell({ variant = 'header' }) {
  const { unreadCount, items, loadingList, refreshList, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    void refreshList()
  }, [open, refreshList])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const rootClass = `notif-bell notif-bell--${variant}`

  return (
    <div className={rootClass} ref={wrapRef}>
      <button
        type="button"
        className="notif-bell__btn"
        aria-label="Notificaciones"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="notif-bell__icon" aria-hidden="true">
          🔔
        </span>
        {unreadCount > 0 ? (
          <span className="notif-bell__badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        ) : null}
      </button>
      {open ? (
        <div className="notif-bell__panel card" role="dialog" aria-label="Lista de notificaciones">
          <div className="notif-bell__head">
            <span className="notif-bell__title">Notificaciones</span>
            {unreadCount > 0 ? (
              <button type="button" className="notif-bell__linkish" onClick={() => void markAllRead()}>
                Marcar todas leídas
              </button>
            ) : null}
          </div>
          <div className="notif-bell__body">
            {loadingList ? (
              <p className="notif-bell__muted">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="notif-bell__muted">No hay notificaciones.</p>
            ) : (
              <ul className="notif-bell__list">
                {items.map((n) => (
                  <li key={n.id} className={`notif-bell__item ${n.read ? '' : 'notif-bell__item--unread'}`}>
                    {n.serviceRequestId ? (
                      <Link
                        to={`/services/${n.serviceRequestId}`}
                        className="notif-bell__item-link"
                        onClick={() => {
                          if (!n.read) void markRead(n.id)
                          setOpen(false)
                        }}
                      >
                        <span className="notif-bell__item-title">{n.title}</span>
                        <span className="notif-bell__item-body">{n.body}</span>
                        <time className="notif-bell__item-time" dateTime={n.createdAt}>
                          {new Date(n.createdAt).toLocaleString('es-ES', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="notif-bell__item-link notif-bell__item-link--btn"
                        onClick={() => {
                          if (!n.read) void markRead(n.id)
                        }}
                      >
                        <span className="notif-bell__item-title">{n.title}</span>
                        <span className="notif-bell__item-body">{n.body}</span>
                        <time className="notif-bell__item-time" dateTime={n.createdAt}>
                          {new Date(n.createdAt).toLocaleString('es-ES', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="notif-bell__hint">Actualización automática cada pocos segundos.</p>
        </div>
      ) : null}
    </div>
  )
}
