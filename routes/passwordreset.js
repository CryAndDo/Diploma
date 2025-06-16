const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { sql } = require('../db');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

exports.forgotPassword = async (req, res) => {
  const { email, key } = req.body;
  console.log('Received request to reset password:', email, key);
  try {
    const pool = await sql.connect(dbConfig);
    console.log('DB connected successfully.');

    const studentResult = await pool
      .request()
      .input('email', sql.NVarChar(200), email)
      .input('key', sql.VarChar(50), key).query(`
        SELECT Id, 'student' AS Role FROM UorPitanie.Students
        WHERE Email = @email AND HipNumber = @key
      `);

    console.log('Student search result:', studentResult.recordset);

    const responsibleResult = !studentResult.recordset.length
      ? await pool
          .request()
          .input('email', sql.NVarChar(200), email)
          .input('key', sql.VarChar(50), key).query(`
          SELECT HipNumber, 'responsible' AS Role FROM UorPitanie.ResponsibleForNutrition
          WHERE Email = @email AND HipNumber = @key
        `)
      : { recordset: [] };

    console.log('Responsible search result:', responsibleResult.recordset);

    let user = null;

    if (studentResult.recordset.length) {
      user = studentResult.recordset[0];
    } else if (responsibleResult.recordset.length) {
      user = responsibleResult.recordset[0];
    }

    if (!user) {
      console.log('User not found');
      return res.status(400).json({ error: 'Пользователь с такими данными не найден' });
    }

    const token = crypto.randomBytes(20).toString('hex');
    const expires = new Date(Date.now() + 3600000);

    const table = user.Role === 'student' ? 'Students' : 'ResponsibleForNutrition';

    console.log('Updating token in DB for table:', table);

    await pool
      .request()
      .input('token', sql.NVarChar(200), token)
      .input('expires', sql.DateTime, expires)
      .input('email', sql.NVarChar(200), email).query(`
        UPDATE UorPitanie.${table}
        SET ResetPasswordToken = @token,
            ResetPasswordExpires = @expires
        WHERE Email = @email
      `);

    console.log('Token updated in DB successfully.');
    const link = `${process.env.FRONTEND_URL}/#/reset-password?token=${token}`;
    console.log('Sending email with reset link:', link);

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Восстановление пароля',
      text: `Перейдите по ссылке для создания нового пароля:\n\n${link}\n\nСсылка действует 1 час.`,
    });

    console.log('Email sent successfully.');
    res.json({ message: 'Письмо с инструкциями отправлено.' });
  } catch (err) {
    console.error('Error occurred during the password reset process:', err);
    res.status(500).json({ error: 'Ошибка при отправке письма. Попробуйте ещё раз.' });
  }
};
