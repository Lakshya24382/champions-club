if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is missing in .env');

export const config = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  tz: process.env.CLUB_TZ || 'Asia/Kolkata',
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
};

// Club business rules live in ONE place so they're easy to change.
export const rules = {
  openTime: '06:00',
  closeTime: '23:00',
  slotStepMin: 30,        // a new slot opens every 30 minutes
  sessionMin: 60,         // each session lasts an hour
  maxBookingsPerDay: 2,   // per member
  social: { dow: 5, from: '18:00', to: '22:00' }, // Friday (0 = Sunday) evening
};
