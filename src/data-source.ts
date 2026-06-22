import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

const dbUrl = process.env.DATABASE_URL || '';
const isNeon = dbUrl.includes('neon.tech');

export default new DataSource({
  type: 'postgres',
  url: dbUrl,
  entities: ['src/**/*.entity.{ts,js}'],
  migrations: ['src/migrations/**/*.{ts,js}'],
  ssl: isNeon ? { rejectUnauthorized: true } : false,
});
