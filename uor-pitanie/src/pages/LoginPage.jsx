import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import './LoginPage.scss';
import api from '../api'; // axios с интерцептором для токена

export default function LoginPage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    fio: '',
    password: '',
    showPassword: false,
    saveCredentials: false,
  });
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Загрузка сохранённых кредов
  useEffect(() => {
    const saved = localStorage.getItem('loginCredentials');
    if (saved) {
      const { fio, password } = JSON.parse(saved);
      setFormData((prev) => ({ ...prev, fio, password, saveCredentials: true }));
    }
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setShowError(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/login', {
        fio: formData.fio,
        password: formData.password,
      });
      const data = res.data;

      // Сохраняем токен и тип пользователя
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('userType', data.userType);

      // Сохраняем креды, если чекбокс стоит
      if (formData.saveCredentials) {
        localStorage.setItem(
          'loginCredentials',
          JSON.stringify({ fio: formData.fio, password: formData.password }),
        );
      } else {
        localStorage.removeItem('loginCredentials');
      }

      // Навигация по роли
      if (data.userType === 'ResponsibleForNutrition') {
        navigate('/meal-manager');
      } else {
        navigate('/meal-student');
      }
    } catch (err) {
      console.error('Login error:', err);

      let msg = 'Неверный логин или пароль.';
      if (err.response && err.response.data && err.response.data.message) {
        msg = err.response.data.message;
      }

      setErrorMessage(msg);
      setShowError(true);
    }
  };

  const isFormComplete = formData.fio.trim() !== '' && formData.password.trim() !== '';
  // Кнопка доступна, когда поля заполнены
  const isFormReady = isFormComplete;

  return (
    <div className="login-container">
      <Header />
      <main className="login-main">
        <h1 className="title">Вход</h1>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="fio">ФИО</label>
            <input
              id="fio"
              name="fio"
              type="text"
              value={formData.fio}
              onChange={handleChange}
              required
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              name="password"
              type={formData.showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
            />
            {showError && <div className="error-tooltip">{errorMessage}</div>}
          </div>

          <div className="form-group checkbox-group">
            <div>
              <input
                type="checkbox"
                id="showPassword"
                name="showPassword"
                checked={formData.showPassword}
                onChange={handleChange}
              />
              <label htmlFor="showPassword">Показать пароль</label>
            </div>
            <div>
              <input
                type="checkbox"
                id="saveCredentials"
                name="saveCredentials"
                checked={formData.saveCredentials}
                onChange={handleChange}
              />
              <label htmlFor="saveCredentials">Сохранить данные</label>
            </div>
          </div>

          <button
            type="submit"
            className="btn-login"
            disabled={!isFormReady}
            style={{ opacity: isFormReady ? 1 : 0.5 }}>
            Войти
          </button>

          <div className="info-row">
            <button
              type="button"
              className="forgot-link"
              onClick={() => navigate('/forgot-password')}>
              Забыли пароль?
            </button>
            <span className="time-info">Студенты могут входить с 6:00 до 23:00</span>
          </div>
        </form>
      </main>
    </div>
  );
}
