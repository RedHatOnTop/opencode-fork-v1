# Alpine-based sandbox image for opencode-fork-v1
#
# This image provides an isolated Linux environment where the AI agent's
# bash commands are executed. The host project directory is volume-mounted
# at /workspace so file operations are reflected on both sides instantly.
#
# Build (manual):
#   docker build -t opencode-sandbox:alpine packages/containers/sandbox
#
# Usage (automatic):
#   The sandbox module auto-creates a container per session using this image.
#   If the image doesn't exist locally, it's built automatically from alpine:3.21.
#   No manual `docker run` needed.

FROM alpine:3.21

# Essential development tools that AI agents commonly use
RUN apk add --no-cache \
    bash \
    curl \
    git \
    jq \
    nodejs \
    npm \
    python3 \
    py3-pip \
    ripgrep \
    build-base

# The container boundary provides isolation — host filesystem is
# accessed only through the volume mount at /workspace.
WORKDIR /workspace

# Keep the container alive with a no-op that blocks indefinitely
# (the lifecycle module uses `docker exec` for all interaction)
ENTRYPOINT ["tail", "-f", "/dev/null"]
