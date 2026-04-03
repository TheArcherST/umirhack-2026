FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=/api
ARG VITE_API_DOCS_URL=/api/docs

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_API_DOCS_URL=${VITE_API_DOCS_URL}

RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app

RUN npm install -g serve

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
