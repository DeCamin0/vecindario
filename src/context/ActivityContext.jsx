/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'vecindario-activity'

const emptyActivityState = () => ({
  bookings: [],
})

/** Servicios pasan por API; solo reservas locales legacy en storage. */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyActivityState()
    const parsed = JSON.parse(raw)
    return {
      bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [],
    }
  } catch {
    return emptyActivityState()
  }
}

function saveToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* ignore storage errors */ }
}

const ActivityContext = createContext(null)

export function ActivityProvider({ children }) {
  const [state, setState] = useState(loadFromStorage)

  useEffect(() => {
    saveToStorage(state)
  }, [state])

  const addBooking = useCallback((item) => {
    const row = {
      id: `bk-${Date.now()}`,
      facility: item.facility,
      date: item.date,
      timeSlot: item.timeSlot,
    }
    if (item.recordedAt) row.recordedAt = item.recordedAt
    if (item.userEmail) row.userEmail = item.userEmail
    if (item.userName) row.userName = item.userName
    if (item.piso != null && String(item.piso).trim()) row.piso = String(item.piso).trim()
    if (item.portal != null && String(item.portal).trim()) row.portal = String(item.portal).trim()
    if (item.facilityId != null && String(item.facilityId).trim()) row.facilityId = String(item.facilityId).trim()
    if (item.timeSlotLabel != null && String(item.timeSlotLabel).trim()) {
      row.timeSlotLabel = String(item.timeSlotLabel).trim()
    }
    setState((prev) => ({
      ...prev,
      bookings: [row, ...prev.bookings],
    }))
  }, [])

  const value = {
    bookings: state.bookings,
    addBooking,
  }

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>
}

export function useActivity() {
  const ctx = useContext(ActivityContext)
  if (!ctx) throw new Error('useActivity must be used within ActivityProvider')
  return ctx
}
