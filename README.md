# Despliegue rápido (rápido y ágil)

Opciones soportadas (rápidas): Docker (recomendado), Heroku/Railway (sin Docker).

## Variables de entorno mínimas
Crear un archivo `.env` en la raíz con al menos:

```
MONGO_CNN=mongodb://root:example@mongo:27017/icesoft?authSource=admin
JWT_SECRET=una_clave_larga
PORT=3001
```

Ajusta `MONGO_CNN` si usas Atlas u otro servicio.

## Despliegue con Docker (local o servidor)

1. Construir y levantar (usa Docker Desktop o similar):

```bash
docker-compose up --build -d
```

2. El backend quedará expuesto en `http://localhost:3001`.

## Despliegue con Docker (sin docker-compose)

```bash
docker build -t icesoft-backend .
docker run -p 3001:3001 --env-file .env icesoft-backend
```

## Despliegue en plataformas (Heroku / Railway / Render)

Plataformas como Heroku o Railway detectarán el `package.json`. Si usas Heroku, el script `heroku-postbuild` construirá el frontend automáticamente y el `Procfile` declara el proceso web.

- Asegura configurar las variables de entorno `MONGO_CNN` y `JWT_SECRET` en el panel de la plataforma.
- En producción, el frontend usa rutas relativas `/api`, por lo que no necesitas cambiar la URL de la API si backend y frontend se sirven desde el mismo host.

## Servir frontend desde el backend

El servidor Express ahora sirve `frontend/build` si existe; por lo tanto si la plataforma construye el frontend, la app estará accesible desde el mismo host.

## Comandos de prueba local rápido

```bash
# instalar dependencias backend
npm install
# instalar y construir frontend
cd frontend
npm install
npm run build
# volver a la raíz y ejecutar
cd ..
npm start
```

Si quieres, creo los archivos de CI/CD o preparo instrucciones específicas para Railway/Render/Heroku.
