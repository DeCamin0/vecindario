import { Link } from 'react-router-dom'
import { getSignInPath } from '../utils/signInWebPath'
import './PrivacyPolicyPage.css'

/**
 * URLs públicas para Google Play:
 * - /delete-data  → eliminación de datos (con o sin cuenta)
 * - /delete-account → misma página (ancla #cuenta si hace falta)
 *
 * Requisitos Play: nombre app/desarrollador, pasos, qué se elimina/conserva, plazos.
 */
export default function AccountDeletionPage() {
  return (
    <div className="privacy-page">
      <header className="privacy-page__header">
        <Link to={getSignInPath()} className="privacy-page__back">
          ← Volver al inicio de sesión
        </Link>
        <h1 className="privacy-page__title">Eliminación de datos y de cuenta — Vecindario</h1>
        <p className="privacy-page__meta">
          <strong>Vecindario</strong> (aplicación web y móvil Android), operada bajo la marca{' '}
          <strong>DeCamino</strong> por <strong>Alexandru Mihai Paulet</strong>, titular de la marca.
          <br />
          Misma ficha de desarrollador que en Google Play Store.
        </p>
        <p className="privacy-page__meta" style={{ marginTop: '0.75rem' }}>
          <strong>En esta página:</strong>{' '}
          <a href="#solicitud-datos">eliminar datos sin cerrar la cuenta</a>
          {' · '}
          <a href="#eliminacion-cuenta">eliminar la cuenta completa</a>
        </p>
      </header>

      <article className="privacy-page__body">
        <section id="solicitud-datos">
          <h2>1. Eliminar algunos o todos tus datos sin cerrar la cuenta</h2>
          <p>
            Puedes solicitar que se <strong>supriman o anonimicen datos personales concretos</strong> (por
            ejemplo una imagen, un comentario o categorías de datos) o, cuando sea técnicamente y jurídicamente
            posible, <strong>todo tu dato personal</strong>, <strong>manteniendo la cuenta</strong> para seguir
            accediendo al servicio con un perfil mínimo.
          </p>
          <p>
            <strong>Pasos:</strong>
          </p>
          <ol>
            <li>
              Escribe a{' '}
              <a href="mailto:vecindario@decamino.es?subject=Solicitud%20eliminaci%C3%B3n%20de%20datos%20Vecindario">
                vecindario@decamino.es
              </a>{' '}
              desde tu <strong>correo asociado a la cuenta</strong> si es posible, o indica datos que permitan
              identificarte (nombre, comunidad, portal/piso/puerta si aplica).
            </li>
            <li>
              Indica en el asunto o mensaje:{' '}
              <strong>«Solicitud de eliminación de datos Vecindario»</strong> y describe{' '}
              <strong>qué datos quieres eliminar</strong> (todo lo posible sin cerrar cuenta, o elementos
              concretos: fotos, textos, teléfono, etc.).
            </li>
            <li>
              Te responderemos cuando sea posible y podremos pedir verificación adicional. Si una petición no
              puede cumplirse sin cerrar la cuenta (por ejemplo por vínculos técnicos o obligaciones hacia la
              comunidad), te lo explicaremos y ofreceremos alternativas (incluida la baja de cuenta en el
              apartado 2).
            </li>
          </ol>
          <p>
            <strong>Qué puede eliminarse o anonimizarse (orientativo):</strong> según tu petición y la normativa,
            podrá procederse a borrar o anonimizar datos de perfil opcionales, contenido que hayas generado
            (textos/imágenes en incidencias o solicitudes), tokens de notificación u otros datos que no deban
            conservarse identificables.
          </p>
          <p>
            <strong>Qué puede conservarse:</strong> lo mismo indicado en el{' '}
            <a href="#conservacion">apartado 3</a> (obligaciones legales, backups, anonimización).
          </p>
        </section>

        <section id="eliminacion-cuenta">
          <h2>2. Eliminar la cuenta completa</h2>
          <p>Si quieres cerrar definitivamente tu usuario en Vecindario:</p>
          <ol>
            <li>
              Envía un correo a{' '}
              <a href="mailto:vecindario@decamino.es?subject=Solicitud%20eliminaci%C3%B3n%20cuenta%20Vecindario">
                vecindario@decamino.es
              </a>{' '}
              desde la <strong>dirección asociada a tu cuenta</strong> o con datos que permitan identificarte.
            </li>
            <li>
              Indica claramente: <strong>«Solicitud de eliminación de cuenta Vecindario»</strong>.
            </li>
            <li>
              Tras verificar tu identidad, procederemos a la eliminación de la cuenta y, en la medida posible,
              a la supresión o anonimización de los datos vinculados.
            </li>
          </ol>
          <p>
            <strong>Qué se elimina con la cuenta (orientativo):</strong> perfil, credenciales, y contenido
            identificable asociado a esa cuenta, salvo lo descrito en el{' '}
            <a href="#conservacion">apartado 3</a>.
          </p>
        </section>

        <section id="conservacion">
          <h2>3. Conservación, backups y plazos</h2>
          <p>
            Puede ser necesario <strong>conservar ciertos datos</strong> un tiempo limitado cuando la ley lo
            exija, o en forma <strong>anonimizada</strong> o agregada sin identificarte.
          </p>
          <p>
            Las <strong>copias de seguridad (backups)</strong> pueden conservar datos residuales durante la
            rotación habitual (orientativamente hasta unos <strong>90 días</strong> desde la eliminación
            efectiva en producción). Si los plazos difieren, se indicará en la respuesta a tu solicitud.
          </p>
          <p>
            Tu comunidad o administración pueden tener obligaciones propias; consúltalos si procede.
          </p>
        </section>

        <section>
          <h2>4. Plazo de respuesta</h2>
          <p>
            Habitualmente dentro de <strong>30 días naturales</strong> desde verificar tu identidad, salvo
            complejidad que lo justifique.
          </p>
          <p>
            Más información: <Link to="/privacy">política de privacidad</Link>.
          </p>
        </section>
      </article>

      <footer className="privacy-page__footer">
        <Link to={getSignInPath()} className="privacy-page__footer-link">
          Iniciar sesión
        </Link>
        <span className="privacy-page__footer-sep">·</span>
        <Link to="/privacy" className="privacy-page__footer-link">
          Política de privacidad
        </Link>
      </footer>
    </div>
  )
}
