import { Link } from 'react-router-dom';
import './Header.scss';
const logoLeft = new URL('../assets/logo-left.svg', import.meta.url).href;
const logoRight = new URL('../assets/logo-right.png', import.meta.url).href;

export default function Header() {
  return (
    <>
      <header className="auth-header">
        <div className="auth-header__left">
          <Link to="/" className="auth-header__link">
            <img src={logoLeft} alt="UOR logo" className="auth-header__logo-left" />
            <span className="auth-header__title">УОР–ПИТАНИЕ</span>
          </Link>
        </div>
        <img src={logoRight} alt="Olympic torch" className="auth-header__logo-right" />
      </header>
      <hr className="divider" />
    </>
  );
}
