# Multi-stage Dockerfile: build frontend, then build backend image

# Stage 1: build frontend
FROM node:18-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./frontend/
WORKDIR /app/frontend
RUN npm install --production=false --silent
COPY frontend ./
RUN npm run build

# Stage 2: build backend image
FROM node:18-alpine
WORKDIR /app
# install backend deps
COPY package.json package-lock.json* ./
RUN npm install --production --silent
# copy app source
COPY . .
# copy built frontend
COPY --from=frontend-build /app/frontend/build ./frontend/build
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "index.js"]
