// controllers/authController.js
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { sql, dbConfig } = require('../db');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');

// Настройка транспортера для отправки писем
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const roleTableMap = {
  student:     'UorPitanie.Students',
  responsible: 'UorPitanie.ResponsibleForNutrition'
};

// Функция генерации 6-значного кода
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

exports.register = async (req, res) => {
  const { fio, key, sport, group, email, password, emailCode } = req.body;
  try {
    const pool = await sql.connect(dbConfig);

    if (!emailCode) {
      return res.status(400).json({ error: 'Код подтверждения email обязателен' });
    }

    // Проверяем код email
    const codeCheck = await pool.request()
      .input('email', sql.NVarChar(200), email)
      .input('code', sql.VarChar(6), emailCode)
      .query(`
        SELECT Expires
        FROM UorPitanie.EmailVerifications
        WHERE Email = @email AND Code = @code
      `);

    if (!codeCheck.recordset.length) {
      return res.status(400).json({ error: 'Неверный код подтверждения' });
    }

    const codeData = codeCheck.recordset[0];
    if (new Date() > codeData.Expires) {
      return res.status(400).json({ error: 'Срок действия кода истек' });
    }

    // Нормализация строки
    const normalize = str => str.trim().toLowerCase().replace(/\s+/g, ' ');

    // 1) Проверяем карту
    const gate = await pool.request()
      .input('HipNumber', sql.VarChar(50), key)
      .query(`
        SELECT FIO, [Group]
        FROM Cards
        WHERE HipNumber = @HipNumber AND IsActive = 1
      `);

    if (!gate.recordset.length) {
      return res.status(400).json({ error: 'Карта не найдена или неактивна' });
    }
    const card = gate.recordset[0];

    // 2) Сверяем ФИО и группу
    if (normalize(card.FIO) !== normalize(fio)) {
      return res.status(400).json({ error: 'ФИО не совпадает' });
    }
    if (normalize(card.Group) !== normalize(group)) {
      return res.status(400).json({ error: 'Группа не совпадает' });
    }

    // 3) Проверяем, что пользователь ещё не зарегистрирован
    const exists = await pool.request()
      .input('email', sql.NVarChar(200), email)
      .input('HipNumber', sql.VarChar(50), key)
      .query(`
        SELECT Id
        FROM UorPitanie.Students
        WHERE Email = @email OR HipNumber = @HipNumber
      `);

    if (exists.recordset.length) {
      return res.status(400).json({ error: 'Email или карта уже используется' });
    }

    // 4) Хешируем пароль и создаём запись
    const hash = await bcrypt.hash(password, 10);
    await pool.request()
      .input('FIO', sql.NVarChar(200), fio)
      .input('email', sql.NVarChar(200), email)
      .input('password', sql.NVarChar(200), hash)
      .input('HipNumber', sql.VarChar(50), key)
      .input('sport', sql.NVarChar(100), sport)
      .input('group', sql.NVarChar(100), group)
      .query(`
        INSERT INTO UorPitanie.Students
          (FIO, Email, PasswordHash, HipNumber, SportType, [Group])
        VALUES
          (@FIO, @email, @password, @HipNumber, @sport, @group)
      `);

    // Обнуляем код подтверждения, чтобы не использовать повторно
    await pool.request()
      .input('email', sql.NVarChar(200), email)
      .query(`
        DELETE FROM UorPitanie.EmailVerifications WHERE Email = @email
      `);

    res.status(201).json({ message: 'Регистрация успешна' });
  } catch (err) {
    console.error('Ошибка регистрации:', err);
    res.status(500).json({ error: 'Ошибка при регистрации' });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const pool = await sql.connect(dbConfig);

    // 1) Пробуем найти в Students
    let result = await pool.request()
      .input('email', sql.NVarChar(200), email)
      .query(`
        SELECT
          Id,
          PasswordHash,
          IsExpelled,
          'student' AS Role
        FROM UorPitanie.Students
        WHERE Email = @email
      `);

    let user = result.recordset[0];
    let table = 'Students';
    let role = 'student';

    // 2) Если не найдено — ищем в ResponsibleForNutrition
    if (!user) {
      result = await pool.request()
        .input('email', sql.NVarChar(200), email)
        .query(`
          SELECT
            HipNumber AS Id,
            PasswordHash,
            CAST(0 AS BIT) AS IsExpelled,
            'responsible' AS Role
          FROM UorPitanie.ResponsibleForNutrition
          WHERE Email = @email
        `);

      user = result.recordset[0];
      table = 'ResponsibleForNutrition';
      role = 'responsible';
    }

    // 3) Если пользователь не найден
    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // 4) Блокируем отчисленных студентов
    if (user.IsExpelled) {
      return res.status(403).json({ error: 'Вы отчислены и не можете войти в систему' });
    }

    console.log(`Попытка входа: email=${email}`);

    // 5) Проверяем пароль
    const valid = await bcrypt.compare(password, user.PasswordHash);
    console.log(`Пароль ${valid ? 'верный' : 'неверный'}`);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // 6) Подписываем JWT
    const payload = {
      userId: user.Id,
      userType: role,
      isExpelled: user.IsExpelled
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });

    return res.json({ token });
  } catch (err) {
    console.error('Ошибка входа:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email, key } = req.body;
  console.log('Запрос на сброс пароля:', email, key);
  try {
    const pool = await sql.connect(dbConfig);
    console.log('Соединение с БД установлено');

    // Ищем сначала в Students
    const stu = await pool.request()
      .input('email', sql.NVarChar(200), email)
      .input('key', sql.VarChar(50), key)
      .query(`
        SELECT Id, 'student' AS Role
        FROM UorPitanie.Students
        WHERE Email = @email AND HipNumber = @key
      `);
    console.log('Результат поиска студента:', stu.recordset);

    // Если нет, ищем в ResponsibleForNutrition
    const resp = !stu.recordset.length
      ? await pool.request()
          .input('email', sql.NVarChar(200), email)
          .input('key', sql.VarChar(50), key)
          .query(`
            SELECT HipNumber AS Id, 'responsible' AS Role
            FROM UorPitanie.ResponsibleForNutrition
            WHERE Email = @email AND HipNumber = @key
          `)
      : { recordset: [] };
    console.log('Результат поиска ответственного:', resp.recordset);

    const row = stu.recordset[0] || resp.recordset[0];
    if (!row) {
      console.log('Пользователь не найден');
      return res.status(400).json({ error: 'Пользователь не найден' });
    }

    // Создаём токен и сохраняем
    const token = crypto.randomBytes(20).toString('hex');
    const expires = new Date(Date.now() + 3600000);
    const table = row.Role === 'student' ? 'Students' : 'ResponsibleForNutrition';

    console.log('Обновляем токен в таблице:', table);
    await pool.request()
      .input('token', sql.NVarChar(200), token)
      .input('expires', sql.DateTime, expires)
      .input('email', sql.NVarChar(200), email)
      .query(`
        UPDATE UorPitanie.${table}
        SET
          ResetPasswordToken = @token,
          ResetPasswordExpires = @expires
        WHERE Email = @email
      `);
    console.log('Токен обновлён в БД');

    const link = `${process.env.FRONTEND_URL}/#/reset-password?token=${token}`;
    console.log('Отправляем письмо со ссылкой:', link);
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Восстановление пароля',
      text: `Перейдите по ссылке для сброса пароля:\n\n${link}\n\nСсылка действует 1 час.`
    });
    console.log('Письмо успешно отправлено');

    res.json({ message: 'Письмо с инструкциями отправлено.' });
  } catch (err) {
    console.error('Ошибка в процессе сброса пароля:', err);
    res.status(500).json({ error: 'Не удалось отправить ссылку. Попробуйте ещё раз.' });
  }
};

