import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Грешка при свързване с базата данни:', err.stack);
  } else {
    console.log('Успешно свързване с PostgreSQL база данни.');
    release();
  }
});

export const query = (text, params) => pool.query(text, params);

export default pool;
