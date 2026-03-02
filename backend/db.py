import os

# Force UTF-8 for Oracle CLOB/character data (fixes box chars on Oracle 19c)
os.environ.setdefault("NLS_LANG", "AMERICAN_AMERICA.AL32UTF8")

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Oracle connection (service name)
# Format: oracle+oracledb://USER:PASSWORD@HOST:PORT/?service_name=SERVICE
DATABASE_URL = "oracle+oracledb://system:Oracle123@localhost:1521/?service_name=XEPDB1"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
