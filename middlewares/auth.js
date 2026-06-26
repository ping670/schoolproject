import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_12345';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Неоторизиран достъп. Липсва токен.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Невалиден или изтекъл токен.' });
    }

    req.user = user;
    next();
  });
};

export const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Потребителят не е разпознат.' });
    }

    if (req.user.role !== role) {
      return res.status(403).json({ error: `Достъпът е отказан. Тази операция изисква роля: ${role}` });
    }

    next();
  };
};
