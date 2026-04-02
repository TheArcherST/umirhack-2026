FROM debian:stable-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssh-server ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# unprivileged user and sshd runtime dir
ARG SSH_USER=appuser
RUN useradd -m -s /bin/sh ${SSH_USER} && \
    mkdir -p /home/${SSH_USER}/.ssh /var/run/sshd && \
    chown -R ${SSH_USER}:${SSH_USER} /home/${SSH_USER}/.ssh && \
    chmod 700 /home/${SSH_USER}/.ssh && \
    # remove (empty) password so account is *unlocked* but can't use passwords
    passwd -d ${SSH_USER}

# host keys generated at container start
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# hardened sshd
COPY sshd_config /etc/ssh/sshd_config

EXPOSE 22
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/usr/sbin/sshd","-D","-e"]
