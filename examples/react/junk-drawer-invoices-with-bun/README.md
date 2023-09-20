# Junk Drawer Invoices w/ Tanstack & Bun

## React + Tanstack router|loaders|actions + Typescript + Bun + Prisma + Clerk

Preheat the oven by making sure you have bun installed ![Bun Logo](image.png). You can see installation instructions [here](https://bun.sh)

Once you have bun installed run `bun install`

Next we need to setup prisma. Since we already have a prisma setup, you can run `bunx prisma db push` to set our database schema.

Now we can run `bunx prisma generate` to generate the PrismaClient for developement.

Next, because I'm not quite sure a less pain free way to do this, add `"type": "module",` to your package.json.

With that set, run `bunx prisma db seed`. Now we have seed data in our database 🎉

Now remove the `"type": "module",` from your package.json. We needed to add it for our seed command because esm craziness

Lastly, if you want to use Clerk, you need to create an account and application at [clerk.dev](https://clerk.dev)

Then you will need to get your clerk_publishable_key value from your dashboard and add it to this environment variable `VITE_REACT_APP_CLERK_PUBLISHABLE_KEY` for frontend use.

And now you can run `bun run dev` which will start our server and our client.

🎈 Enjoy 🎈

## Notes

_**The example is still lacking a few types on axios request**_

If you make updates to the server you may have to stop it and restart it. 

You could investigate moving the server over completely to use `Bun.server` or optimize it a bit more if you want. 