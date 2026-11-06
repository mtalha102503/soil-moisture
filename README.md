# Soil Moisture Chatbot (Frontend)

A chatbot web app for a university group project. It answers natural-language
questions about soil moisture, temperature, humidity and rainfall for
**Faisalabad, Multan and Lahore**, using hourly ERA5-Land data (with ERA5
precipitation) from 2020 to 2024, stored in Supabase. Every answer is computed
live from the stored data - nothing is guessed.

Built with **Next.js (App Router) + TypeScript + Tailwind CSS**, structured
for one-click deployment on **Vercel**.

## How it works

- The chat page (`app/page.tsx`) sends the question to a server-side API
  route (`app/api/chat/route.ts`).
- The route parses the question (`lib/parser.ts`): city, date, optional
  time, variable (soil moisture at 0-7 / 7-28 / 28-100 / 100-255 cm depth,
  temperature, humidity, precipitation) and question type (hourly value,
  daily average / maximum / minimum, daily rain total, monthly average,
  city comparison, irrigation advice, dataset info).
- The engine (`lib/engine.ts`) then runs a **targeted** query against the
  Supabase table `soil_moisture_cleaned` - one row for an hourly value, 24
  rows for a day, at most 744 rows for a month. The full table is never
  downloaded, so answers are fast.
- Irrigation advice uses the surface (0-7 cm) moisture: below 0.150 m3/m3
  the soil is dry (irrigate), 0.150-0.250 is moderate, above 0.250 is wet
  enough.
- All times are **UTC** (the dataset is stored in UTC).

## Run it locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file from the example and fill in the secret key:

   ```bash
   cp .env.example .env.local
   ```

   `.env.local` needs:

   - `SUPABASE_URL` - the project URL (already filled in `.env.example`).
   - `SUPABASE_SECRET_KEY` - the project's **secret key** (`sb_secret_...`),
     from Supabase Dashboard -> Project Settings -> API Keys -> "Secret
     keys". This key stays on the server; it is never sent to the browser.
     Do not commit `.env.local` to git.

3. Start the dev server:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 and ask a question, or tap an example chip.

4. Other commands:

   ```bash
   npm run build       # production build
   npm run test:parser # test the question parser on sample questions
   ```

## Deploy on Vercel

1. Push this folder to a Git repository (or import it in Vercel with the
   root directory set to this folder).
2. In the Vercel dashboard, create a new project and import the repository.
   The framework preset **Next.js** is detected automatically.
3. Add the environment variables under Project -> Settings -> Environment
   Variables:
   - `SUPABASE_URL` = `https://yvsiorgwmqkothidrcbo.supabase.co`
   - `SUPABASE_SECRET_KEY` = your project's `sb_secret_...` key
4. Click **Deploy**. Vercel builds and hosts the app, including the
   `/api/chat` server route.

## Example questions

- "What was the soil moisture at 0-7 cm depth in Lahore on 14 May 2023 at 3 pm?"
- "What was the average soil moisture in Faisalabad on 10 June 2022?"
- "What was the maximum temperature in Multan on 5 August 2021?"
- "How much rain fell in Faisalabad on 18 July 2022?"
- "What was the average soil moisture in Faisalabad in June 2022?"
- "Which city was wetter on 14 May 2023, Lahore or Multan?"
- "Should I irrigate in Multan on 1 January 2020?"
- "How many question-answer pairs are in the dataset?"
