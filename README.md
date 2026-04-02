# Rubrix – Platformă de Evaluare Academică cu Inteligență Artificială

Proiect de licență: o platformă web completă pentru crearea, distribuirea și corectarea evaluărilor academice, augmentată cu feedback automat bazat pe AI. Profesorii creează evaluări cu diferite tipuri de exerciții, iar studenții le rezolvă primind feedback instantaneu — automat, AI sau de la profesor.

## Arhitectura Generală

```
┌──────────────────────────────────┐       ┌──────────────────────────────────┐
│         Frontend (SPA)           │       │         Backend (API)            │
│  React 19 + Vite 7               │ HTTP  │  FastAPI + SQLAlchemy Async      │
│  Recharts · AnimeJS · GSAP       │◄─────►│  JWT Auth · Pydantic             │
│  Three.js (@react-three/fiber)   │       │  SQLite / PostgreSQL             │
│  Deploy: Vercel                  │       │  Deploy: Render / Uvicorn        │
└──────────────────────────────────┘       └──────────┬───────────────────────┘
                                                      │
                                           ┌──────────▼───────────────────────┐
                                           │      Servicii Externe            │
                                           │  Groq API (prioritar)            │
                                           │  OpenAI API (fallback)           │
                                           │  Hugging Face Inference          │
                                           │  Resend (email tranzacțional)    │
                                           └──────────────────────────────────┘
```

## Structura Proiectului

```
rubrix/
├── backend/
│   ├── app.py                      # Entry point FastAPI, CORS, startup migrations
│   ├── core/
│   │   ├── config.py               # Pydantic Settings (.env), API prefix
│   │   ├── security.py             # JWT (python-jose HS256), bcrypt (passlib)
│   │   ├── cors.py                 # Allowed origins + regex Vercel
│   │   └── http_middleware.py      # CORS headers fix middleware
│   ├── db/
│   │   ├── session.py              # Async engine, AsyncSession, get_session
│   │   └── migrate.py              # SQLite ALTER migrations + backfill logic
│   ├── models/
│   │   ├── base.py                 # DeclarativeBase + TimestampMixin
│   │   ├── user.py                 # User (email, role, avatar BLOB)
│   │   ├── evaluation.py           # Evaluation (title, status, schedule, access_code)
│   │   ├── question.py             # Question (type, options JSON, correct_answer)
│   │   ├── response.py             # Response (answer, score, mode, guest fields)
│   │   ├── feedback.py             # Feedback (category, message, source)
│   │   ├── attempt.py              # EvaluationAttempt (timer studenți logați)
│   │   ├── enrollment.py           # EvaluationEnrollment (join by code)
│   │   ├── public_attempt.py       # PublicEvaluationAttempt (sesiuni guest)
│   │   └── password_reset.py       # PasswordResetToken
│   ├── routers/
│   │   ├── auth.py                 # Autentificare, profil, avatar, reset parolă
│   │   ├── evaluations.py          # CRUD evaluări, întrebări, răspunsuri, analytics
│   │   ├── feedback.py             # Submit răspuns (autentificat) → feedback
│   │   └── analytics.py            # Analiză globală (distribuții, evoluție)
│   ├── schemas/
│   │   ├── auth.py                 # RegisterRequest, LoginResponse, etc.
│   │   ├── user.py                 # UserRead
│   │   ├── evaluation.py           # EvaluationRead, QuestionRead, etc.
│   │   └── feedback.py             # FeedbackResponse, ResponseRead, etc.
│   ├── services/
│   │   ├── ai_client.py            # Groq / OpenAI / HuggingFace AI feedback
│   │   ├── feedback_service.py     # Orchestrare: auto-corectare + AI + rule-based
│   │   ├── evaluation_access.py    # Lifecycle, ferestre de programare, timer
│   │   ├── evaluation_pdf.py       # Export PDF cu fpdf2
│   │   ├── email_resend.py         # Email reset parolă via Resend API
│   │   └── email_smtp.py           # Email SMTP legacy
│   ├── feedback_engine.py          # Feedback rule-based (lungime, structură, ton)
│   ├── fonts/                      # DejaVu fonts pentru PDF
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 # Componenta principală SPA (toate view-urile)
│   │   ├── PublicExam.jsx          # Examen public (fără autentificare)
│   │   ├── main.jsx                # React root mount
│   │   ├── App.css                 # Stiluri + sistem de teme (dark/light)
│   │   ├── index.css               # Reset global, tipografie
│   │   ├── components/
│   │   │   ├── Silk.jsx            # Background WebGL animat (Three.js shader)
│   │   │   ├── AnimeTimer.jsx      # Countdown circular cu AnimeJS
│   │   │   ├── MagicBento.jsx      # ParticleCard, GlobalSpotlight (GSAP)
│   │   │   └── MagicBento.css
│   │   └── assets/
│   │       └── rubrix-logo.svg     # Logo SVG
│   ├── vercel.json                 # SPA routing pentru Vercel
│   ├── vite.config.js
│   └── package.json
├── scripts/
│   └── start_backend.bat           # Script pornire Windows (venv + uvicorn)
├── .env.example
└── .gitignore
```

