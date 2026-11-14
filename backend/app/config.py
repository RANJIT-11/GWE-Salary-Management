import os


class Settings:
    app_name: str = "Host PT Salary API"
    frontend_origin: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")


settings = Settings()
