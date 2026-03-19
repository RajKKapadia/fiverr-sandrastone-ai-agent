import { defineConfig } from 'drizzle-kit';
import {config} from 'dotenv';

config();

export default defineConfig({
    out: './drizzle/migrations',
    schema: './drizzle/schema.ts',
    dialect: 'postgresql',
    strict: true,
    verbose: true,
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});
