# Evaluator Inteligent – React + FastAPI + AI

Proiect de licență pentru o platformă de evaluare academică augmentată cu
inteligență artificială. Stack-ul curent: front-end React (Vite) + back-end
FastAPI, persistență în baza de date (SQLAlchemy async) și integrare opțională cu
modele NLP (OpenAI sau Hugging Face).

## Structură

```
.
├─ backend/
│  ├─ app.py                # punct intrare FastAPI
│  ├─ core/                 # configurare și securitate (JWT)
│  ├─ db/                   # engine SQLAlchemy + sesiuni
│  ├─ models/               # utilizatori, evaluări, răspunsuri, feedback
│  ├─ routers/              # auth + feedback
│  ├─ schemas/              # Pydantic pentru I/O
│  ├─ services/             # motor AI + orchestrare feedback
│  ├─ feedback_engine.py    # regulile de feedback de bază
│  └─ requirements.txt
└─ frontend/
   ├─ src/App.jsx           # interfața principală (auth + feedback)
   └─ ...
```

## Cum rulezi local


### 1. Backend FastAPI

- **Windows (un singur pas):**

  ```powershell
  scripts\start_backend.bat
  ```

  Scriptul creează automat mediul virtual `.venv`, instalează dependențele (doar când `requirements.txt` s-a schimbat) și pornește `uvicorn`.

- **Manual / alte platforme:**

  ```bash
  cd backend
  python -m venv .venv
  source .venv/bin/activate            # Linux/Mac
  # .venv\Scripts\activate             # Windows
  pip install -r requirements.txt
  uvicorn backend.app:app --reload
  ```

  Configurează variabilele de mediu după nevoie (Postgres, OpenAI/HF etc.). După prima instalare poți porni direct `uvicorn backend.app:app --reload` dacă vrei să eviți scriptul.

Rutele principale (prefiks `/api/v1`):

- `GET /health` – verificare rapidă a serviciului;
- `POST /auth/register` – înregistrare utilizator (student/profesor);
- `POST /auth/login` – autentificare (OAuth2 password flow) → JWT;
- `GET /auth/me` – profilul utilizatorului curent;
- `POST /feedback/` – generează și salvează feedback (rule-based sau AI).

La pornire, aplicația creează automat baza de date definită prin
`DATABASE_URL` (implicit SQLite `app.db`).

### 2. Frontend React

```bash
cd frontend
npm install            # dacă nu a rulat automat
npm run dev            # http://localhost:5173
```

Configurează API-ul prin `.env` (implicit `http://localhost:8000`):

```
VITE_API_URL=http://localhost:8000
```

## Funcționalități implementate

- Autentificare JWT (login/register) + roluri student/profesor;
- Persistență răspunsuri și feedback în baza de date;
- Generator feedback rule-based și opțional AI (OpenAI/Hugging Face);
- Formular rubrici și asociere la evaluări;
- UI responsiv cu secțiuni pentru cont și feedback.

## Variabile de mediu relevante

- `DATABASE_URL` – conexiune SQLAlchemy (ex. `postgresql+asyncpg://...`);
- `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `JWT_ALGORITHM`;
- `OPENAI_API_KEY`, `OPENAI_MODEL` (ex. `gpt-4o-mini`);
- `HUGGINGFACE_API_TOKEN`, `HUGGINGFACE_MODEL` (fallback dacă nu există OpenAI);
- `ALLOW_ORIGINS` (listă JSON) pentru CORS, setată implicit la `http://localhost:5173`.

## Direcții de extindere

- Migrații cu Alembic și scheme detaliate de rubrici;
- Dashboard profesori (Chart.js / Plotly) și export rapoarte;
- Scheduler / worker pentru procesări lot (celery + redis);
- Monitorizare costuri AI + caching rezultate;
- Integrare LMS (LTI/Canvas) și audit trail complet.

Documentează deciziile tehnice și rezultatele testelor pentru a susține
lucrarea de licență.