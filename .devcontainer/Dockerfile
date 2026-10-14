FROM node:24

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    BYOK_IS_SANDBOXED=true

# gh from GitHub's apt repository; the rest for the agent's comfort
RUN mkdir -p -m 755 /etc/apt/keyrings \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
 && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh jq less lsof ripgrep \
 && rm -rf /var/lib/apt/lists/*

# Doppler's installer checks the package signature with gpg, which node:24 carries
RUN corepack enable

# Claude Code's settings for every sandbox, above anything in the config volume
COPY files/claude-managed-settings.json /etc/claude-code/managed-settings.json

# Volumes mount at these paths (see devcontainer.json). A new volume takes its owner from the
# directory the image holds there, so each must exist, node's, before the container starts.
# pnpm keeps its store inside the node_modules volume, the one filesystem it can hard-link on.
ARG REPO
RUN mkdir -p /workspace/${REPO}/node_modules /home/node/.claude \
 && chown -R node:node /workspace /home/node/.claude

USER node

RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH=/home/node/.local/bin:$PATH
