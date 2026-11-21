class MonemeeError(Exception):
    """Fehler bei der Kommunikation mit Monemee oder in der Konfiguration."""

    def __init__(self, message, code=None, status=None):
        super().__init__(message)
        self.code = code
        self.status = status
