# backend-core

API principal de MenteAmiga-AI construida con NestJS, MongoDB y JWT.

## Requisitos

- Node.js 20+
- npm 10+
- MongoDB accesible
- `OPENAI_API_KEY` si quieres respuestas IA y embeddings reales
- `REDIS_URL` si quieres cola BullMQ real para procesamiento documental

## Variables de entorno

Copia `.env.example` a `.env` y ajusta:

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=test
JWT_SECRET=change-me
JWT_EXPIRES_IN=604800
STORAGE_PROVIDER=vercel-blob
BLOB_READ_WRITE_TOKEN=
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
OPENAI_API_KEY=
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
MONGODB_ATLAS_VECTOR_INDEX=vector_index
ENABLE_USER_MEMORY=true
AI_SHORT_TERM_MEMORY_LIMIT=14
RAG_TOP_K=5
REDIS_URL=
```

Notas:

- La base activa la define `MONGODB_DB_NAME`. En el entorno actual validado se usa `test`.
- Deja `MONGODB_URI` sin nombre de base embebido para evitar confundir la URI con la base efectiva.
- En produccion con Vercel Blob usa `STORAGE_PROVIDER=vercel-blob` y define `BLOB_READ_WRITE_TOKEN`.
- `CORS_ORIGINS` debe incluir las URLs reales de `frontend-usuario` y `frontend-super-admin`, separadas por coma.
- `OPENAI_API_KEY` es necesaria para `/ai/chat` y `/ai/chat-session`.
- `MONGODB_ATLAS_VECTOR_INDEX` habilita Atlas Vector Search sobre `documentchunks`. Si no existe, el retrieval documental usa fallback local.
- `ENABLE_USER_MEMORY` activa la memoria larga resumida y desactivable del usuario.
- `REDIS_URL` es opcional. Si no existe, el procesamiento documental usa fallback local.
- La definicion del indice vectorial esta en [docs/rag-setup.md](./docs/rag-setup.md).

## Instalación

```powershell
cd C:\Users\ferne\MenteAmiga-AI\backend-core
npm install
```

## Ejecución

Desarrollo:

```powershell
npm run start:dev
```

Build:

```powershell
npm run build
```

Producción local sobre `dist`:

```powershell
npm run start:prod
```

## Endpoints clave usados por frontend-usuario

Auth:

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/profile`

Perfil y usuario:

- `GET /profiles/me`
- `PUT /profiles/me`
- `POST /profiles/me/complete-onboarding`
- `GET /profiles/me/check-ins`
- `POST /profiles/me/check-ins`
- `GET /profiles/me/weekly-summary`
- `POST /profiles/me/avatar`

Chat:

- `GET /chats`
- `POST /chats`
- `GET /messages/chat/:chatId`
- `POST /messages`
- `POST /ai/chat`
- `POST /ai/chat-session`

Reminders:

- `GET /reminders`
- `POST /reminders`
- `PUT /reminders/:id`
- `DELETE /reminders/:id`

Suscripción:

- `GET /subscriptions/me`
- `GET /subscriptions/me/usage`

Soporte:

- `GET /support-requests/me`
- `POST /support-requests`

## Flujo básico de uso

1. El usuario se registra o inicia sesión.
2. Completa onboarding y crea/actualiza su perfil.
3. Guarda check-ins emocionales.
4. Conversa con la IA mediante `POST /ai/chat-session`.
5. Gestiona recordatorios, personalización y soporte desde el mismo backend.

## Arquitectura breve

- `frontend-usuario`: app móvil del usuario final.
- `frontend-super-admin`: panel administrativo.
- `backend-core`: API compartida, autenticación, chat, IA, documentos, admin y módulos de usuario final.
