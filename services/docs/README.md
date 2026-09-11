# add backend setup guide

cd /Users/mwangi/Projects/commerce/services/commerce-api
npx prisma migrate reset

npm install
npm run prisma:migrate --workspace @commerce/commerce-api -- --name initial_setup
npm run seed --workspace @commerce/commerce-api
npm run api:dev