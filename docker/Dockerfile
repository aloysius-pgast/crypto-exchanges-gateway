FROM node:alpine as builder
WORKDIR /root/
ARG GIT_BRANCH
RUN apk add --update bash git && \
    git clone https://github.com/aloysius-pgast/crypto-exchanges-gateway.git && cd crypto-exchanges-gateway && \
    git checkout $GIT_BRANCH && \
    npm install && cp docker/config.docker.json config/config.json

FROM node:alpine
WORKDIR /root/crypto-exchanges-gateway/
COPY --from=builder /root/crypto-exchanges-gateway .
EXPOSE 8000
CMD ["node", "./gateway.js"]