## Stack Tehnologic

| Layer | Tehnologii |
|-------|-----------|
| **Frontend** | React 19, Vite 7, Recharts (grafice), AnimeJS (animații), GSAP (efecte spotlight/particule), Three.js/@react-three/fiber (background WebGL) |
| **Backend** | FastAPI, SQLAlchemy 2.x (async), Pydantic v2, Uvicorn |
| **Baza de date** | SQLite (dev) / PostgreSQL (prod) via `DATABASE_URL` |
| **Autentificare** | JWT (HS256) cu python-jose, bcrypt via passlib, OAuth2 password flow |
| **AI / NLP** | Groq API (prioritar), OpenAI (fallback), Hugging Face Inference (terțiar) |
| **Email** | Resend API (reset parolă) |
| **PDF** | fpdf2 + fonturi DejaVu |

## Modelul de Date

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│    users     │     │   evaluations    │     │    questions     │
│─────────────│     │──────────────────│     │─────────────────│
│ id           │◄───┤ author_id (FK)   │◄───┤ evaluation_id    │
│ email        │     │ title            │     │ order            │
│ full_name    │     │ subject          │     │ question_type    │
│ hashed_pass  │     │ description      │     │ text             │
│ role         │     │ duration         │     │ options (JSON)   │
│ avatar_*     │     │ status           │     │ correct_answer   │
│ created_at   │     │ access_code      │     │ points           │
└──────┬──────┘     │ public_link_id   │     └────────┬────────┘
       │            │ scheduled_*_at   │              │
       │            └────────┬─────────┘              │
       │                     │                        │
       │     ┌───────────────┴────────────────────────┘
       │     │
       │     ▼
