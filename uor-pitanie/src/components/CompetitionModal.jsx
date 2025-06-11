import React, { useState, useEffect } from 'react';
import './CompetitionModal.scss';
import api from '../api';
import SuccessModal from './SuccessModal';

export default function CompetitionModal({ onClose }) {
  const [students, setStudents] = useState([]);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Здесь храним всех «выбранных» студентов с их поездками
  const [selected, setSelected] = useState([]);

  // Сюда будем накапливать все id поездок, помеченных на удаление
  const [deletedTrips, setDeletedTrips] = useState([]);

  const [showSuccess, setShowSuccess] = useState(false);
  const [errorToast, setErrorToast] = useState('');

  const limit = 10;

  // Проверка корректности дат и отсутствия пересечений
  const hasOverlappingTrips = (trips) => {
    const sorted = trips
      .filter((t) => !t._deleted && t.departureDate && t.returnDate) // эту фильтрацию можно убрать, если уже фильтруешь activeTrips
      .map((t) => ({ start: new Date(t.departureDate), end: new Date(t.returnDate) }))
      .sort((a, b) => a.start - b.start);

    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].end >= sorted[i + 1].start) return true;
    }
    return false;
  };

  const isValidDates = React.useMemo(() => {
    // Если нет студентов — значит все удалены, это тоже валидный случай
    if (selected.length === 0) return true;

    return selected.every((s) => {
      const activeTrips = s.trips.filter((t) => !t._deleted);
      if (activeTrips.length === 0) {
        // Нет активных поездок — это валидно
        return true;
      }
      const datesValid = activeTrips.every(
        (t) =>
          t.departureDate && t.returnDate && new Date(t.returnDate) >= new Date(t.departureDate),
      );
      const noOverlap = !hasOverlappingTrips(activeTrips);
      return datesValid && noOverlap;
    });
  }, [selected]);

  // === Загрузка: список студентов и уже сохранённых поездок ===
  useEffect(() => {
    (async () => {
      try {
        const [studentsRes, tripsRes] = await Promise.all([
          api.get('/users', { params: { search: filter, page, limit } }),
          api.get('/competition-days'),
        ]);
        setStudents(studentsRes.data.students);
        setTotalPages(studentsRes.data.totalPages);

        // Группируем поездки по студентам
        const grouped = {};
        for (const t of tripsRes.data) {
          if (!grouped[t.StudentId]) {
            grouped[t.StudentId] = {
              id: t.StudentId,
              fio: t.FIO,
              groupName: t.Group,
              sport: t.SportType,
              trips: [],
            };
          }
          grouped[t.StudentId].trips.push({
            id: t.Id,
            origDeparture: t.DepartureDate,
            origReturn: t.ReturnDate,
            departureDate: t.DepartureDate,
            returnDate: t.ReturnDate,
            _deleted: false,
          });
        }
        setSelected(Object.values(grouped));
      } catch (err) {
        console.error('Ошибка загрузки данных:', err);
        setErrorToast('Не удалось загрузить данные');
      }
    })();
  }, [filter, page]);

  // === Добавление нового студента (с пустой поездкой) ===
  const addStudent = (stu) => {
    if (selected.some((s) => s.id === stu.Id)) return;
    setSelected((prev) => [
      ...prev,
      {
        id: stu.Id,
        fio: stu.FIO,
        groupName: stu.Group,
        sport: stu.SportType,
        trips: [
          {
            id: undefined,
            origDeparture: '',
            origReturn: '',
            departureDate: '',
            returnDate: '',
            _deleted: false,
          },
        ],
      },
    ]);
  };

  // === Пометка студента и всех его поездок на удаление ===
  const removeStudent = (studentId) => {
    setSelected((prev) => prev.filter((s) => s.id !== studentId));
    setDeletedTrips((prev) => [
      ...prev,
      ...(selected
        .find((s) => s.id === studentId)
        ?.trips.filter((t) => t.id)
        .map((t) => t.id) || []),
    ]);
  };

  // === Добавить ещё одну (новую) поездку у студента ===
  const addTrip = (studentId) => {
    setSelected((prev) =>
      prev.map((s) => {
        if (s.id !== studentId) return s;
        return {
          ...s,
          trips: [
            ...s.trips,
            {
              id: undefined,
              origDeparture: '',
              origReturn: '',
              departureDate: '',
              returnDate: '',
              _deleted: false,
            },
          ],
        };
      }),
    );
  };

  // === Пометка единственной поездки на удаление ===
  const removeTrip = (studentId, tripIdx) => {
    setSelected((prev) => {
      const updated = prev.map((s) => {
        if (s.id !== studentId) return s;

        const trips = [...s.trips];
        const trip = trips[tripIdx];

        if (trip.id) {
          setDeletedTrips((dt) => [...dt, trip.id]);
        }

        trips[tripIdx] = { ...trip, _deleted: true };
        return { ...s, trips };
      });

      // Убираем студентов без поездок (все поездки _deleted)
      return updated.filter((s) => s.trips.some((t) => !t._deleted));
    });
  };

  // === Обновление даты поездки в локальном состоянии ===
  const updateTripDate = (studentId, idx, field, value) => {
    setSelected((prev) =>
      prev.map((s) => {
        if (s.id !== studentId) return s;
        const trips = [...s.trips];
        trips[idx] = { ...trips[idx], [field]: value };
        return { ...s, trips };
      }),
    );
  };

  // === Сохранение: создаём, обновляем и удаляем всё в БД одним нажатием ===
  const handleSubmit = async () => {
    if (!isValidDates) {
      setErrorToast('Неверные даты или есть пересечение поездок');
      return;
    }

    try {
      // 1) Удаляем помеченные поездки
      for (const tripId of deletedTrips) {
        await api.delete(`/competition-days/${tripId}`);
      }

      // 2) Проходим по оставшимся студентам и их поездкам
      for (const s of selected) {
        for (const t of s.trips) {
          // если поездка помечена _deleted, пропускаем
          if (t._deleted) continue;

          if (t.id) {
            // a) существует в БД ⇒ проверяем, изменились ли даты
            if (t.departureDate !== t.origDeparture || t.returnDate !== t.origReturn) {
              await api.put(`/competition-days/${t.id}`, {
                departureDate: t.departureDate,
                returnDate: t.returnDate,
              });
            }
          } else {
            // b) новая поездка ⇒ создаём, если даты заполнены
            if (t.departureDate && t.returnDate) {
              await api.post(`/competition-days`, {
                studentId: s.id,
                departureDate: t.departureDate,
                returnDate: t.returnDate,
              });
            }
          }
        }
      }

      // 3) Очищаем список помеченных на удаление и показываем успех
      setDeletedTrips([]);
      setShowSuccess(true);
    } catch (err) {
      console.error('Ошибка при сохранении:', err);
      setErrorToast(err.response?.data?.error || 'Ошибка при сохранении');
    }
  };

  const handlePageChange = (delta) => {
    setPage((p) => Math.max(1, Math.min(totalPages, p + delta)));
  };

  return (
    <div className="comp-modal-backdrop">
      <div className="comp-modal">
        <h2>Участники соревнований</h2>
        <button className="comp-modal__close" onClick={onClose}>
          ×
        </button>

        {/* Поиск студентов слева */}
        <input
          type="text"
          placeholder="Поиск по ФИО"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
          className="comp-modal__filter"
        />

        <div className="comp-modal__body">
          {/* Левая колонка: все студенты */}
          <div className="comp-modal__list">
            <h3>Все студенты</h3>
            <ul>
              {students.map((stu) => (
                <li key={stu.Id}>
                  <span>
                    {stu.FIO} ({stu.Group}, {stu.SportType})
                  </span>
                  <button onClick={() => addStudent(stu)}>+</button>
                </li>
              ))}
            </ul>
            <div className="comp-modal__pagination">
              <button disabled={page <= 1} onClick={() => handlePageChange(-1)}>
                ← Назад
              </button>
              <span>
                Стр. {page} из {totalPages}
              </span>
              <button disabled={page >= totalPages} onClick={() => handlePageChange(1)}>
                Вперед →
              </button>
            </div>
          </div>

          {/* Правая колонка: участники и их поездки */}
          <div className="comp-modal__selected">
            <h3>Участники</h3>
            <ul>
              {selected.map((s) => (
                <li key={s.id}>
                  <div className="comp-modal__sel-info">
                    {/* При клике крестик помечает все поездки студента и убирает его */}
                    <button onClick={() => removeStudent(s.id)}>×</button>
                    <span>
                      {s.fio} ({s.groupName})
                    </span>
                  </div>

                  {s.trips.map((t, idx) =>
                    t._deleted ? null : (
                      <div className="comp-modal__dates" key={t.id ?? idx}>
                        <label>
                          С:
                          <input
                            type="date"
                            value={t.departureDate}
                            onChange={(e) =>
                              updateTripDate(s.id, idx, 'departureDate', e.target.value)
                            }
                          />
                        </label>
                        <label>
                          По:
                          <input
                            type="date"
                            value={t.returnDate}
                            onChange={(e) =>
                              updateTripDate(s.id, idx, 'returnDate', e.target.value)
                            }
                          />
                        </label>
                        <button onClick={() => removeTrip(s.id, idx)}>Удалить</button>
                      </div>
                    ),
                  )}

                  <button className="comp-modal__add-trip" onClick={() => addTrip(s.id)}>
                    + Добавить поездку
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {errorToast && (
          <div className="comp-modal__toast">
            <span>{errorToast}</span>
            <button onClick={() => setErrorToast('')}>×</button>
          </div>
        )}

        <div className="comp-modal__actions">
          <button className="btn10 btn10-secondary" onClick={onClose}>
            Отменить
          </button>
          <button className="btn10 btn10-primary" onClick={handleSubmit} disabled={!isValidDates}>
            Сохранить
          </button>
        </div>

        {showSuccess && (
          <SuccessModal
            message="Данные успешно сохранены"
            onClose={() => {
              setShowSuccess(false);
              onClose();
            }}
          />
        )}
      </div>
    </div>
  );
}
