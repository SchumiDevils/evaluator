# Frontend (React + Vite)

Interfața web pentru proiectul „Evaluator Inteligent”. Aplicația gestionează:

- autentificare (login/register) cu token JWT;
- formular pentru răspunsurile studenților + rubrici;
- selecție mod feedback: `rule-based` sau AI (OpenAI / Hugging Face);
- afișarea feedback-ului salvat de backend.

## Dezvoltare locală

```bash
npm install            # o singură dată, dacă nu a rulat automat
npm run dev            # http://localhost:5173
```

Configurează URL-ul API-ului prin `.env`:

```
VITE_API_URL=http://localhost:8000
```

Token-ul JWT este salvat în `localStorage` sub cheia `auth_token`.

## Build de producție

```bash
npm run build
npm run preview        # opțional, verificare locală
```

## Structură componentă

- `src/App.jsx` – flows autentificare + feedback;
- `src/App.css` și `src/index.css` – stiluri globale și layout responsive;
- `src/main.jsx` – bootstrap pentru React.

Următoare dezvoltări posibile: gestionare stări globale (React Query/Zustand),
rutare dedicată pentru profesori vs. studenți, grafice (Chart.js/Plotly) și
integrarea unui design system.
