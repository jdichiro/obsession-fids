# Obsession Pizza FIDS — Setup Completo

## Estructura del repo (EXACTA)
```
/
├── index.html
├── style.css
├── app.js
├── netlify.toml
└── netlify/
    └── functions/
        └── flights.js
```

## Paso 1 — Subir a GitHub
1. Crear repo nuevo en github.com (ej: `obsession-fids`)
2. Subir TODOS los archivos manteniendo la estructura exacta
   - `netlify/functions/flights.js` tiene que estar en esa ruta exacta

## Paso 2 — Conectar Netlify a GitHub
1. netlify.com → "Add new site" → "Import an existing project"
2. Elegir GitHub → seleccionar el repo
3. Build settings:
   - **Base directory**: (vacío)
   - **Publish directory**: `.`
   - **Functions directory**: `netlify/functions`
4. Click "Deploy"

## Paso 3 — API Key de AviationStack
1. Crear cuenta gratis en aviationstack.com
2. Copiar el API Access Key del dashboard
3. En Netlify: Site Settings → Environment Variables → Add variable
   - Key: `AVIATION_API_KEY`
   - Value: (tu key)
4. Trigger redeploy: Deploys → "Trigger deploy"

## Paso 4 — Verificar que la función existe
- Netlify dashboard → Functions → debe aparecer "flights"
- Hacer clic → Logs → debe mostrar actividad al cargar la página

## Troubleshooting
- **La función no aparece**: verificar que `netlify/functions/flights.js` está en el repo
- **Datos no cargan**: revisar logs de la función en Netlify dashboard
- **API error en logs**: verificar que `AVIATION_API_KEY` está bien configurada y hacer redeploy
