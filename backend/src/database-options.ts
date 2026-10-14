import { Options } from 'sequelize';

export function postgresOptions(urlString = process.env.DATABASE_URL || 'postgresql://shortlink:local-dev-password@localhost:5432/shortlink'): Options {
  const url = new URL(urlString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use PostgreSQL');
  const ssl = url.searchParams.get('sslmode') === 'require';
  return {
    dialect: 'postgres',
    host: url.hostname,
    port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    logging: false,
    ...(ssl ? { dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } } : {}),
  };
}
