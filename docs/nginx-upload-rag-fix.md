# Fix de subida RAG con Nginx en Google Cloud

## Síntoma

En navegador:

```text
No 'Access-Control-Allow-Origin' header is present on the requested resource
```

Pero el preflight `OPTIONS` sí responde bien.

## Causa probable

Cuando `OPTIONS` funciona pero el `POST /documents/upload` con `multipart/form-data` no devuelve `Access-Control-Allow-Origin`, muchas veces no es un CORS puro de NestJS.

La causa más común en producción con VM + Nginx es:

- Nginx rechaza el cuerpo del archivo antes de pasarlo a NestJS
- devuelve `413 Request Entity Too Large` o a veces `502/504`
- el navegador lo muestra como error CORS porque la respuesta del proxy no trae el header esperado

## Confirmación rápida

Si ocurre esto:

- `OPTIONS /documents/upload` = `204`
- `POST /documents/upload` falla en navegador con “No Access-Control-Allow-Origin”

entonces prueba el backend/proxy con `curl` y revisa logs de Nginx.

## Configuración recomendada en Nginx

Agrega `client_max_body_size 20M;` en el bloque `server` que atiende `api.mente-amiga.com`.

Ejemplo:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name api.mente-amiga.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

También puede ir en `http {}` o en un `server {}` superior, pero para este caso lo más claro es ponerlo en el `server` del API.

## Dónde editar en Ubuntu / Google Cloud VM

Ubicaciones típicas:

- `/etc/nginx/sites-available/api.mente-amiga.com`
- `/etc/nginx/sites-enabled/api.mente-amiga.com`
- o `/etc/nginx/nginx.conf` si usas una sola configuración

## Pasos exactos para aplicar

### 1. Abrir la configuración

```bash
sudo nano /etc/nginx/sites-available/api.mente-amiga.com
```

### 2. Agregar o revisar

```nginx
client_max_body_size 20M;
```

### 3. Validar la configuración

```bash
sudo nginx -t
```

Debe responder algo como:

```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 4. Recargar Nginx

```bash
sudo systemctl reload nginx
```

Si no funciona:

```bash
sudo systemctl restart nginx
```

### 5. Reiniciar backend con PM2

Si actualizaste código del backend:

```bash
cd /ruta/a/Backend-core
npm run build
pm2 restart menteamiga-backend
pm2 logs menteamiga-backend --lines 200
```

Si no sabes el nombre del proceso:

```bash
pm2 list
```

## Cómo probar el preflight

```bash
curl -i -X OPTIONS "https://api.mente-amiga.com/documents/upload" \
  -H "Origin: https://frontend-super-admin-ct5vq39um-ferney21reyes-gmailcoms-projects.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

Esperado:

- `204 No Content`
- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Credentials: true`

## Cómo probar el POST real

```bash
curl -i -X POST "https://api.mente-amiga.com/documents/upload" \
  -H "Origin: https://frontend-super-admin-ct5vq39um-ferney21reyes-gmailcoms-projects.vercel.app" \
  -H "Authorization: Bearer TU_TOKEN" \
  -F "file=@./archivo.pdf;type=application/pdf" \
  -F "title=Documento de prueba" \
  -F "category=guidelines" \
  -F "status=published"
```

## Cómo diferenciar CORS real de 413/502 oculto

### CORS real

- el backend responde, pero sin `Access-Control-Allow-Origin`
- suele afectar `OPTIONS` y `POST`

### 413 oculto por navegador

- `OPTIONS` sí funciona
- `POST` no llega a NestJS
- Nginx responde antes
- en DevTools puede verse como CORS aunque el verdadero problema sea tamaño

Revisa:

```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

Si ves algo como:

```text
client intended to send too large body
```

el problema es Nginx, no NestJS.

### 502/504 oculto

- el proxy sí aceptó el cuerpo
- pero backend cayó o tardó demasiado
- revisar `pm2 logs`

## Logs agregados en backend

El backend ahora registra en `/documents/upload`:

- inicio de request
- usuario autenticado
- email
- nombre de archivo
- MIME
- tamaño
- resultado de indexación
- motivo claro si falla

También devuelve error claro cuando:

- excede 15 MB
- falla procesamiento/indexación

## Límite efectivo recomendado

- frontend/backend: 15 MB
- Nginx: 20 MB

Esto deja margen para headers y multipart boundary sin bloquear archivos válidos cerca del tope.

## Verificación final desde panel

1. redeploy backend si cambiaste código
2. recarga Nginx
3. inicia sesión en frontend-super-admin
4. sube un PDF menor a 15 MB
5. verifica en panel:
   - `indexingStatus = completed`
   - `chunkCount > 0`
   - `ragEnabled = true`
6. si falla:
   - DevTools Network
   - `pm2 logs`
   - `nginx access/error logs`

## Checklist

- `CORS_ORIGINS` correcto
- regex previews Vercel habilitados
- `client_max_body_size 20M;`
- `npm run build`
- `pm2 restart`
- `nginx -t`
- `systemctl reload nginx`
