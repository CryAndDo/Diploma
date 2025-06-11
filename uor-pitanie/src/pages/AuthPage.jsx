import './AuthPage.scss';
import Header from '../components/Header';
import { useNavigate } from 'react-router-dom';
export default function AuthPage() {
  const navigate = useNavigate();
  return (
    <div className="auth-container">
      <Header />
      <main className="auth-main">
        <h1 className="auth-heading">Войдите или зарегистрируйтесь</h1>
        <button className="btn1 btn1-blue" onClick={() => navigate('/login')}>
          Войти
        </button>
        <button className="btn1 btn1-gray" onClick={() => navigate('/register')}>
          Зарегистрироваться
        </button>
      </main>
    </div>
  );
}
