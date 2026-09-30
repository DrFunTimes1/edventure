import { neon } from '@neondatabase/serverless';
const db = neon(process.env.DB_URL);
export default db;