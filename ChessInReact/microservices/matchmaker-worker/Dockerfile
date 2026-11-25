# ChessInReact - Matchmaker Worker Microservice (Spec 08 § 5.2)
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Copy microservice source
COPY matchmaker-worker/src ./src

CMD ["node", "src/index.js"]

