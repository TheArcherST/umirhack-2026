from typing import TYPE_CHECKING, Any

from requests import Request


class PatchedRequest(Request):
    path_params: dict[str, Any]

    if TYPE_CHECKING:

        def __init__(
            self,
            method=None,
            url=None,
            headers=None,
            files=None,
            data=None,
            params=None,
            auth=None,
            cookies=None,
            hooks=None,
            json=None,
            path_params: dict[str, Any] = None,
        ): ...
    else:

        def __init__(
            self,
            *args,
            path_params=None,
            **kwargs,
        ):
            super().__init__(*args, **kwargs)
            self.path_params = path_params or dict()
