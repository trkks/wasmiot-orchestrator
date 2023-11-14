# NOTE: Adapted from:
# https://docs.docker.com/language/rust/develop/#get-and-run-the-sample-application

ARG APP_NAME=wasmiot_orchestrator
FROM rust:1.73 as build
ARG APP_NAME

WORKDIR /app

# Build the application.
# Leverage a cache mount to /usr/local/cargo/registry/
# for downloaded dependencies and a cache mount to /app/target/ for 
# compiled dependencies which will speed up subsequent builds.
# Leverage a bind mount to the src directory to avoid having to copy the
# source code into the container. Once built, copy the executable to an
# output directory before the cache mounted /app/target is unmounted.
RUN --mount=type=bind,source=src,target=src \
    --mount=type=bind,source=Cargo.toml,target=Cargo.toml \
    --mount=type=cache,target=/app/target/ \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    <<EOF
set -e
cargo build --release
cp ./target/release/$APP_NAME /bin/server
EOF


FROM rust:1.73 as devcontainer

COPY --from=build /bin/server /bin/

EXPOSE 8000


# TODO: This debian image is missing required shared library: libssl.so.3
#FROM debian:bullseye-slim AS final
FROM rust:1.73 as final

# Create a non-privileged user that the app will run under.
ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/nonexistent" \
    --shell "/sbin/nologin" \
    --no-create-home \
    --uid "${UID}" \
    orchestratorer
USER orchestratorer

# Copy the executable from the "build" stage.
COPY --from=build /bin/server /bin/

# Expose the port that the application listens on.
EXPOSE 8000

# What the container should run when it is started.
CMD ["/bin/server"]