// Вместо прежнего exports.resetPassword
exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;
  try {
    const pool = await sql.connect(dbConfig);

    // 1) Ищем в Students
    let result = await pool.request()
      .input('token', sql.NVarChar(200), token)
      .query(`
        SELECT Id, ResetPasswordExpires
        FROM UorPitanie.Students
        WHERE ResetPasswordToken = @token
      `);

    let table = 'Students';
    let idField = 'Id';
    let idValue = null;
    let ResetPasswordExpires;

    if (result.recordset.length) {
      ({ Id: idValue, ResetPasswordExpires } = result.recordset[0]);
    } else {
      // 2) Ищем в ResponsibleForNutrition
      result = await pool.request()
        .input('token', sql.NVarChar(200), token)
        .query(`
          SELECT HipNumber AS Id, ResetPasswordExpires
          FROM UorPitanie.ResponsibleForNutrition
          WHERE ResetPasswordToken = @token
        `);
      if (!result.recordset.length) {
        return res.status(400).json({ error: 'Неверная или просроченная ссылка' });
      }
      table = 'ResponsibleForNutrition';
      idField = 'HipNumber';
      ({ Id: idValue, ResetPasswordExpires } = result.recordset[0]);
    }

    // Проверяем срок жизни
    if (new Date() > ResetPasswordExpires) {
      return res.status(400).json({ error: 'Срок действия ссылки истёк' });
    }

    // Хешируем новый пароль
    const hash = await bcrypt.hash(newPassword, 10);

    // Обновляем таблицу
    const reqUpdate = pool.request()
      .input('password', sql.NVarChar(200), hash)
      .input('token', sql.NVarChar(200), token);

    if (table === 'Students') {
      reqUpdate.input('id',  sql.Int, idValue);
    } else {
      reqUpdate.input('id', sql.VarChar(50), idValue);
    }

    await reqUpdate.query(`
      UPDATE UorPitanie.${table}
      SET
        PasswordHash = @password,
        ResetPasswordToken = NULL,
        ResetPasswordExpires = NULL
      WHERE ${idField} = @id
    `);

    res.json({ message: 'Пароль успешно изменён.' });
  } catch (err) {
    console.error('Ошибка при сбросе пароля:', err);
    res.status(500).json({ error: 'Не удалось сменить пароль. Попробуйте ещё раз.' });
  }
};

