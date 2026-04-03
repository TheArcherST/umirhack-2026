import re

import psycopg
from psycopg import sql

from hack_backend.core.providers import ConfigHack


def main() -> None:
    config = ConfigHack().postgres

    database_name = config.get_test_database_name()
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", database_name) is None:
        raise ValueError("Test database name contains unsafe characters")

    conninfo = (
        f"host={config.host} "
        f"port={config.port} "
        f"user={config.user} "
        f"password={config.password} "
        f"dbname={config.database}"
    )

    with psycopg.connect(conninfo, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = %s
                  AND pid <> pg_backend_pid()
                """,
                (database_name,),
            )
            cursor.execute(
                sql.SQL("DROP DATABASE IF EXISTS {}").format(
                    sql.Identifier(database_name)
                )
            )
            cursor.execute(
                sql.SQL("CREATE DATABASE {}").format(
                    sql.Identifier(database_name)
                )
            )


if __name__ == "__main__":
    main()
