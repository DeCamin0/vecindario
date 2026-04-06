import { APP_VERSION } from '../config/version'
import './DeveloperCredit.css'

export default function DeveloperCredit() {
  return (
    <div className="developer-credit" role="contentinfo">
      <span className="developer-credit-label">Powered by</span>
      <img
        src={`${import.meta.env.BASE_URL}DeCamino-04.png`}
        alt="DeCamino"
        className="developer-credit-logo"
      />
      <span className="developer-credit-version">v{APP_VERSION}</span>
    </div>
  )
}
