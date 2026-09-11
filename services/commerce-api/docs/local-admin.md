# Local dummy admin

Each machine has its own users when DATABASE_URL points to localhost. Run the seed
on each machine to create a dummy admin in that machine's database.

From `services/commerce-api`, with the local `.env` configured:

```sh
npm run prisma:deploy
npm run prisma:seed
```

The seed requires `NODE_ENV=development` or `NODE_ENV=test`. Its default credentials are:

- Email: `admin@example.test`
- Password: `DemoAdmin123!`

Use `POST /api/v1/auth/login` in Swagger (`http://localhost:3000/api/docs`)
with these credentials, then use the returned access token to authorize requests.

Override the defaults with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in your
local `.env` before the first run. Passwords are hashed using the same bcrypt
utility as registration. These default credentials are for local development only.

Rerunning the seed preserves an existing active admin, including its password.
It refuses to promote an existing customer or reactivate an inactive account.
Changing the seed password after creation does not reset the existing password.
Seeding does not copy other users from another machine.
