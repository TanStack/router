# Junk Drawer Invoices on the Tanstack

## React + Tanstack router|query + Typescript + Express + Prisma + Clerk

Run `npm install`

Next we need to setup prisma. Since we already have a prisma setup, you can run `npx prisma db push` to set our database schema.

Now we can run `npx prisma generate` to generate the PrismaClient for developement.

With that set, run `npx prisma db seed`. Now we have seed data in our database 🎉

Lastly, if you want to use Clerk, you need to create an account and application at [clerk.dev](https://clerk.dev)

Then you will need to get your clerk_publishable_key value from your dashboard and add it to this environment variable `VITE_REACT_APP_CLERK_PUBLISHABLE_KEY` for frontend use.

And now you can run `npm run dev` which will start our server and our client.

🎈 Enjoy 🎈
