# Hosting FoodSaver: Frontend, Backend & Database Separately

This guide explains how to host **FoodSaver** in a 3-tier decoupled architecture:
1. **Database**: Managed Cloud MySQL (Free on Aiven, TiDB Cloud, or Clever Cloud)
2. **Backend**: Render Web Service (Node.js API + WebSockets)
3. **Frontend**: Render Static Site (or Vercel / Netlify)

---

## Architecture

```text
[ Browser / Users ]
      │
      ├───────────────────────┐
      ▼                       ▼
Frontend (Static Site)    Backend API (Render Web Service)
Render / Vercel           https://foodsaver-api.onrender.com
                              │
                              ▼
                      Cloud MySQL Database
                      (Aiven / TiDB / Clever Cloud)
```

---

## Step 1: Set Up Cloud MySQL Database

FoodSaver requires **MySQL 8.0+**. You can obtain a free cloud MySQL database from:

### Option A: Aiven for MySQL (Recommended - Free Tier)
1. Sign up at [aiven.io](https://aiven.io).
2. Create a new service: Choose **MySQL** on the free tier.
3. Once running, copy the **Service URI** or connection parameters:
   - Host: `...aivencloud.com`
   - Port: `12345`
   - User: `avnadmin`
   - Password: `...`
   - Database: `defaultdb` (or create a new database called `foodsaver`)

### Option B: TiDB Cloud Serverless (Free Forever)
1. Sign up at [tidbcloud.com](https://tidbcloud.com).
2. Create a Serverless cluster (100% MySQL compatible).
3. Under **Connect**, copy your connection string or individual credentials.

### Initialize the Schema
From your local terminal, initialize the schema on the remote database before starting:
```bash
# Set your cloud database credentials in your local environment or .env:
MYSQL_HOST=your-db-host.com
MYSQL_PORT=3306
MYSQL_DATABASE=foodsaver
MYSQL_USER=your_user
MYSQL_PASSWORD=your_password
MYSQL_SSL=true

# Or use a single connection string:
DATABASE_URL=mysql://your_user:your_password@your-db-host.com:3306/foodsaver

# Run the setup script:
npm run db:setup
```

---

## Step 2: Deploy the Backend on Render

1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository: `avinashloq2007-cmyk/foodsaver`.
4. Configure the Web Service:
   - **Name**: `foodsaver-api`
   - **Runtime**: `Node`
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node server/index.js`
   - **Plan**: `Free`
5. In **Environment Variables**, add:
   - `NODE_ENV`: `production`
   - `DB_DRIVER`: `mysql`
   - `TRUST_PROXY`: `1`
   - `AUTH_SECRET`: Generate a random 32+ character string (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `DATABASE_URL`: *(Your cloud MySQL connection URL)*
     *(Or supply `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_SSL=true`)*
   - `FRONTEND_URL`: `https://foodsaver-web.onrender.com` *(The URL of your frontend from Step 3)*
   - *(Optional Cloudinary variables if using image uploads: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`)*
   - *(Optional Firebase variables for live SMS OTP)*
6. Click **Deploy Web Service**.
7. Note down your backend URL (e.g. `https://foodsaver-api.onrender.com`).

---

## Step 3: Deploy the Frontend on Render (or Vercel / Netlify)

### On Render (Static Site)
1. Click **New +** → **Static Site**.
2. Select your GitHub repository: `avinashloq2007-cmyk/foodsaver`.
3. Configure the Static Site:
   - **Name**: `foodsaver-web`
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `./public`
4. Set the rewrite rule under **Redirects/Rewrites**:
   - Source: `/*`
   - Destination: `/index.html`
   - Action: `Rewrite`
5. Point the frontend to your backend API:
   - In `public/config.js` in your repository:
     ```javascript
     window.FOODSAVER_API_URL = "https://foodsaver-api.onrender.com";
     ```
   - Commit and push to GitHub.
6. Click **Deploy Static Site**.

---

## Step 4: Quick 1-Click Deployment with Render Blueprint

If you prefer to configure both services automatically:
1. In your Render Dashboard, click **New +** → **Blueprint**.
2. Connect `avinashloq2007-cmyk/foodsaver`.
3. Render reads `render.yaml` and will automatically configure both the `foodsaver-api` web service and `foodsaver-web` static site.
4. Fill in your database credentials in the prompts and click **Apply**.
