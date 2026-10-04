// FIX: warn loudly about the fallback secret in ANY non-production environment,
// not just production. A staging server without JWT_SECRET set would previously
// run with the well-known default, making all issued tokens forgeable.
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is missing in .env');
  } else {
    console.warn(
      '[config] WARNING: JWT_SECRET is not set. ' +
      'Using the insecure dev fallback. Set JWT_SECRET in your .env file.',
    );
  }
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-this-secret',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  tz: process.env.CLUB_TZ || 'Asia/Kolkata',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
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
