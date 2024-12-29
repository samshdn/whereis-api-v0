FROM denoland/deno
WORKDIR /app
COPY . .
RUN deno cache main.ts
CMD ["run", "--import-map=import_map.json", "--allow-import","--allow-net", "--allow-env", "--allow-read", "--allow-write","main.ts"]