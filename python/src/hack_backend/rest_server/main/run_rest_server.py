import uvicorn

from hack_backend.rest_server.app import create_app


def main():
    app = create_app()

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=80,
    )


if __name__ == "__main__":
    main()
