# Bot de WhatsApp del Estudio Contable (Evolution API + n8n)

Bot conversacional sobre WhatsApp con **número real** (vía Evolution API / Baileys,
menor riesgo de baneo que las APIs no oficiales) que permite:

- **Empleados**: pedir su recibo de sueldo (PDF), consultar días de vacaciones,
  pedir certificado de trabajo y ver su legajo.
- **Operadores del estudio**: emitir una factura electrónica a un cliente
  (paso a paso por chat, con CAE de AFIP y PDF).

La lógica vive en el backend (`src/services/whatsapp/botService.js`). **n8n es
opcional**: sirve como capa de ingesta/orquestación visual, pero el backend ya
puede manejar el webhook de Evolution directo.

```
WhatsApp ──> Evolution API ──> (n8n |  webhook directo) ──> Backend (máquina de estados)
                  ^                                                |
                  └──────────────── respuestas (texto/PDF) ────────┘
```

---

## Arquitectura de archivos

| Componente | Archivo |
|---|---|
| Cliente Evolution (enviar/QR/estado) | `backend/src/services/whatsapp/evolutionClient.js` |
| Máquina de estados del bot | `backend/src/services/whatsapp/botService.js` |
| Provider `evolution` para envíos salientes | `backend/src/services/whatsappService.js` |
| Rutas (webhook + admin) | `backend/src/routes/whatsapp.js` |
| Modelo de sesión conversacional | `backend/prisma` → `SesionWhatsapp` |
| Workflow n8n importable | `n8n/whatsapp-estudio-contable.json` |
| Infra Docker | `whatsapp/docker-compose.yml` |

---

## 1) Levantar Evolution API + n8n

```bash
cd whatsapp
cp .env.example .env
#  → editá .env y poné una EVOLUTION_API_KEY larga y secreta
docker compose up -d
```

- Evolution API: http://localhost:8080
- n8n: http://localhost:5678 (creás tu usuario la primera vez)

> En **producción** ponelo detrás de HTTPS (un dominio con Caddy/Nginx, o un VPS
> en Hetzner/Railway). El webhook entrante hacia tu backend tiene que ser
> **https público** (Render ya te da uno).

---

## 2) Configurar el backend

En las variables de entorno del backend (`.env` local o en Render):

```env
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=http://localhost:8080      # o la URL pública de Evolution
EVOLUTION_API_KEY=la-misma-clave-del-compose
EVOLUTION_INSTANCE=estudio
WHATSAPP_WEBHOOK_TOKEN=algun-token-secreto   # opcional pero recomendado
WHATSAPP_OPERADORES=5493513453579            # tu número de prueba (sin +, sin 9 da igual)
WHATSAPP_FALLBACK_ESTUDIO=true               # solo para la etapa de prueba
PUBLIC_URL=https://estudio-contable-api.onrender.com
```

Aplicá la migración de la base (crea la tabla `sesiones_whatsapp`):

```bash
cd backend
npx prisma migrate deploy
```

---

## 3) Conectar el número (escanear QR)

Con el backend corriendo y logueado como ADMIN/CONTADOR:

```bash
# crea la instancia, configura el webhook y devuelve el QR en base64
curl -X POST https://estudio-contable-api.onrender.com/api/whatsapp/conectar \
  -H "Authorization: Bearer <TU_JWT>"
```

La respuesta trae `qr.base64` (o `qr`). Pegalo en el navegador
(`data:image/png;base64,...`) o usá el endpoint `GET /api/whatsapp/qr`, y
**escaneá desde el WhatsApp del número** (`+54 9 3513 45-3579`):
WhatsApp → Dispositivos vinculados → Vincular dispositivo.

Verificá el estado:

```bash
curl https://estudio-contable-api.onrender.com/api/whatsapp/estado -H "Authorization: Bearer <TU_JWT>"
# conexion: "open"  → ya está conectado
```

Probá un envío:

```bash
curl -X POST .../api/whatsapp/enviar-prueba -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" -d '{"telefono":"5493513453579"}'
```

---

## 4) Dos formas de recibir mensajes

### Opción A — Webhook directo al backend (más simple)
`POST /api/whatsapp/conectar` ya apunta el webhook de Evolution a
`PUBLIC_URL/api/whatsapp/webhook/<instance>`. No necesitás n8n: el backend
procesa y responde solo. **Recomendado para arrancar.**

### Opción B — Vía n8n (orquestación visual)
1. Abrí n8n (http://localhost:5678) → **Import from File** → `n8n/whatsapp-estudio-contable.json`.
2. Abrí el nodo **Config** y completá:
   - `backendUrl`: URL pública del backend (Render).
   - `evolutionUrl`: `http://evolution-api:8080` (si n8n está en el mismo compose) o la pública.
   - `evolutionKey`: tu `EVOLUTION_API_KEY`.
   - `webhookToken`: el mismo `WHATSAPP_WEBHOOK_TOKEN` del backend (o vacío).
3. **Activá** el workflow y copiá la **Production URL** del nodo *Webhook Evolution*.
4. Apuntá el webhook de Evolution a esa URL (en vez del backend). Podés hacerlo
   con: `POST {EVOLUTION_API_URL}/webhook/set/{instance}` con el body de eventos
   `MESSAGES_UPSERT`, o seteando `WEBHOOK_GLOBAL_URL` en el compose.

En la opción B, n8n parsea el mensaje, llama a `POST /api/whatsapp/procesar` del
backend (que devuelve las respuestas) y las envía por Evolution. Así podés
editar el flujo sin tocar código.

---

## 5) Probar el bot

Escribile al número desde otro WhatsApp:

- Si tu número está en `WHATSAPP_OPERADORES` → escribí **`facturar`** y seguí los pasos.
- Si sos un **empleado** cargado (con ese teléfono en su legajo) → escribí **`hola`**
  y vas a ver el menú (recibo, vacaciones, certificado, datos).

Comandos globales: `hola`, `menu`, `cancelar`.

---

## Seguridad y notas

- **Multi-estudio**: cada estudio usa su propia instancia de Evolution
  (`estudio.waInstance`). El `estudioId` se resuelve desde la instancia, nunca
  desde el mensaje → un empleado no puede ver datos de otro estudio.
- **Operadores**: sólo los números en `estudio.waOperadores` (o
  `WHATSAPP_OPERADORES`) pueden facturar. Configuralo por estudio con
  `PUT /api/whatsapp/config`.
- **Facturación**: respeta `estudio.afipAmbiente` (`SIMULADO` por defecto →
  CAE ficticio para pruebas). Para emitir real necesitás certificado AFIP
  cargado y `AFIP_AMBIENTE=WSFE`.
- **Baneos**: Evolution reduce el riesgo pero no lo elimina. Recomendaciones:
  número nuevo dedicado, no enviar masivo desde el bot, calentar el número
  (chats reales primero), y respetar la ventana de respuesta. Para volumen alto
  y formal, migrá a Meta Cloud API (`WHATSAPP_PROVIDER=meta`).
