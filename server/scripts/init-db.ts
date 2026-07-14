import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const initDb = async () => {
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL is not defined in .env');
    process.exit(1);
  }

  // Connect to default 'postgres' database to create the new DB
  // (replace 'timepick' with 'postgres' in DATABASE_URL to connect to system catalog)
  const client = new Client({
    connectionString: process.env.DATABASE_URL.replace('timepick', 'postgres'),
  });

  try {
    await client.connect();

    // Check if db exists
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'timepick'");
    if (res.rowCount === 0) {
        console.log('Creating database timepick...');
        await client.query('CREATE DATABASE timepick');
        console.log('Database timepick created.');
    } else {
        console.log('Database timepick already exists.');
    }
    await client.end();

    // Connect to the new database to create the base users table
    const dbClient = new Client({
      connectionString: process.env.DATABASE_URL,
    });

    await dbClient.connect();

    // Enable UUID extension
    await dbClient.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('UUID extension enabled.');

    // Check if users table exists
    const tableCheck = await dbClient.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'users'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('Creating base users table...');
      await dbClient.query(`
        CREATE TABLE users (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          email TEXT UNIQUE NOT NULL,
          phone TEXT,
          first_name TEXT,
          last_name TEXT,
          profession VARCHAR(150),
          informations TEXT,
          role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      console.log('Base users table created.');

      // Create the update_updated_at_column function
      await dbClient.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ language 'plpgsql'
      `);

      // Add trigger for users table
      await dbClient.query(`
        CREATE TRIGGER update_users_updated_at
          BEFORE UPDATE ON users
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column()
      `);
      console.log('Users table trigger created.');
    } else {
      console.log('Users table already exists.');
    }

    await dbClient.end();
    console.log('\n✅ Database initialization complete!');
    console.log('Next step: Run migrations with `npm run migrate`');

  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  }
};

initDb();
