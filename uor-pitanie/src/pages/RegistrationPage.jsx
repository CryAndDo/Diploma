import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import './RegistrationPage.scss';
export default function RegistrationPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fio: '',
    key: '',
    sport: '',
    group: '',
    email: '',
    emailCode: '', // новый код почты
    password: '',
    confirmPassword: '',
    showPassword: false,
  });

  const [passwordValidation, setPasswordValidation] = useState({
    length: false,
    upper: false,
    lower: false,
    digit: false,
    special: false,
  });

  const [emailValidation, setEmailValidation] = useState({
    at: false,
    domain: false,
    noSpacesDots: false,
  });
  const [codeSent, setCodeSent] = useState(false); // флаг, что код отправлен
  const [sendingCode, setSendingCode] = useState(false); // индикатор отправки
  const validatePassword = (password) => {
    setPasswordValidation({
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      digit: /[0-9]/.test(password),
      special: /[!@#$%^&*]/.test(password),
    });
  };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const validateEmail = (email) => {
    setEmailValidation({
      at: email.includes('@'),
      domain: emailRegex.test(email),
      noSpacesDots: !/\s|\.{2,}/.test(email),
    });
  };

  const sendEmailCode = async () => {
    if (!formData.email || !emailValidation.domain) {
      alert('Введите корректный email перед отправкой кода');
      return;
    }
    setSendingCode(true);
    try {
      const response = await fetch('http://localhost:4000/api/auth/send-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email }),
      });
      const data = await response.json();
      if (response.ok) {
        setCodeSent(true);
        alert('Код подтверждения выслан на почту');
      } else {
        alert(data.error || 'Ошибка при отправке кода');
      }
    } catch (error) {
      alert('Ошибка сети при отправке кода');
    } finally {
      setSendingCode(false);
    }
  };
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'password') validatePassword(value);
    if (name === 'email') validateEmail(value);
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch('http://localhost:4000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fio: formData.fio,
          key: formData.key,
          sport: formData.sport,
          group: formData.group,
          email: formData.email,
          emailCode: formData.emailCode,
          password: formData.password,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        console.log('Пользователь успешно зарегистрирован:', data);
        navigate('/login');
      } else {
        console.error('Ошибка при регистрации:', data.error);
        alert(data.error || 'Ошибка при регистрации');
      }
    } catch (error) {
      console.error('Ошибка сети:', error);
      alert('Ошибка сети');
    }
  };

  const { showPassword, ...requiredFields } = formData;
  const allFieldsFilled = Object.values(requiredFields).every((val) => val !== '');
  const isFormValid =
    allFieldsFilled &&
    Object.values(passwordValidation).every(Boolean) &&
    Object.values(emailValidation).every(Boolean) &&
    formData.password === formData.confirmPassword;

  return (
    <div className="register-container">
      <Header />
      <main className="register-main">
        <h1 className="title">Форма регистрации</h1>
        <div className="form-wrapper">
          <form className="register-form" onSubmit={handleSubmit}>
            <div className="form-group2">
              <label htmlFor="fio">ФИО</label>
              <input
                id="fio"
                name="fio"
                type="text"
                value={formData.fio}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group2">
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
            <div className="form-group2">
              <label htmlFor="sport">Вид спорта</label>
              <input
                id="sport"
                name="sport"
                type="text"
                value={formData.sport}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group2">
              <label htmlFor="group">Группа</label>
              <input
                id="group"
                name="group"
                type="text"
                value={formData.group}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group2">
              <label htmlFor="email">Электронная почта</label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
              <button
                type="button"
                className={`send-code-btn ${sendingCode ? 'sending' : ''} ${
                  codeSent ? 'sent' : ''
                }`}
                onClick={sendEmailCode}
                disabled={sendingCode || !formData.email || !emailValidation.domain}>
                {sendingCode ? 'Отправка…' : codeSent ? 'Код отправлен' : 'Выслать код на почту'}
              </button>
            </div>
            <div className="form-group2">
              <label htmlFor="emailCode">Код почты</label>
              <input
                id="emailCode"
                name="emailCode"
                type="text"
                value={formData.emailCode}
                onChange={handleChange}
                required
                placeholder="Введите код из письма"
              />
            </div>
            <div className="form-group2">
              <label htmlFor="password">Пароль</label>
              <input
                id="password"
                name="password"
                type={formData.showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group2">
              <label htmlFor="confirmPassword">Подтвердите пароль</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={formData.showPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group2 checkbox-group2">
              <input
                type="checkbox"
                id="showPassword"
                name="showPassword"
                checked={formData.showPassword}
                onChange={handleChange}
              />
              <label htmlFor="showPassword">Показать пароль</label>
            </div>
            <button
              type="submit"
              className="btn-submit"
              disabled={!isFormValid}
              style={{ opacity: isFormValid ? 1 : 0.5 }}>
              Зарегистрироваться
            </button>
            <div className="login-link">
              <button type="button" onClick={() => navigate('/login')}>
                Уже есть аккаунт?
              </button>
            </div>
          </form>

          <aside className="requirements">
            <section>
              <strong>Почта должна содержать:</strong>
              <ul>
                <li className={emailValidation.at ? 'valid' : ''}>символ @</li>
                <li className={emailValidation.domain ? 'valid' : ''}>
                  корректный домен (например, gmail.com)
                </li>
                <li className={emailValidation.noSpacesDots ? 'valid' : ''}>
                  отсутствие пробелов и двойных точек
                </li>
              </ul>
            </section>
            <section>
              <strong>Пароль должен содержать:</strong>
              <ul>
                <li className={passwordValidation.length ? 'valid' : ''}>минимум 8 символов</li>
                <li className={passwordValidation.upper ? 'valid' : ''}>
                  хотя бы одну заглавную букву (A–Z)
                </li>
                <li className={passwordValidation.lower ? 'valid' : ''}>
                  хотя бы одну строчную букву (a–z)
                </li>
                <li className={passwordValidation.digit ? 'valid' : ''}>
                  хотя бы одну цифру (0–9)
                </li>
                <li className={passwordValidation.special ? 'valid' : ''}>
                  хотя бы один спецсимвол (!@#$%^&*)
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
