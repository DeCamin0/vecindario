/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import DialogLayer from '../components/DialogLayer.jsx'

const DialogContext = createContext(null)

const DEFAULT_CONFIRM = {
  title: '¿Confirmar?',
  message: '',
  confirmLabel: 'Aceptar',
  cancelLabel: 'Cancelar',
  variant: 'default',
}

const DEFAULT_PROMPT = {
  title: 'Introduce un valor',
  message: '',
  confirmLabel: 'Aceptar',
  cancelLabel: 'Cancelar',
  placeholder: '',
  variant: 'default',
}

/**
 * Sustituye window.confirm / window.prompt por diálogos alineados con Vecindario.
 *
 * @example
 * const { confirm, prompt } = useDialog()
 * const ok = await confirm({ title: 'Cancelar reserva', message: '…', variant: 'danger', confirmLabel: 'Sí, cancelar' })
 */
export function DialogProvider({ children }) {
  const [state, setState] = useState(null)

  const finish = useCallback((result) => {
    setState((prev) => {
      prev?.resolve?.(result)
      return null
    })
  }, [])

  const confirm = useCallback((options = {}) => {
    const opts = { ...DEFAULT_CONFIRM, ...options }
    return new Promise((resolve) => {
      setState({
        type: 'confirm',
        ...opts,
        resolve,
      })
    })
  }, [])

  const prompt = useCallback((options = {}) => {
    const opts = { ...DEFAULT_PROMPT, ...options }
    return new Promise((resolve) => {
      setState({
        type: 'prompt',
        ...opts,
        inputValue: opts.defaultValue ?? '',
        resolve,
        onInputChange: (v) => {
          setState((prev) => (prev?.type === 'prompt' ? { ...prev, inputValue: v } : prev))
        },
      })
    })
  }, [])

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt])

  return (
    <DialogContext.Provider value={value}>
      {children}
      <DialogLayer
        state={state}
        onResolve={finish}
      />
    </DialogContext.Provider>
  )
}

export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) {
    throw new Error('useDialog debe usarse dentro de DialogProvider')
  }
  return ctx
}
