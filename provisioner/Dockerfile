# syntax=docker/dockerfile:1

FROM golang:1.24-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/yole-provisioner ./cmd/yole-provisioner

FROM alpine:3.21
RUN adduser -D -H -u 10001 yole \
    && mkdir -p /data \
    && chown -R yole:yole /data
USER yole
WORKDIR /app
COPY --from=build /out/yole-provisioner /usr/local/bin/yole-provisioner

EXPOSE 8080
ENTRYPOINT ["yole-provisioner"]
