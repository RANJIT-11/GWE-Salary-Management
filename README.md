# Host PT Salary App

Starter project structure for a React, Vite, and Tailwind frontend with a FastAPI backend.

## Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
npm run dev
```

On the sign-in screen, select **Test connection** to check that the Supabase
REST API is reachable with the configured publishable/anon key. This Phase 1
check does not query application tables or verify their schema and RLS policies.
Never put a Supabase service-role or secret key in frontend environment variables.

## Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

The API health check is available at `http://localhost:8000/health`.
Add the provided logo image files to `frontend/public/` and `frontend/src/assets/`.
