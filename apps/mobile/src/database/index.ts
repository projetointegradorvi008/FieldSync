import * as SQLite from 'expo-sqlite';
import { CREATE_TABLES_SQL } from './schema';

const DATABASE_NAME = 'fieldsync.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// CREATE_TABLES_SQL só contém DDL fixo (sem input do usuário), então
// execAsync é seguro aqui — ver aviso de SQL injection na doc do expo-sqlite
// para queries com dados variáveis (usar prepareAsync/executeAsync nesses casos).
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync(CREATE_TABLES_SQL);
      return db;
    });
  }
  return dbPromise;
}