┌──────┴─────────────────┐     ┌──────────────────┐
│       responses        │     │   feedback_items  │
│────────────────────────│     │──────────────────│
│ id                     │◄───┤ response_id (FK) │
│ answer_text            │     │ category         │
│ evaluation_id (FK)     │     │ message          │
│ question_id (FK)       │     │ source           │
│ user_id (FK, nullable) │     └──────────────────┘
│ guest_name             │
│ guest_class            │     ┌────────────────────────────┐
│ public_session_token   │     │ evaluation_enrollments     │
│ score                  │     │ evaluation_attempts        │
│ mode                   │     │ public_evaluation_attempts │
│ token_usage            │     │ password_reset_tokens      │
└────────────────────────┘     └────────────────────────────┘
```

## API Endpoints (prefix: `/api/v1`)

### Autentificare (`/auth`)
| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| POST | `/auth/register` | Înregistrare (student/profesor) |
| POST | `/auth/login` | Login OAuth2 → JWT |
| GET | `/auth/me` | Profil utilizator curent |
| PATCH | `/auth/me` | Actualizare nume / parolă |
| GET/POST/DELETE | `/auth/me/avatar` | Gestionare avatar |
| POST | `/auth/forgot-password` | Trimitere email reset parolă |
| POST | `/auth/reset-password` | Validare token + parolă nouă |

### Evaluări (`/evaluations`)
| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| GET | `/evaluations/` | Lista evaluări + statistici agregate (per rol) |
| POST | `/evaluations/` | Creare evaluare + întrebări |
| GET | `/evaluations/{id}` | Detalii evaluare |
| PUT | `/evaluations/{id}` | Actualizare evaluare + sincronizare întrebări |
| DELETE | `/evaluations/{id}` | Ștergere evaluare |
| POST | `/evaluations/join` | Student se alătură prin cod de acces |
| POST | `/evaluations/{id}/start` | Pornire examen (timer) |
| GET | `/evaluations/{id}/responses` | Răspunsuri studenți (doar profesor) |
| GET | `/evaluations/{id}/analytics` | Analiză per evaluare (distribuție, clasament) |
| GET | `/evaluations/{id}/export/pdf` | Export PDF complet |
| GET | `/evaluations/{id}/my-responses` | Răspunsurile mele la o evaluare |
| GET | `/evaluations/my-responses` | Toate răspunsurile mele (student) |
| PUT | `/evaluations/responses/{id}/feedback` | Profesor: re-evaluare manuală |
| POST | `/evaluations/{id}/regenerate-access-code` | Regenerare cod acces |
| PUT | `/evaluations/{id}/public-link` | Activare/dezactivare link public |

### Examene Publice (fără autentificare)
| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| GET | `/evaluations/public/{link_id}` | Metadata evaluare publică |
| POST | `/evaluations/public/{link_id}/start` | Pornire sesiune guest |
| POST | `/evaluations/public/{link_id}/answer` | Răspuns guest → feedback |

### Feedback (`/feedback`)
| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| POST | `/feedback/` | Submit răspuns autentificat → feedback (auto/AI/rule) |

### Analiză Globală (`/analytics`)
| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| GET | `/analytics/` | Distribuție scoruri, succes per întrebare, medii, evoluție |

## Funcționalități Principale

### Autentificare și Roluri
- Înregistrare/login cu JWT, roluri **profesor** și **student**
- Profil cu avatar (upload/editare), schimbare parolă
- Reset parolă prin email (Resend API) cu token hash-uit

### Sistem de Evaluări
- **CRUD complet** pentru evaluări cu metadate (titlu, materie, durată, descriere)
- **Question Builder** cu 4 tipuri de exerciții:
  - Răspuns lung (textarea)
  - Răspuns scurt (input)
  - Alegere singulară (radio buttons — un singur răspuns corect)
  - Checkbox-uri (selecție multiplă — mai multe răspunsuri corecte)
- Selectare vizuală a răspunsurilor corecte direct pe opțiuni (radio/checkbox)
- **Lifecycle management**: draft → scheduled → active → closed
- Ferestre de programare (start/end) cu acces automat bazat pe timp
- Cod de acces unic pentru studenți + link public pentru guest-uri
- Shuffling determinist al întrebărilor per student/sesiune

### Examinare
- **Timer** per evaluare cu countdown circular animat (AnimeJS)
- Răspuns per întrebare cu feedback instant
- Suport atât studenți autentificați cât și guest-uri (link public)
- Sesiuni persistente (reconectare fără pierdere de progres)

### Sistem de Feedback și Corectare
- **Auto-corectare** pentru alegere singulară și checkbox-uri (comparare exactă cu răspunsul corect)
- **Scoring parțial** la checkbox-uri: credit pentru răspunsuri corecte identificate, penalizare pentru greșeli, credit minim garantat dacă studentul nu a selectat toate opțiunile
- **Feedback AI** prin Groq (prioritar), OpenAI sau Hugging Face — analiză calitativă + scor
- **Feedback rule-based** (lungime, structură, exemple, ton) — fără AI, instant
- **Re-evaluare manuală** de către profesor (override scor + feedback personalizat)

### Analiză și Rapoarte
- **Dashboard global** cu statistici agregate (evaluări, răspunsuri, scor mediu)
- **Analiză globală** cu grafice Recharts:
  - Distribuția scorurilor (BarChart)
  - Rata de succes per întrebare (BarChart orizontal color-coded)
  - Media per evaluare (BarChart comparativ)
  - Evoluția scorurilor (LineChart — doar studenți)
- **Analiză per evaluare** (tab dedicat):
  - 4 carduri sumar (participanți, media clasei, min/max scor)
  - Distribuția scorurilor per student
  - Rata de succes per întrebare
  - Clasament studenți
- **Export PDF** complet al rezultatelor evaluării

### UI/UX
- **Teme dark/light** cu toggle și persistare în localStorage
- Logo dinamic (gri pe dark, violet pe light) prin CSS mask
- **Animații**: background WebGL (Three.js shader), ParticleCards cu GSAP, countdown AnimeJS
- **Magic Bento Grid** cu spotlight și efecte de particule
- Design responsiv, navigare prin logo la home

## Cum Rulezi Local

### 1. Backend

```powershell
# Windows (script automat)
scripts\start_backend.bat

# Manual
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/Mac
pip install -r requirements.txt
uvicorn backend.app:app --reload
```

La pornire, backend-ul creează automat baza de date + rulează migrațiile SQLite.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

### 3. Variabile de Mediu

Copiază `.env.example` → `.env` și configurează:

| Variabilă | Descriere | Implicit |
|-----------|-----------|----------|
| `DATABASE_URL` | Conexiune SQLAlchemy | `sqlite+aiosqlite:///./app.db` |
| `SECRET_KEY` | Cheie JWT | (obligatoriu) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Expirare token | `120` |
| `GROQ_API_KEY` | Cheie Groq API (AI prioritar) | (opțional) |
| `OPENAI_API_KEY` | Cheie OpenAI (fallback) | (opțional) |
| `HUGGINGFACE_API_TOKEN` | Token HuggingFace (terțiar) | (opțional) |
| `ALLOW_ORIGINS` | JSON cu origini CORS | `["http://localhost:5173"]` |
| `FRONTEND_BASE_URL` | URL frontend (pt. email-uri) | `http://localhost:5173` |
| `RESEND_API_KEY` | Cheie Resend (email reset) | (opțional) |
| `RESEND_FROM` | Adresă expeditor email | (opțional) |
| `VITE_API_URL` | URL backend (frontend .env) | `http://localhost:8000` |
