# Prueba RAG con PDFs

## Orden recomendado de subida

### Primero

1. `Primeros auxilios psicologicos.pdf`
2. `PSYCHOLOGICAL-GUIDE-FIELDWORKERS.pdf`
3. `10_guia_ansiedad.pdf`

### Después

4. `manual_respuestas_empaticas_menteamiga.pdf`
5. `menteamiga_tono_voz.pdf`
6. `guia_soledad_menteamiga.pdf`
7. `guia_rupturas_emocionales_menteamiga.pdf`
8. `guia_estres_universitario_menteamiga.pdf`
9. `guia_autoestima_menteamiga.pdf`
10. `guia_ansiedad_inicial_menteamiga.pdf`
11. `guia_duelo_menteamiga.pdf`
12. `limites_eticos_ia_menteamiga.pdf`

## Descripción sugerida de cada PDF

- `Primeros auxilios psicologicos.pdf`: base de contención inicial y respuesta en crisis.
- `PSYCHOLOGICAL-GUIDE-FIELDWORKERS.pdf`: apoyo psicoemocional y cuidado en situaciones exigentes.
- `10_guia_ansiedad.pdf`: material de apoyo para ansiedad inicial y regulación.
- `manual_respuestas_empaticas_menteamiga.pdf`: estilo principal de acompañamiento.
- `menteamiga_tono_voz.pdf`: reglas de voz y coherencia emocional.
- guías internas temáticas: respuestas contextualizadas por problema frecuente.

## Cómo subir desde superadmin

1. Inicia sesión como `superadmin`.
2. Ve a `Documentos`.
3. Clic en `Subir documento`.
4. Adjunta el PDF.
5. Completa:
   - `Titulo`
   - `Categoria`
   - `Estado = published`
   - `Version`
6. Guarda.
7. Espera a que el sistema procese e indexe.

## Cómo verificar indexación

Después de la subida, el documento debería mostrar:

- `ragEnabled = true`
- `indexingStatus = completed`
- `chunkCount > 0`
- `ultima indexacion` con fecha

Si abres `Ver detalle`, debes ver:

- `extractedTextLength > 0`
- `indexingError` vacío

Si abres `Ver chunks`, debes ver fragmentos reales del documento.

## Cómo verificar `documentchunks`

En MongoDB Atlas:

1. abre la colección `documentchunks`
2. filtra por `documentId`
3. confirma:
   - `embedding` con longitud 1536
   - `text` con contenido real
   - `sourceFileName`
   - `chunkIndex`
   - `isActive = true`

## Cómo probar en Postman

### Búsqueda semántica

`POST /rag/search`

Headers:

- `Authorization: Bearer <token>`
- `Content-Type: application/json`

Body:

```json
{
  "query": "como acompañar a una persona con ansiedad inicial sin sonar clínica",
  "limit": 5
}
```

Respuesta esperada:

- `contextUsed = true`
- `chunks` con `score`
- `sourceFileName`
- `documentId`
- fragmentos relevantes

### Chat con RAG

`POST /ai/chat-session`

```json
{
  "message": "Me siento muy acelerado y no sé cómo bajar esta ansiedad. ¿Puedes acompañarme paso a paso?"
}
```

Respuesta esperada:

- tono cálido y honesto
- sin diagnóstico
- posible referencia natural a guía de ansiedad o manual MenteAmiga
- `sources` si hubo recuperación documental

## Pruebas reales del chat

### Ansiedad

“Me siento inquieto todo el día y no sé por qué.”

### Soledad

“Aunque hablo con gente, siento que nadie me entiende.”

### Ruptura

“Terminé una relación y me siento perdido.”

### Autoestima

“Siento que no sirvo para nada.”

### Estrés universitario

“Tengo demasiadas tareas y me paralizo.”

## Errores comunes

### `401 Unauthorized`

- el token no fue enviado
- el token expiró
- se probó `/rag/search` sin autenticación

### `chunkCount = 0`

- el PDF no tiene texto extraíble
- el documento quedó en `draft`
- la extracción falló

### `indexingStatus = failed`

- error de extracción
- embeddings fallando
- excepción en reemplazo de chunks

### vector index no creado

- Atlas Vector Search no tiene `vector_index`
- el backend cae a fallback local
- la búsqueda puede responder peor o más genérica

### PDF sin texto

- PDF escaneado solo como imagen
- contenido protegido o mal codificado

### embeddings fallando

- `OPENAI_API_KEY` ausente o inválida
- error de red hacia OpenAI
- entrada vacía

### chat respondiendo genérico

- no había contexto documental relevante
- `ragEnabled` está desactivado
- el documento no quedó `published`

### IA sin fuentes

- no encontró chunks suficientes
- respondió desde memoria corta/larga general
- el endpoint RAG devolvió `contextUsed = false`

## Checklist final

- `npm run build` pasa
- `npm test -- --runInBand` pasa
- `npx tsc -p tsconfig.spec.json --noEmit` pasa
- Atlas tiene `vector_index`
- `documentchunks` contiene embeddings
- el panel muestra `Documento indexado para IA`
