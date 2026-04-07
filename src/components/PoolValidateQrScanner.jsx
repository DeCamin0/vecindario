import { useEffect, useId, useRef } from 'react'

function preferBackCameraId(devices) {
  if (!devices?.length) return null
  const labelOf = (d) => (d.label || '').toLowerCase()
  const back = devices.find((d) =>
    /back|rear|trasera|environment|wide|facing back|posteri|exterior/i.test(labelOf(d)),
  )
  return (back || devices[0]).id
}

/**
 * Escáner QR con cámara (https o localhost). En PC no hay cámara «trasera»:
 * se usa enumerateDevices / facingMode user antes que environment.
 */
export default function PoolValidateQrScanner({ active, onDecoded, onUserClose, onCameraError }) {
  const reactId = useId().replace(/:/g, '')
  const regionId = `pool-h5qr-${reactId}`
  const scannerRef = useRef(null)
  const onDecodedRef = useRef(onDecoded)
  const onUserCloseRef = useRef(onUserClose)
  const onCameraErrorRef = useRef(onCameraError)

  onDecodedRef.current = onDecoded
  onUserCloseRef.current = onUserClose
  onCameraErrorRef.current = onCameraError

  useEffect(() => {
    if (!active) return undefined
    let cancelled = false

    const stopSafe = async (h) => {
      if (!h) return
      try {
        if (h.isScanning) await h.stop()
      } catch {
        /* ignore */
      }
      try {
        h.clear()
      } catch {
        /* ignore */
      }
    }

    const makeScanner = (ScannerClass) => {
      const html5 = new ScannerClass(regionId, false)
      scannerRef.current = html5
      return html5
    }

    ;(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return

        const startOpts = { fps: 10, qrbox: { width: 260, height: 260 } }
        const onSuccess = (text) => {
          if (cancelled) return
          onDecodedRef.current(text)
          void stopSafe(scannerRef.current)
          onUserCloseRef.current()
        }
        const onFailure = () => {}

        let html5 = makeScanner(Html5Qrcode)

        const tryStart = async (cameraConfig) => {
          await html5.start(cameraConfig, startOpts, onSuccess, onFailure)
        }

        /** @type {(string|{facingMode:string})[]} */
        const strategies = []

        let devices = []
        try {
          devices = await Html5Qrcode.getCameras()
        } catch {
          devices = []
        }
        if (!cancelled && devices.length > 0) {
          strategies.push(preferBackCameraId(devices))
        }
        strategies.push({ facingMode: 'user' })
        strategies.push({ facingMode: 'environment' })

        let lastErr = null
        for (const cam of strategies) {
          if (cancelled) return
          try {
            await tryStart(cam)
            return
          } catch (e) {
            lastErr = e
            await stopSafe(html5)
            if (cancelled) return
            html5 = makeScanner(Html5Qrcode)
          }
        }

        const raw =
          lastErr instanceof Error
            ? lastErr.message
            : lastErr != null
              ? String(lastErr)
              : 'No se pudo abrir la cámara.'
        const friendly =
          /not found|notFound|Requested device/i.test(raw)
            ? 'Ninguna cámara coincide (en PC usa la webcam y pulsa «Permitir»).'
            : raw
        throw new Error(friendly)
      } catch (e) {
        if (!cancelled) {
          onCameraErrorRef.current(e instanceof Error ? e.message : String(e))
          onUserCloseRef.current()
        }
      }
    })()

    return () => {
      cancelled = true
      const h = scannerRef.current
      scannerRef.current = null
      void stopSafe(h)
    }
  }, [active, regionId])

  if (!active) return null

  return (
    <div className="pool-qr-scan-backdrop" role="dialog" aria-modal="true" aria-labelledby="pool-qr-scan-title">
      <div className="pool-qr-scan-panel card">
        <h2 id="pool-qr-scan-title" className="pool-qr-scan-title">
          Escanear código QR
        </h2>
        <p className="pool-qr-scan-hint">
          En el móvil se usa la cámara trasera si está disponible; en ordenador, la webcam. Permite el acceso cuando el
          navegador lo pida.
        </p>
        <div id={regionId} className="pool-qr-scan-viewport" />
        <button type="button" className="btn btn--ghost pool-qr-scan-cancel" onClick={() => onUserClose()}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
