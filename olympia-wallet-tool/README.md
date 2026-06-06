# Olympia Wallet Tool

Herramienta local para:

- abrir Olympia en un navegador controlado por la app;
- leer `Mi equipo`, sus páginas e invitados;
- guardar una base local;
- buscar Nombre Usuario y UID pegando una wallet.

## Uso facil

Hacer doble clic en:

```text
ABRIR-PANEL.bat
```

Eso abre el panel en el navegador.

## Uso manual

```powershell
npm install
npm start
```

Abrir:

```text
http://localhost:4317/
```

## Flujo

1. Tocar `Abrir Olympia`.
2. Si Olympia pide login, iniciar sesión en la ventana que se abre.
3. Volver al panel y tocar `Sincronizar Mi Equipo`.
4. Buscar pegando una wallet.

La app no guarda contraseñas. Solo conserva la sesión del navegador local en `data/browser-profile` y la base extraída en `data/team.csv` / `data/team.json`.
