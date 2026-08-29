# JustAsk LK

**Talk about anything, anonymously.**

An anonymous, AI-first health support platform for people who fear stigma or judgement in discussing mental health, sexual health, addiction, or general health concerns.

Mini Project — CCS2313 Project Management, Sri Lanka Technology Campus (SLTC)

---

## What this is

JustAsk LK lets a person open the app with no account, no real name, and no identifying details. They describe what's troubling them, and an AI support assistant responds with supportive, judgement-free information and guidance. If the AI recognises the situation is beyond safe AI guidance, it hands the user off to a real, verified doctor — still anonymously. If that doctor advises an in-person visit, the app shows a referral card with the doctor's practice details, so the patient can choose to follow up on their own.

See `docs/` for the full project proposal, including objectives, scope, legal fit for Sri Lanka, and the sustainability model.

## Project structure

```
justask-lk/
├── frontend/          React + Vite chat interface
├── backend/
│   ├── index.js       Express server entry point
│   ├── models/        MongoDB schemas (Session, MoodLog, ChatMessage, DoctorProfile)
│   ├── routes/        API endpoints (chat, mood, referral)
│   └── services/      AI engine + safety layer (crisis detection, scope/confidence check)
├── docs/              Proposal document and supporting materials
├── .gitignore
└── README.md
```

## Core principle: anonymity is one-directional

- **Patients** are never asked for a name, NIC, phone, or email — anywhere. Identified only by a random session ID.
- **Doctors** are verified against SLMC registration before they can chat with anyone, but their real identity is never shown to the patient — only a role badge (e.g. "Verified Doctor — General Practice").

See `backend/models/DoctorProfile.js` for how this is enforced in code, not just policy.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) |
| Backend | Node.js + Express |
| AI engine | LLM API + safety system prompt |
| Safety layer | Keyword rules + lightweight ML classifier |
| Database | MongoDB (no identity fields) |
| Hosting | Cloud (student/free tier), HTTPS/SSL |

## Getting started

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Backend:**
```bash
cd backend
npm install
npm start
```

Create a `.env` file in `backend/` (never commit this — it's in `.gitignore`) with:
```
PORT=5000
MONGODB_URI=your_connection_string
LLM_API_KEY=your_api_key
```

## Team

| Role | Responsibility |
|---|---|
| AI / Conversation Engineer | LLM integration, prompt engineering, conversation flow |
| Safety Engineer | Crisis detection and escalation logic, safety testing |
| Frontend / UI Developer | App interface, mood-tracking screens, user experience |
| Backend / Data Engineer | API, database, anonymous sessions, deployment |
| UX & Documentation Lead | Localisation, resource directory, documentation, slides |

Full names and student IDs are in the project proposal (`docs/`), not duplicated here for privacy.

## Branching

- `master` — protected, working/tested code only.All feature work merges here via pull request.
- `feature/*` — one branch per person/task, merged into `master` via pull request after review

## Responsible use

JustAsk LK is a support and signposting tool, not a medical or crisis service. It does not provide diagnosis, treatment, or prescriptions at any point. Anyone in immediate danger should contact emergency services or a crisis helpline directly (Sri Lanka: 1333 Crisis Support Line, 1926 National Mental Health Helpline, 1929 Childline).