exports.sendEmailVerificationCode = async (req, res) => {
  const { email } = req.body;
  try {
    const pool = await sql.connect(dbConfig);

    const code = generateVerificationCode();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    // Сохраняем или обновляем код в EmailVerifications
    await pool.request()
      .input('email', sql.NVarChar(200), email)
      .input('code', sql.VarChar(6), code)
      .input('expires', sql.DateTime, expires)
      .query(`
        MERGE UorPitanie.EmailVerifications AS target
        USING (SELECT @email AS Email) AS source
        ON (target.Email = source.Email)
        WHEN MATCHED THEN
          UPDATE SET Code = @code, Expires = @expires
        WHEN NOT MATCHED THEN
          INSERT (Email, Code, Expires) VALUES (@email, @code, @expires);
      `);

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Код подтверждения Email',
      text: `Ваш код подтверждения: ${code}\n\nКод действителен 15 минут.`
    });

    res.json({ message: 'Код подтверждения отправлен на email.' });
  } catch (err) {
    console.error('Ошибка отправки кода подтверждения:', err);
    res.status(500).json({ error: 'Не удалось отправить код подтверждения.' });
  }
};

exports.verifyEmailCode = async (req, res) => {
  const { email, code } = req.body;

  try {
    const pool = await sql.connect(dbConfig);

    // Ищем пользователя и проверяем код и срок действия
    const userResult = await pool.request()
      .input('email', sql.NVarChar(200), email)
      .input('code', sql.VarChar(6), code)
      .query(`
        SELECT EmailVerificationExpires, IsEmailConfirmed
        FROM UorPitanie.Students
        WHERE Email = @email AND EmailVerificationCode = @code
      `);

    if (!userResult.recordset.length) {
      return res.status(400).json({ error: 'Неверный код подтверждения' });
    }

    const { EmailVerificationExpires, IsEmailConfirmed } = userResult.recordset[0];
    if (IsEmailConfirmed) {
      return res.status(400).json({ error: 'Email уже подтверждён' });
    }

    if (new Date() > EmailVerificationExpires) {
      return res.status(400).json({ error: 'Код подтверждения истёк' });
    }

    await pool.request()
      .input('email', sql.NVarChar(200), email)
      .query(`
        UPDATE UorPitanie.Students
        SET IsEmailConfirmed = 1, EmailVerificationCode = NULL, EmailVerificationExpires = NULL
        WHERE Email = @email
      `);

    res.json({ message: 'Email успешно подтверждён.' });
  } catch (err) {
    console.error('Ошибка подтверждения email:', err);
    res.status(500).json({ error: 'Не удалось подтвердить email' });
  }
};
