from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, CreatedAt


class AgentKeypair(Base):
    __tablename__ = "agent_keypair"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str | None] = mapped_column()
    algorithm: Mapped[str] = mapped_column(default="ssh-ed25519")
    public_key_openssh: Mapped[str] = (
        mapped_column()
    )  # e.g., "ssh-ed25519 AAAA... comment"
    private_key_pem: Mapped[str] = (
        mapped_column()
    )  # OpenSSH/PEM, optionally passphrase-protected
    created_at: Mapped[CreatedAt]
