# LOI MetaAcademy

Proyecto local de MetaAcademy para Legends of Interactions y Olympia Lab.

## Contenido

- `metaacademy/`: sitio web local con home, pagina de Jugadores y panel de base de conocimientos.
- `conocimiento/`: base documental en Markdown usada por el buscador local.

## Ejecutar

```powershell
cd metaacademy
npm start
```

Luego abrir:

```text
http://localhost:4173/
```

## Respuestas con OpenAI

La base de conocimiento sigue viviendo en `conocimiento/` y puede versionarse en GitHub como fuente de verdad.

Para que el panel responda con una IA más natural usando OpenAI, define estas variables antes de iniciar el servidor:

```powershell
$env:OPENAI_API_KEY="tu_api_key"
$env:OPENAI_MODEL="gpt-5-mini"
cd metaacademy
npm start
```

Notas:

- La llamada a OpenAI se hace en backend, no en el navegador.
- Si `OPENAI_API_KEY` no está definida o la API falla, el sistema vuelve automáticamente al modo documental de respaldo.
- Las respuestas siguen mostrando las fuentes recuperadas desde `conocimiento/`.

## Deploy en GitHub y Vercel

Para que funcione en Vercel igual que en local:

- El proyecto de Vercel debe apuntar a la raiz del repositorio, no a `metaacademy/`.
- `vercel.json` ya reescribe `/` y las paginas hacia `metaacademy/`.
- Las funciones serverless viven en `api/` y leen la base Markdown desde `conocimiento/`.
- `vercel.json` incluye `conocimiento/**` dentro de las funciones para que la base documental exista tambien en produccion.

Variables de entorno que debes cargar en Vercel:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` con valor sugerido `gpt-5-mini`

Si no defines `OPENAI_API_KEY`, la web seguirá funcionando en Vercel pero responderá en modo documental de respaldo.
