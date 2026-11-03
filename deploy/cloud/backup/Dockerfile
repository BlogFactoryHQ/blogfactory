FROM postgres:18-alpine

RUN apk add --no-cache age aws-cli curl

COPY backup-lib.sh backup.sh restore-check.sh scheduler.sh /usr/local/bin/

HEALTHCHECK --interval=5m --timeout=10s --start-period=15m --retries=2 \
  CMD test ! -f /var/lib/blogfactory-backup/restore-failed && \
      test -f /var/lib/blogfactory-backup/last-success && \
      test $(( $(date +%s) - $(stat -c %Y /var/lib/blogfactory-backup/last-success) )) -lt 25200

ENTRYPOINT ["/usr/local/bin/scheduler.sh"]
