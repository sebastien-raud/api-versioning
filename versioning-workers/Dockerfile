# Stage 1: Build
FROM node:24-alpine AS builder

ARG GIT_USER_NAME
ARG GIT_USER_EMAIL

# Setup Git and SSH
RUN apk add --no-cache git openssh && \
    mkdir -p /root/.ssh && chmod 700 /root/.ssh

COPY ssh/id_ed25519 /root/.ssh/id_ed25519
COPY ssh/id_ed25519.pub /root/.ssh/id_ed25519.pub
RUN chmod 600 /root/.ssh/id_ed25519 && chmod 644 /root/.ssh/id_ed25519.pub && \
    ssh-keyscan -t rsa,ed25519 github.com >> /root/.ssh/known_hosts 2>/dev/null && \
    echo "Host github.com\n  HostName github.com\n  User git\n  IdentityFile /root/.ssh/id_ed25519\n  StrictHostKeyChecking=accept-new" > /root/.ssh/config && \
    chmod 600 /root/.ssh/config && \
    git config --global user.name "${GIT_USER_NAME}" && \
    git config --global user.email "${GIT_USER_EMAIL}" && \
    git config --global --add safe.directory '*'

WORKDIR /srv/app

# Copy package files
COPY versioning-workers/package*.json ./

# Install dependencies
RUN npm install

# Stage 2: Runtime
FROM node:24-alpine

ARG GIT_USER_NAME
ARG GIT_USER_EMAIL

# Setup Git and SSH
RUN apk add --no-cache git openssh && \
    mkdir -p /root/.ssh && chmod 700 /root/.ssh

COPY ssh/id_ed25519 /root/.ssh/id_ed25519
COPY ssh/id_ed25519.pub /root/.ssh/id_ed25519.pub
RUN chmod 600 /root/.ssh/id_ed25519 && chmod 644 /root/.ssh/id_ed25519.pub && \
    ssh-keyscan -t rsa,ed25519 github.com >> /root/.ssh/known_hosts 2>/dev/null && \
    echo "Host github.com\n  HostName github.com\n  User git\n  IdentityFile /root/.ssh/id_ed25519\n  StrictHostKeyChecking=accept-new" > /root/.ssh/config && \
    chmod 600 /root/.ssh/config && \
    git config --global user.name "${GIT_USER_NAME}" && \
    git config --global user.email "${GIT_USER_EMAIL}" && \
    git config --global --add safe.directory '*'

WORKDIR /srv/app

# Copy node_modules from builder
COPY --from=builder /srv/app/node_modules ./node_modules

# Copy application source
COPY versioning-workers/ .

# Creates table operations
#RUN node createDb.js

CMD ["npm", "start"]
