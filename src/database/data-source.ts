import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';

// DataSource standalone para el CLI de TypeORM (migration:generate/run/revert).
// Se ejecuta contra el build compilado (dist/), no contra src/ directamente,
// porque el runner ts-node/esm de typeorm no es compatible con el setup
// ESM + NodeNext + decoradores de este proyecto (mismo motivo por el que
// `seed` corre sobre dist/seed.js en vez de con tsx). Ver scripts de
// package.json: cada comando de migración corre `npm run build` primero.
// Un solo export de DataSource: el CLI de typeorm falla si detecta más de
// una instancia exportada desde este archivo (por eso no hay export nombrado
// además del default).
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/database/migrations/*.js'],
  synchronize: false,
});
