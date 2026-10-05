# Shared Calendar

Anyone can view events. Logged-in users can add events and delete their own. Data is stored in Postgres.

## Run locally
Needs Node 18+ and a Postgres database (e.g. `createdb calendar`, or a free Neon database URL).

    export DATABASE_URL=postgres://localhost/calendar    # or your hosted URL
    cd server && npm install && npm start                # API on :4000
    cd client && npm install && npm run dev              # app on :5173

## Deploy
See render.yaml. On Render: New > Blueprint > pick your repo, then set DATABASE_URL when prompted.
