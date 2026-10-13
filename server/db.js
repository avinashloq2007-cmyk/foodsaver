import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import mysql from 'mysql2/promise';
import { config } from './config.js';

// Every operation, including demo mode, uses a relational database.
// The queue makes SQLite transactions exclusive on the shared connection.
export class Database {
  constructor(options = {}) {
    this.driver = options.driver || config.driver;
    this.tail = Promise.resolve();
    if (this.driver === 'sqlite') {
      const path = options.path || config.sqlitePath;
      if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true});
      this.raw = new DatabaseSync(path);
      this.raw.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    } else {
      const dbUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
      const isRemote = Boolean(dbUrl) || (process.env.MYSQL_HOST && process.env.MYSQL_HOST !== '127.0.0.1' && process.env.MYSQL_HOST !== 'localhost');
      const ssl = process.env.MYSQL_SSL === 'false' ? undefined : (process.env.MYSQL_SSL === 'true' || isRemote ? { rejectUnauthorized: false } : undefined);
      if (dbUrl) {
        this.pool = mysql.createPool({ uri: dbUrl, connectionLimit: 10, supportBigNumbers: true, bigNumberStrings: false, multipleStatements: false, ssl });
      } else {
        this.pool = mysql.createPool({
          host: process.env.MYSQL_HOST || '127.0.0.1',
          port: Number(process.env.MYSQL_PORT || 3306),
          database: process.env.MYSQL_DATABASE || 'foodsaver',
          user: process.env.MYSQL_USER || 'foodsaver',
          password: process.env.MYSQL_PASSWORD,
          connectionLimit: 10,
          supportBigNumbers: true,
          bigNumberStrings: false,
          multipleStatements: false,
          ssl
        });
      }
    }

  }
  async exclusive(fn) {
    const previous = this.tail;
    let release;
    this.tail = new Promise(resolve => {release=resolve;});
    await previous;
    try { return await fn(); } finally {release();}
  }
  executor(connection) {
    if (this.driver === 'mysql') return {query:async(sql,params=[]) => (await connection.execute(sql, params))[0]};
    return {query:async(sql,params=[]) => {
      const stmt=this.raw.prepare(sql);
      return /^\s*(SELECT|WITH|PRAGMA)/i.test(sql) ? stmt.all(...params) : stmt.run(...params);
    }};
  }
  query(sql,params=[]) {
    if (this.driver === 'mysql') return this.executor(this.pool).query(sql,params);
    return this.exclusive(() => this.executor().query(sql,params));
  }
  async transaction(fn) {
    if (this.driver === 'mysql') {
      const c=await this.pool.getConnection();
      try {await c.beginTransaction(); const value=await fn(this.executor(c)); await c.commit(); return value;}
      catch(error){await c.rollback(); throw error;} finally {c.release();}
    }
    return this.exclusive(async() => {
      this.raw.exec('BEGIN IMMEDIATE');
      try {const value=await fn(this.executor()); this.raw.exec('COMMIT'); return value;}
      catch(error){this.raw.exec('ROLLBACK'); throw error;}
    });
  }
  lock(sql) {return this.driver === 'mysql' ? `${sql} FOR UPDATE` : sql;}
  async schema(sql) {
    if(this.driver==='sqlite') return this.raw.exec(sql);
    for(const statement of sql.split(';').map(x=>x.trim()).filter(Boolean)) await this.pool.query(statement);
  }
  async close(){if(this.pool) await this.pool.end(); else this.raw.close();}
}
