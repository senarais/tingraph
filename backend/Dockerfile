FROM golang:1.26.8-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/import-legacy ./cmd/import-legacy

FROM alpine:3.22

RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S -g 10001 tingraph \
    && adduser -S -D -H -u 10001 -G tingraph tingraph \
    && mkdir -p /var/lib/tingraph/uploads \
    && chown -R tingraph:tingraph /var/lib/tingraph
COPY --from=build /out/api /app/api
COPY --from=build /out/migrate /app/migrate
COPY --from=build /out/import-legacy /app/import-legacy

USER 10001:10001
EXPOSE 8080
CMD ["/app/api"]
