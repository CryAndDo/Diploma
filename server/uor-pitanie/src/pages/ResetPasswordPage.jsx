import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import './ResetPasswordPage.scss';

export default function ResetPasswordPage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({ email: '', key: '' });
  const [emailValidation, setEmailValidation] = useState({
    at: false,
    domain: false,
    noSpacesDots: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    setEmailValidation({
      at: email.includes('@'),
      domain: /\.\w{2,}$/.test(email),
      noSpacesDots: !/\s|\.\./.test(email),
      valid: emailRegex.test(email),
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'email') validateEmail(value);
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const isFormValid = Object.values(emailValidation).every(Boolean) && formData.key.trim() !== '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid) return;
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error();
      setSubmitted(true);
    } catch {
      setError('Не удалось отправить ссылку. Попробуйте ещё раз.');
    }
  };

  return (
    <div className="reset-container">
      <Header />
      <main className="reset-main">
        <h1 className="title2">Сбросить Пароль</h1>
        <p className="description">
          Укажите свой адрес электронной почты и электронный ключ, связанный с вашей учетной
          записью. Мы вышлем вам ссылку для создания нового пароля.
        </p>

        <div className="content-columns">
          {!submitted ? (
            <>
              <form className="reset-form" onSubmit={handleSubmit}>
                <div className="form-group3">
                  <label htmlFor="email">Электронная почта</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group3">
                  <label htmlFor="key">Электронный ключ</label>
                  <input
                    id="key"
                    name="key"
                    type="text"
                    value={formData.key}
                    onChange={handleChange}
                    required
                  />
                </div>

                {error && <div className="error-msg">{error}</div>}

                <button
                  type="submit"
                  className="btn-submit5"
                  disabled={!isFormValid}
                  style={{ opacity: isFormValid ? 1 : 0.5 }}>
                  Отправить ссылку на сброс
                </button>
              </form>

              <aside className="instructions">
                <p>Почта должна содержать:</p>
                <ul>
                  <li className={emailValidation.at ? 'valid' : ''}>символ @</li>
                  <li className={emailValidation.domain ? 'valid' : ''}>
                    корректный домен (например, gmail.com)
                  </li>
                  <li className={emailValidation.noSpacesDots ? 'valid' : ''}>
                    отсутствие пробелов и двойных точек
                  </li>
                </ul>
              </aside>
            </>
          ) : (
            <div className="confirmation">
              <p>Ссылка для сброса пароля отправлена на вашу почту.</p>
              <button onClick={() => navigate('/login')}>Вернуться к входу</button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
