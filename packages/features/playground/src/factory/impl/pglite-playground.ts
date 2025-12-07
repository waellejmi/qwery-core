import type { IDataSourceDriver } from '@qwery/extensions-sdk';

import type { PlaygroundDatabase } from '../playground-database';

export class PGlitePlayground implements PlaygroundDatabase {
  getConnectionConfig(): Record<string, unknown> {
    // PGlite runs in the browser, so we return a special config
    // that indicates this is a playground datasource
    return {
      database: 'playground',
    };
  }

  async seed(
    driver: IDataSourceDriver,
    config: Record<string, unknown>,
  ): Promise<void> {
    // Create sample tables with prefilled data
    await driver.query(
      `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      config,
    );

    await driver.query(
      `
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        category VARCHAR(50),
        stock INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      config,
    );

    await driver.query(
      `
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        total DECIMAL(10, 2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      config,
    );

    // Insert sample data - check if data already exists first
    const usersResult = await driver.query(
      'SELECT COUNT(*) as count FROM users',
      config,
    );
    const usersCount =
      (usersResult.rows[0] as { count: number | string })?.count ?? 0;
    const usersCountNum =
      typeof usersCount === 'string' ? parseInt(usersCount, 10) : usersCount;

    if (usersCountNum === 0) {
      await driver.query(
        `
        INSERT INTO users (name, email) VALUES
          ('John Doe', 'john.doe@example.com'),
          ('Jane Smith', 'jane.smith@example.com'),
          ('Bob Johnson', 'bob.johnson@example.com'),
          ('Alice Williams', 'alice.williams@example.com'),
          ('Charlie Brown', 'charlie.brown@example.com')
      `,
        config,
      );
    }

    const productsResult = await driver.query(
      'SELECT COUNT(*) as count FROM products',
      config,
    );
    const productsCount =
      (productsResult.rows[0] as { count: number | string })?.count ?? 0;
    const productsCountNum =
      typeof productsCount === 'string'
        ? parseInt(productsCount, 10)
        : productsCount;

    if (productsCountNum === 0) {
      await driver.query(
        `
        INSERT INTO products (name, price, category, stock) VALUES
          ('Laptop', 999.99, 'Electronics', 15),
          ('Mouse', 29.99, 'Electronics', 50),
          ('Keyboard', 79.99, 'Electronics', 30),
          ('Monitor', 249.99, 'Electronics', 20),
          ('Desk Chair', 199.99, 'Furniture', 10),
          ('Standing Desk', 399.99, 'Furniture', 5),
          ('Notebook', 9.99, 'Stationery', 100),
          ('Pen Set', 19.99, 'Stationery', 75)
      `,
        config,
      );
    }

    const ordersResult = await driver.query(
      'SELECT COUNT(*) as count FROM orders',
      config,
    );
    const ordersCount =
      (ordersResult.rows[0] as { count: number | string })?.count ?? 0;
    const ordersCountNum =
      typeof ordersCount === 'string' ? parseInt(ordersCount, 10) : ordersCount;

    if (ordersCountNum === 0) {
      await driver.query(
        `
        INSERT INTO orders (user_id, total, status) VALUES
          (1, 999.99, 'completed'),
          (1, 29.99, 'completed'),
          (2, 79.99, 'pending'),
          (2, 249.99, 'completed'),
          (3, 199.99, 'completed'),
          (4, 399.99, 'pending'),
          (5, 9.99, 'completed'),
          (5, 19.99, 'completed')
      `,
        config,
      );
    }
  }
}
