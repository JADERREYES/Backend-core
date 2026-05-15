# Biblioteca RAG MenteAmiga

Esta carpeta contiene la biblioteca documental interna de MenteAmiga en formato Markdown. Cada archivo fue diseñado para:

- servir como base de tono, límites y estilo conversacional
- convertirse fácilmente a PDF para subirlo desde el panel de superadmin
- mantenerse editable antes de indexarlo en MongoDB Atlas Vector Search

## Estructura

- `*.md`: documentos fuente editables
- `convert-all-to-pdf.ps1`: script de conversión masiva
- `pdf/`: carpeta de salida recomendada para los PDFs generados

## Conversión Markdown → PDF

### Opción recomendada: Pandoc

Instala Pandoc:

- Windows: https://pandoc.org/installing.html

Comando manual para un archivo:

```powershell
pandoc .\manual_respuestas_empaticas_menteamiga.md -o .\pdf\manual_respuestas_empaticas_menteamiga.pdf
```

Comando para todos los archivos:

```powershell
cd C:\Users\jader\Proyectos\MenteAmiga\Backend-core\docs\menteamiga-rag-library
.\convert-all-to-pdf.ps1
```

## Dónde quedan los PDFs

El script los genera en:

```text
Backend-core/docs/menteamiga-rag-library/pdf
```

## Cómo mantenerlos editables

1. Edita siempre el archivo `.md`.
2. Regenera el PDF.
3. Sube el PDF nuevo desde el panel de superadmin.
4. Reindexa si reemplazaste un documento existente.

## Cómo agregar nuevos documentos

1. Crea un nuevo `.md` en esta carpeta.
2. Mantén la estructura sugerida:
   - propósito
   - cuándo usarlo
   - qué hacer
   - qué no hacer
   - ejemplos reales
   - límites éticos
3. Ejecuta `.\convert-all-to-pdf.ps1`.
4. Sube el PDF al panel.
5. Verifica `chunkCount > 0` e `indexingStatus = completed`.

## Recomendación operativa

Orden sugerido de carga documental:

1. PDFs externos base:
   - `Primeros auxilios psicologicos.pdf`
   - `PSYCHOLOGICAL-GUIDE-FIELDWORKERS.pdf`
   - `10_guia_ansiedad.pdf`
2. PDFs internos MenteAmiga:
   - `manual_respuestas_empaticas_menteamiga.pdf`
   - `menteamiga_tono_voz.pdf`
   - guías emocionales temáticas

## Nota

El Markdown es la fuente viva. El PDF es el artefacto que entra al flujo:

`PDF -> extracción -> chunking -> embeddings -> documentchunks -> vector search -> chat`
