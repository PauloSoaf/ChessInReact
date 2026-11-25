# ChessInReact - Stateful Game Server Microservice (Spec 08 § 7.1)
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Copy microservice source
COPY game-stateful/src ./src

EXPOSE 2567

CMD ["node", "src/index.js"]

