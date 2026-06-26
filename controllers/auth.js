import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_12345';

export const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Всички полета (name, email, password, role) са задължителни.' });
    }

    if (role !== 'student' && role !== 'organiser') {
      return res.status(400).json({ error: "Невалидна роля. Допустимите роли са 'student' и 'organiser'." });
    }

    const existingUser = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Потребител с този имейл вече съществува.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email, passwordHash, role]
    );

    res.status(201).json({
      message: 'Потребителят е регистриран успешно!',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Грешка при регистрация:', error);
    res.status(500).json({ error: 'Грешка в сървъра при опит за регистрация.' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Имейлът и паролата са задължителни.' });
    }

    const userResult = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Невалиден имейл или грешна парола.' });
    }

    const user = userResult.rows[0];

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Невалиден имейл или грешна парола.' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Успешен вход!',
      token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Грешка при вход:', error);
    res.status(500).json({ error: 'Грешка в сървъра при опит за вход.' });
  }
};

export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await query('SELECT id, name, email, role FROM users WHERE id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Потребителят не е намерен.' });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Грешка при извличане на профил:', error);
    res.status(500).json({ error: 'Грешка в сървъра при четене на профил.' });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Името и имейлът са задължителни.' });
    }

    const emailCheck = await query('SELECT * FROM users WHERE email = $1 AND id != $2', [email, userId]);
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Този имейл вече е регистриран от друг потребител.' });
    }

    const result = await query(
      'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING id, name, email, role',
      [name, email, userId]
    );

    res.status(200).json({
      message: 'Профилът е обновен успешно!',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Грешка при обновяване на профил:', error);
    res.status(500).json({ error: 'Грешка в сървъра при редакция на профил.' });
  }
};
