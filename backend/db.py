import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Set this env var to point to the bank's live Oracle DB.
# Example (service name):
# ORACLE_DATABASE_URL="oracle+oracledb://USER:PASSWORD@HOST:PORT/?service_name=SERVICE"
# Example (SID):
# ORACLE_DATABASE_URL="oracle+oracledb://USER:PASSWORD@HOST:PORT/?sid=SID"
# Note: If the bank requires Oracle Instant Client (thick mode),
# install it on the machine and configure ORACLE_HOME / PATH accordingly.
DATABASE_URL = os.getenv("ORACLE_DATABASE_URL")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
