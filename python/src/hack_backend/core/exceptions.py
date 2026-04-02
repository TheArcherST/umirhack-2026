class DomainValueError(ValueError):
    """
    Indicates that some core domain element was called with incorrect value
    """

    def __init__(self, *args, detail: str):
        super().__init__(*args)
        self.detail = detail
