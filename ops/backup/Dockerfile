FROM postgres:17-alpine

RUN apk add --no-cache restic tzdata \
    && mkdir -p /scratch \
    && chown postgres:postgres /scratch
COPY --chmod=755 backup.sh /usr/local/bin/backup
COPY --chmod=755 restic.sh /usr/local/bin/restic-wrapper
USER postgres
ENTRYPOINT ["/usr/local/bin/backup"]
