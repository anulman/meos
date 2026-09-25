# Build assets on the host with the pinned lockfile; no build toolchain is shipped.
FROM nginx:1.29.1-alpine
COPY dist/client/ /usr/share/nginx/html/
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/40-config.sh /docker-entrypoint.d/40-config.sh
RUN chmod +x /docker-entrypoint.d/40-config.sh
