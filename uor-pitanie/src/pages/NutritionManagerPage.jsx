// NutritionManagerPage.jsx
import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import './NutritionManagerPage.scss';
import api from '../api';
import CompetitionModal from '../components/CompetitionModal';
export default function NutritionManagerPage() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(null);
  const [stats, setStats] = useState({ breakfast: 0, lunch: 0, snack: 0, dinner: 0 });
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [finalizedDates, setFinalizedDates] = useState([]);
  const [compError, setCompError] = useState('');

  // Загрузка списка зафиксированных дат
  useEffect(() => {
    api
      .get('/reports/finalized-dates')
      .then((res) => {
        const validDates = res.data
          .filter((date) => !isNaN(new Date(date).getTime()))
          .map((date) => new Date(date).toISOString().split('T')[0]);
        setFinalizedDates(validDates);
      })
      .catch((err) => console.error('Ошибка загрузки зафиксированных дат', err));
  }, []);

  // После выбора конкретной даты — грузим статистику
  useEffect(() => {
    if (!selectedDate) return;
    fetchDailyStats();
  }, [selectedDate]);

  useEffect(() => {
    setSelectedDate(null);
    setStats({ breakfast: 0, lunch: 0, snack: 0, dinner: 0 });
  }, [currentMonth, currentYear]);

  const isFinalized = (day) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(
      day,
    ).padStart(2, '0')}`;
    return finalizedDates.includes(dateStr);
  };

  // Строка-датa для ежедневного запроса
  const formattedDate = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(
        2,
        '0',
      )}-${String(selectedDate.getDate()).padStart(2, '0')}`
    : null;

  // Строка-датa для месячного (YYYY-MM)
  const formattedMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const monthNames = [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ];

  const getDaysInMonth = (m, y) => new Date(y, m + 1, 0).getDate();

  const generateCalendar = () => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay() || 7;
    const totalDays = getDaysInMonth(currentMonth, currentYear);
    const weeks = [];
    let day = 1 - (firstDay - 1);

    for (let w = 0; w < 6; w++) {
      const week = [];
      for (let d = 1; d <= 7; d++, day++) {
        week.push(day > 0 && day <= totalDays ? day : null);
      }
      weeks.push(week);
    }
    return weeks;
  };

  const handleMonthChange = (delta) => {
    let m = currentMonth + delta;
    let y = currentYear;
    if (m < 0) {
      m = 11;
      y--;
    }
    if (m > 11) {
      m = 0;
      y++;
    }
    setCurrentMonth(m);
    setCurrentYear(y);
  };

  // Ежедневная статистика
  const fetchDailyStats = async () => {
    setLoadingDaily(true);
    try {
      const { data } = await api.get('/reports/daily-count', {
        params: { date: formattedDate },
      });
      setStats({
        breakfast: data.breakfastCount ?? 0,
        lunch: data.lunchCount ?? 0,
        snack: data.snackCount ?? 0,
        dinner: data.dinnerCount ?? 0,
      });
    } catch (err) {
      console.error(err);
      alert('Не удалось получить ежедневные данные');
    } finally {
      setLoadingDaily(false);
    }
  };

  // Скачивание ежедневного отчёта
  const downloadDailyReport = async () => {
    if (!formattedDate) return;
    setLoadingDaily(true);
    try {
      const response = await api.get('/reports/daily', {
        params: { date: formattedDate },
        responseType: 'blob',
      });
      downloadBlobAsExcel(response.data, `DailyReport_${formattedDate}.xlsx`);
    } catch (err) {
      console.error(err);
      alert('Не удалось скачать ежедневный отчёт');
    } finally {
      setLoadingDaily(false);
    }
  };

  // Скачивание месячного отчёта
  const downloadMonthlyReport = async () => {
    setLoadingMonthly(true);
    try {
      const response = await api.get('/reports/monthly', {
        params: { month: formattedMonth },
        responseType: 'blob',
      });
      downloadBlobAsExcel(response.data, `MonthlyReport_${formattedMonth}.xlsx`);
    } catch (err) {
      console.error(err);
      alert('Не удалось скачать месячный отчёт');
    } finally {
      setLoadingMonthly(false);
    }
  };
  const downloadBlobAsExcel = (blobData, fileName) => {
    const url = window.URL.createObjectURL(new Blob([blobData]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  const [isCompModalOpen, setCompModalOpen] = useState(false);

  const openCompetitionModal = () => setCompModalOpen(true);
  const closeCompetitionModal = () => setCompModalOpen(false);

  const submitCompetitionDays = (competitors) => {
    const token = localStorage.getItem('authToken');
    return api.post(
      '/competition-days',
      { competitors },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  };

  return (
    <div className="nutrition-page">
      <Header />
      <main className="nutrition-main">
        <h1 className="nutrition-title">Ответственный за питание</h1>
        <button className="btn btn-secondary btn-compact" onClick={openCompetitionModal}>
          Выбрать студентов для соревнований
        </button>
        {compError && (
          <div className="comp-error-banner">
            <span className="comp-error-banner__icon">⚠️</span>
            <span className="comp-error-banner__text">{compError}</span>
            <button className="comp-error-banner__close" onClick={() => setCompError('')}>
              ×
            </button>
          </div>
        )}

        {isCompModalOpen && (
          <CompetitionModal onClose={closeCompetitionModal} onSubmit={submitCompetitionDays} />
        )}

        <div className="nutrition-card">
          <div className="picker-section">
            <div className="date-wrapper">
              <label className="date-label">Студенты заполнили форму за</label>
              <input
                className="date-input"
                type="text"
                readOnly
                value={
                  selectedDate
                    ? `${String(selectedDate.getDate()).padStart(2, '0')}.${String(
                        selectedDate.getMonth() + 1,
                      ).padStart(2, '0')}.${selectedDate.getFullYear()}`
                    : ''
                }
              />
            </div>
            <div className="month-picker">
              <button type="button" onClick={() => handleMonthChange(-1)}>
                &larr;
              </button>
              <span>
                {monthNames[currentMonth]} {currentYear}
              </span>
              <button type="button" onClick={() => handleMonthChange(1)}>
                &rarr;
              </button>
            </div>
            <div className="days-headers">
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="dates-grid">
              {generateCalendar().map((week, wi) => (
                <div key={wi} className="week-row">
                  {week.map((day, di) => {
                    const isSelected =
                      selectedDate &&
                      selectedDate.getFullYear() === currentYear &&
                      selectedDate.getMonth() === currentMonth &&
                      selectedDate.getDate() === day;
                    return (
                      <div
                        key={di}
                        className={`day-cell 
                          ${!day ? 'empty' : ''} 
                          ${isSelected ? 'selected' : ''} 
                          ${day && !isFinalized(day) ? 'disabled' : ''}`}
                        onClick={() => {
                          if (day && isFinalized(day)) {
                            setSelectedDate(new Date(currentYear, currentMonth, day));
                          }
                        }}>
                        {day || ''}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="stats-section">
            <p>
              Кол-во завтракающих студентов: <strong>{stats.breakfast}</strong>
            </p>
            <p>
              Кол-во обедающих студентов: <strong>{stats.lunch}</strong>
            </p>
            <p>
              Кол-во полдничающих студентов: <strong>{stats.snack}</strong>
            </p>
            <p>
              Кол-во ужинающих студентов: <strong>{stats.dinner}</strong>
            </p>
          </div>

          <div className="actions-section">
            <div className="btn-row">
              <button
                className="btn btn-secondary"
                onClick={downloadDailyReport}
                disabled={!formattedDate || loadingDaily}>
                {loadingDaily ? 'Загрузка...' : 'Получить ежедневный отчёт'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={downloadMonthlyReport}
                disabled={loadingMonthly}>
                {loadingMonthly ? 'Загрузка...' : 'Формирование ежемесячного отчёта'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
