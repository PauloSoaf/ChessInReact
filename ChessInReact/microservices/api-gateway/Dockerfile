# ChessInReact - API Gateway Microservice (Spec 08 § 5.1)
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Copy microservice source
COPY api-gateway/src ./src

EXPOSE 3000

CMD ["node", "src/index.js"]

