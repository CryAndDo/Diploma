import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import './NewPasswordPage.scss';

export default function NewPasswordPage() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const token = params.get('token');
  const [formData, setFormData] = useState({ password: '', confirm: '' });
  const [validation, setValidation] = useState({
    length: false,
    upper: false,
    lower: false,
    digit: false,
    special: false,
    match: false,
  });
  const [show, setShow] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const rules = {
    length: (pwd) => pwd.length >= 8,
    upper: (pwd) => /[A-Z]/.test(pwd),
    lower: (pwd) => /[a-z]/.test(pwd),
    digit: (pwd) => /\d/.test(pwd),
    special: (pwd) => /[!@#$%^&*]/.test(pwd),
  };

  // Если в URL нет ключа/почты — редиректим обратно
  useEffect(() => {
    if (!token) {
      navigate('/forgot-password', { replace: true });
    }
  }, [token, navigate]);

  const validate = (pwd, conf) => {
    const v = {
      length: rules.length(pwd),
      upper: rules.upper(pwd),
      lower: rules.lower(pwd),
      digit: rules.digit(pwd),
      special: rules.special(pwd),
      match: pwd !== '' && pwd === conf,
    };
    setValidation(v);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const data = { ...formData, [name]: value };
    setFormData(data);
    validate(data.password, data.confirm);
    setError('');
  };

  const isValid = Object.values(validation).every(Boolean);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) return;
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword: formData.password,
          token,
        }),
      });
      if (!res.ok) throw new Error();
      setSubmitted(true);
    } catch {
      setError('Не удалось сменить пароль. Попробуйте ещё раз.');
    }
  };

  if (submitted) {
    return (
      <div className="reset-container">
        <Header />
        <main className="reset-main1">
          <div className="confirmation">
            <p>Пароль успешно изменён.</p>
            <button onClick={() => navigate('/login')}>Вернуться к входу</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="reset-container">
      <Header />
      <main className="reset-main1">
        <h1 className="title1">Введите новый пароль</h1>
        <div className="content-columns1">
          <form className="reset-form1" onSubmit={handleSubmit}>
            <div className="form-group3">
              <label htmlFor="password">Новый пароль</label>
              <input
                id="password"
                name="password"
                type={show ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group3">
              <label htmlFor="confirm">Подтвердите новый пароль</label>
              <input
                id="confirm"
                name="confirm"
                type={show ? 'text' : 'password'}
                value={formData.confirm}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group3 checkbox-group3">
              <label>
                <input type="checkbox" checked={show} onChange={() => setShow((v) => !v)} />{' '}
                Показать пароль
              </label>
            </div>

            {error && <div className="error-msg">{error}</div>}

            <button
              type="submit"
              className="btn-submit5"
              disabled={!isValid}
              style={{ opacity: isValid ? 1 : 0.5 }}>
              Поменять пароль
            </button>
          </form>

          <aside className="instructions1">
            <p>Пароль должен содержать:</p>
            <ul>
              <li className={validation.length ? 'valid' : ''}>минимум 8 символов</li>
              <li className={validation.upper ? 'valid' : ''}>
                хотя бы одну заглавную букву (A–Z)
              </li>
              <li className={validation.lower ? 'valid' : ''}>хотя бы одну строчную букву (a–z)</li>
              <li className={validation.digit ? 'valid' : ''}>хотя бы одну цифру (0–9)</li>
              <li className={validation.special ? 'valid' : ''}>
                хотя бы один спецсимвол (!@#$%^&*)
              </li>
            </ul>
          </aside>
        </div>
      </main>
    </div>
  );
}
