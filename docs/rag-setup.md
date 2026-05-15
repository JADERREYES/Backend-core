# RAG Setup

## Dependencias

No hay nuevas dependencias fuera de las ya declaradas en `package.json`:

```powershell
cd C:\Users\jader\Proyectos\MenteAmiga\Backend-core
npm install
```

## Variables `.env`

```env
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
MONGODB_ATLAS_VECTOR_INDEX=vector_index
ENABLE_USER_MEMORY=true
AI_SHORT_TERM_MEMORY_LIMIT=14
RAG_TOP_K=5
REDIS_URL=
```

## Indice MongoDB Atlas Vector Search

Coleccion: `documentchunks`  
Indice: `vector_index`

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "tenantId"
    },
    {
      "type": "filter",
      "path": "organizationId"
    },
    {
      "type": "filter",
      "path": "userId"
    },
    {
      "type": "filter",
      "path": "ownerType"
    },
    {
      "type": "filter",
      "path": "isActive"
    },
    {
      "type": "filter",
      "path": "documentStatus"
    }
  ]
}
```

## Prueba rapida

1. Levanta backend y panel admin.
2. Sube un PDF con texto real desde Documentos.
3. Verifica que el documento quede con `indexingStatus=completed`, `ragEnabled=true` y `chunkCount > 0`.
4. Prueba recuperacion:

```http
POST /rag/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "¿Que dice el protocolo sobre crisis emocional?",
  "limit": 5
}
```

5. Prueba chat:

```http
POST /ai/chat-session
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "Segun el documento interno, que debo hacer si un usuario reporta pensamientos de autolesion?"
}
```

La respuesta debe incluir `contextUsed=true`, `retrievalMode` distinto de `none` y `sources` con el documento recuperado.
