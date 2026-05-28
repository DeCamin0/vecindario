import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getSignInPath } from '../utils/signInWebPath'
import './PrivacyPolicyPage.css'

/**
 * Página pública para Google Play y transparencia (misma URL en listado y app móvil).
 * Responsable del tratamiento: datos reales del titular (nombre, NIF, dirección si aplica).
 * Actualiza fecha y contacto si cambian.
 */
export default function PrivacyPolicyPage() {
  const { accessToken } = useAuth()
  const backPath = accessToken ? '/' : getSignInPath()
  const backLabel = accessToken ? '← Volver al inicio' : '← Volver al inicio de sesión'

  return (
    <div className="privacy-page">
      <header className="privacy-page__header">
        <Link to={backPath} className="privacy-page__back">
          {backLabel}
        </Link>
        <h1 className="privacy-page__title">Política de privacidad</h1>
        <p className="privacy-page__meta">
          <strong>Vecindario</strong> (aplicación web y móvil Android)
          <br />
          Última actualización: 8 de abril de 2026
        </p>
      </header>

      <article className="privacy-page__body">
        <section>
          <h2>1. Responsable del tratamiento</h2>
          <div
            className="privacy-page__responsible-brand"
            role="group"
            aria-label="Marca comercial DeCamino"
          >
            <img
              src={`${import.meta.env.BASE_URL}DeCamino-04.png`}
              alt="DeCamino"
              className="privacy-page__responsible-logo"
            />
            <div className="privacy-page__responsible-brand-text">
              <span className="privacy-page__responsible-mark">DeCamino</span>
              <span className="privacy-page__responsible-holder">
                Alexandru Mihai Paulet, titular de la marca
              </span>
            </div>
          </div>
          <p>
            El responsable del tratamiento de los datos personales es{' '}
            <strong>Alexandru Mihai Paulet</strong>, quien opera la aplicación{' '}
            <strong>Vecindario</strong> (web y Android) bajo la marca comercial{' '}
            <strong>DeCamino</strong> (el mismo logotipo que ves en la barra inferior de la app).
          </p>
          <p>
            Para ejercer tus derechos de protección de datos o plantear dudas sobre esta política, puedes
            escribir a:{' '}
            <a href="mailto:vecindario@decamino.es">vecindario@decamino.es</a>
            {'. '}
            (Si en el futuro el tratamiento pasara a una entidad jurídica distinta, se actualizará esta
            página.)
          </p>
        </section>

        <section>
          <h2>2. Descripción del servicio</h2>
          <p>
            Vecindario es una aplicación orientada a comunidades de vecinos y su gestión: comunicación,
            reservas, incidencias, avisos y, cuando la comunidad lo activa, funciones adicionales (por
            ejemplo, acceso a instalaciones o validación mediante códigos). El acceso suele requerir
            credenciales facilitadas por la comunidad o el administrador.
          </p>
        </section>

        <section>
          <h2>3. Qué datos tratamos</h2>
          <ul>
            <li>
              <strong>Datos de cuenta e identificación:</strong> por ejemplo correo electrónico, nombre,
              rol (vecino, conserje, administrador, etc.), datos de la vivienda cuando proceda (portal,
              piso, puerta) y teléfono si se facilita.
            </li>
            <li>
              <strong>Contenido que envías tú:</strong> textos en incidencias, solicitudes o mensajes, e
              <strong> imágenes que elijas adjuntar</strong> (por ejemplo, una foto asociada a una
              incidencia).
            </li>
            <li>
              <strong>Datos técnicos:</strong> identificadores necesarios para el funcionamiento de la app,
              sesión segura, notificaciones push (token del dispositivo) y registros técnicos para
              seguridad y fiabilidad del servicio.
            </li>
            <li>
              En la <strong>app móvil Android</strong>, si utilizas la función de{' '}
              <strong>escaneo de códigos QR</strong> (por ejemplo, validación en piscina), la aplicación
              puede acceder a la <strong>cámara</strong> solo en ese contexto, según los permisos del
              sistema operativo.
            </li>
          </ul>
        </section>

        <section>
          <h2>4. Finalidades y base legal</h2>
          <p>Tratamos los datos para:</p>
          <ul>
            <li>Gestionar el acceso y la cuenta de usuario (ejecución del contrato o medidas
              precontractuales / relación con la comunidad).</li>
            <li>Prestar las funcionalidades de Vecindario (incidencias, reservas, comunicaciones, etc.).</li>
            <li>Enviar <strong>notificaciones</strong> relacionadas con el servicio cuando estén activadas.</li>
            <li>Mantener la <strong>seguridad</strong> del servicio y cumplir obligaciones legales aplicables.</li>
          </ul>
          <p>
            No utilizamos tus datos para <strong>publicidad personalizada</strong> ni para vender perfiles.
            La aplicación no está orientada a mostrar anuncios de terceros.
          </p>
        </section>

        <section>
          <h2>5. Comunicación con servidores (API)</h2>
          <p>
            La aplicación se comunica con los <strong>servidores utilizados para prestar Vecindario</strong>{' '}
            para autenticarte, sincronizar la información de tu comunidad y guardar el contenido que generas.
            El tráfico se transmite de forma cifrada mediante <strong>HTTPS</strong> salvo configuraciones
            excepcionales de desarrollo.
          </p>
        </section>

        <section>
          <h2>6. Conservación</h2>
          <p>
            Conservamos los datos el tiempo necesario para prestar el servicio, mantener el historial que la
            comunidad o la ley requieran, y atender reclamaciones. Los criterios concretos pueden depender del
            tipo de dato y de la relación con la comunidad.
          </p>
        </section>

        <section>
          <h2>7. Destinatarios y encargados</h2>
          <p>
            Los datos se alojan y tratan en infraestructura bajo la responsabilidad del titular del
            tratamiento. Puede recurrirse a proveedores de confianza (por ejemplo, alojamiento, correo o
            herramientas de monitorización de errores) <strong>únicamente</strong> para operar y asegurar el
            servicio, con las garantías exigidas por la normativa aplicable (UE/EEE).
          </p>
        </section>

        <section>
          <h2>8. Tus derechos</h2>
          <p>
            Si te aplican el Reglamento (UE) 2016/679 (RGPD) y la normativa española de protección de datos,
            puedes ejercer los derechos de <strong>acceso, rectificación, supresión, limitación,
            oposición</strong> y, en su caso, <strong>portabilidad</strong>, así como retirar el consentimiento
            cuando el tratamiento se base en él. También puedes reclamar ante la <strong>AEPD</strong>{' '}
            (<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">www.aepd.es</a>).
          </p>
          <p>
            Para ejercer derechos, escribe a <a href="mailto:vecindario@decamino.es">vecindario@decamino.es</a>{' '}
            indicando tu petición y un medio de contacto.
          </p>
          <p>
            Para solicitar la <strong>eliminación de datos</strong> (con o sin cerrar la cuenta) o la{' '}
            <strong>baja de cuenta</strong> (incluidos enlaces requeridos en Google Play), consulta:{' '}
            <Link to="/delete-data">Eliminación de datos</Link>
            {' · '}
            <Link to="/delete-account">Eliminación de cuenta</Link>
            {' '}
            (misma información en ambas URLs).
          </p>
        </section>

        <section>
          <h2>9. Menores</h2>
          <p>
            Vecindario no está dirigido a menores de 14 años. Si detectas que se han facilitado datos de un
            menor sin autorización, contacta mediante el correo indicado en el apartado 1.
          </p>
        </section>

        <section>
          <h2>10. Cambios en esta política</h2>
          <p>
            El responsable del tratamiento puede actualizar este texto para reflejar cambios legales o del
            servicio. La versión vigente se publicará en esta misma página y, si el cambio es relevante, se
            comunicará por los medios razonables disponibles.
          </p>
        </section>
      </article>

      <footer className="privacy-page__footer">
        {accessToken ? (
          <>
            <Link to="/" className="privacy-page__footer-link">
              Inicio
            </Link>
            <span className="privacy-page__footer-sep">·</span>
            <Link to="/profile" className="privacy-page__footer-link">
              Perfil
            </Link>
          </>
        ) : (
          <Link to={getSignInPath()} className="privacy-page__footer-link">
            Iniciar sesión
          </Link>
        )}
        <span className="privacy-page__footer-sep">·</span>
        <Link to="/solicitar-oferta" className="privacy-page__footer-link">
          Solicitar oferta
        </Link>
      </footer>
    </div>
  )
}
