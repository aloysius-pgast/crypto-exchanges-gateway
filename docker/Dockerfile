FROM node:alpine as builder
WORKDIR /root/
RUN apk add --update bash git && \
    git clone https://github.com/aloysius-pgast/crypto-exchanges-gateway.git && cd crypto-exchanges-gateway && \
    npm install && cp /root/docker/config.docker.json config/config.json

FROM node:alpine
WORKDIR /root/crypto-exchanges-gateway/
COPY --from=builder /root/crypto-exchanges-gateway .
CMD ["node", "./gateway.js"]
