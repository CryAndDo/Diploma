import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import './MealStudentPage.scss';
import api from '../api';

export default function MealStudentPage() {
  const navigate = useNavigate();
  const today = new Date();

  const [isExpelled, setIsExpelled] = useState(false);
  const [stats, setStats] = useState({ breakfast: 0, lunch: 0, snack: 0, dinner: 0 });

  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedMeals, setSelectedMeals] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/users/me');
        setIsExpelled(!!data.isExpelled);
      } catch (err) {
        console.error('Ошибка при получении профиля:', err);
      }
    })();
  }, []);

  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getDaysInMonth = (m, y) => new Date(y, m + 1, 0).getDate();

  const generateCalendarGrid = () => {
    const first = new Date(currentYear, currentMonth, 1);
    const start = (first.getDay() + 6) % 7; // понедельник = 0
    const total = getDaysInMonth(currentMonth, currentYear);
    const grid = [];
    let dayCnt = 1;

    for (let w = 0; w < 6; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        if ((w === 0 && d < start) || dayCnt > total) {
          week.push(null);
        } else {
          week.push(dayCnt++);
        }
      }
      grid.push(week);
    }
    return grid;
  };

  const wd = today.getDay();
  const tmr = new Date(today);
  tmr.setDate(today.getDate() + 1);
  const tmr2 = new Date(today);
  tmr2.setDate(today.getDate() + 2);

  const isDateSelectable = (day) => {
    if (!day) return false;
    const date = new Date(currentYear, currentMonth, day);
    if (date <= today) return false;

    if (wd === 6) {
      // суббота
      return !(
        date.toDateString() === tmr.toDateString() || date.toDateString() === tmr2.toDateString()
      );
    }
    if (wd === 0) {
      // воскресенье
      return date.toDateString() !== tmr.toDateString();
    }
    return true;
  };

  const handleDateClick = (day) => {
    if (!isDateSelectable(day)) return;
    setSelectedDate(new Date(currentYear, currentMonth, day));
  };

  const handleMealToggle = (meal) => {
    setSelectedMeals((prev) =>
      prev.includes(meal) ? prev.filter((m) => m !== meal) : [...prev, meal],
    );
  };

  useEffect(() => {
    if (!selectedDate) return;
    const load = async () => {
      try {
        const dateStr = formatDate(selectedDate);
        const { data } = await api.get('/meal', { params: { date: dateStr } });
        setSelectedMeals(data.meals || []);
      } catch (err) {
        console.error('Ошибка загрузки данных:', err);
        setSelectedMeals([]);
      }
    };
    load();
  }, [selectedDate]);

  useEffect(() => {
    if (
      selectedDate &&
      (selectedDate.getMonth() !== currentMonth || selectedDate.getFullYear() !== currentYear)
    ) {
      setSelectedDate(null);
      setSelectedMeals([]);
    }
  }, [currentMonth, currentYear]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDate) return;
    try {
      const dateStr = formatDate(selectedDate);
      await api.post('/meal', {
        date: dateStr,
        meals: selectedMeals,
      });
      setIsModalOpen(true);
      setTimeout(() => setIsModalOpen(false), 2000);
      setSelectedDate(null);
      setSelectedMeals([]);
    } catch (err) {
      console.error('Ошибка отправки данных:', err);
    }
  };

  const handleMonthChange = (delta) => {
    let m = currentMonth + delta,
      y = currentYear;
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

  const calendarGrid = generateCalendarGrid();
  const isTodayFriday = today.getDay() === 5;

  return (
    <div className="meal-container">
      <Header />
      <main className="meal-main">
        {isExpelled && (
          <div className="expelled-notice">
            <h2 className="text-red-600">Доступ закрыт</h2>
            <p>Вы были отчислены, функция питания недоступна.</p>
          </div>
        )}

        {!isExpelled && (
          <>
            <h1 className="title">Отметь приём пищи</h1>
            <div className="form-wrapper2">
              <form className="meal-form" onSubmit={handleSubmit}>
                <div className="date-display">
                  <label>Дата</label>
                  <input
                    type="text"
                    value={selectedDate ? selectedDate.toLocaleDateString('ru-RU') : ''}
                    readOnly
                    placeholder="Выберите дату"
                  />
                </div>

                <div className="calendar">
                  <div className="month-picker">
                    <button type="button" onClick={() => handleMonthChange(-1)}>
                      {'<'}
                    </button>
                    <span>
                      {
                        [
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
                        ][currentMonth]
                      }{' '}
                      {currentYear}
                    </span>
                    <button type="button" onClick={() => handleMonthChange(1)}>
                      {'>'}
                    </button>
                  </div>

                  <div className="days-of-week">
                    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
                      <span key={d}>{d}</span>
                    ))}
                  </div>

                  <div className="dates-grid">
                    {calendarGrid.map((week, wi) => (
                      <div className="week-row" key={wi}>
                        {week.map((day, di) => {
                          const selectable = !!day && isDateSelectable(day);
                          const isSel =
                            day &&
                            selectedDate &&
                            day === selectedDate.getDate() &&
                            currentMonth === selectedDate.getMonth() &&
                            currentYear === selectedDate.getFullYear();
                          return (
                            <div
                              key={di}
                              className={`day ${!day ? 'empty' : ''} ${isSel ? 'selected' : ''}`}
                              onClick={() => handleDateClick(day)}
                              style={{
                                pointerEvents: selectable ? 'auto' : 'none',
                                opacity: selectable ? 1 : 0.3,
                              }}>
                              {day || ''}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="meal-buttons">
                  {['breakfast', 'lunch', 'snack', 'dinner'].map((meal) => (
                    <button
                      key={meal}
                      type="button"
                      className={`meal-btn ${selectedMeals.includes(meal) ? 'active' : ''}`}
                      onClick={() => handleMealToggle(meal)}>
                      {
                        {
                          breakfast: 'Завтрак',
                          lunch: 'Обед',
                          snack: 'Полдник',
                          dinner: 'Ужин',
                        }[meal]
                      }
                    </button>
                  ))}
                </div>

                <button type="submit" className="btn-submit" disabled={!selectedDate}>
                  Отправить
                </button>

                {isTodayFriday && (
                  <div className="friday-warning">
                    Не забудьте записаться на субботу, воскресенье и понедельник!
                  </div>
                )}
              </form>

              {isModalOpen && (
                <div className="modal-overlay">
                  <div className="modal-content">
                    <button className="close-btn" onClick={() => setIsModalOpen(false)}>
                      ×
                    </button>
                    <p>Данные отправлены!</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
