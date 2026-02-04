-- Doorstep Banking Application - Oracle DDL
-- No DELETE operations. Use status + effective dates.

-- =========================
-- Sequences
-- =========================
CREATE SEQUENCE seq_bank_store_master START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_vendor_master START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_vendor_store_mapping START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_charge_config_master START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_pickup_rules_master START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_vendor_charge_master START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_waiver_master START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_vendor_file_format START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_finacle_upload_batch START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_vendor_upload_batch START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_finacle_raw_staging START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_vendor_raw_staging START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_canonical_txn START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_reconciliation_result START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_reconciliation_correction START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_remittance_entry START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_exception_record START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_finacle_invalid_record START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_vendor_invalid_record START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_user_account START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_approval_request START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_audit_log START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_month_lock START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_vendor_charge_summary START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_customer_charge_summary START WITH 1 INCREMENT BY 1 NOCACHE;

-- =========================
-- Master Tables
-- =========================
CREATE TABLE bank_store_master (
  store_id            NUMBER PRIMARY KEY,
  bank_store_code     VARCHAR2(30) NOT NULL UNIQUE,
  store_name          VARCHAR2(150),
  sol_id              VARCHAR2(20),
  location            VARCHAR2(150),
  frequency           VARCHAR2(30),
  daily_pickup_limit  NUMBER(18,2),
  deposition_branch   VARCHAR2(50),
  deposition_branchname VARCHAR2(150),
  fixed_charge        NUMBER(18,2),
  status              VARCHAR2(10) NOT NULL,
  effective_from      DATE NOT NULL,
  effective_to        DATE,
  created_by          VARCHAR2(50) NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  approved_by         VARCHAR2(50),
  approved_date       DATE,
  CONSTRAINT chk_bank_store_status CHECK (status IN ('ACTIVE','INACTIVE'))
);

CREATE TABLE vendor_master (
  vendor_id           NUMBER PRIMARY KEY,
  vendor_code         VARCHAR2(30) NOT NULL UNIQUE,
  vendor_name         VARCHAR2(150) NOT NULL,
  status              VARCHAR2(10) NOT NULL,
  effective_from      DATE NOT NULL,
  effective_to        DATE,
  created_by          VARCHAR2(50) NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  approved_by         VARCHAR2(50),
  approved_date       DATE,
  CONSTRAINT chk_vendor_status CHECK (status IN ('ACTIVE','INACTIVE'))
);

CREATE TABLE user_account (
  user_id             NUMBER PRIMARY KEY,
  employee_id         VARCHAR2(50) NOT NULL UNIQUE,
  full_name           VARCHAR2(150) NOT NULL,
  role_code           VARCHAR2(20) NOT NULL,
  password_hash       VARCHAR2(255) NOT NULL,
  status              VARCHAR2(10) NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  last_login_date     DATE,
  CONSTRAINT chk_user_status CHECK (status IN ('ACTIVE','INACTIVE'))
);

CREATE TABLE vendor_store_mapping_master (
  mapping_id          NUMBER PRIMARY KEY,
  vendor_id           NUMBER NOT NULL,
  vendor_store_code   VARCHAR2(50) NOT NULL,
  bank_store_code     VARCHAR2(30) NOT NULL,
  customer_id         VARCHAR2(50),
  customer_name       VARCHAR2(150),
  account_no          VARCHAR2(30),
  status              VARCHAR2(10) NOT NULL,
  effective_from      DATE NOT NULL,
  effective_to        DATE,
  created_by          VARCHAR2(50) NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  approved_by         VARCHAR2(50),
  approved_date       DATE,
  CONSTRAINT fk_map_vendor FOREIGN KEY (vendor_id) REFERENCES vendor_master(vendor_id),
  CONSTRAINT chk_mapping_status CHECK (status IN ('ACTIVE','INACTIVE'))
);

CREATE TABLE charge_configuration_master (
  config_id           NUMBER PRIMARY KEY,
  config_code         VARCHAR2(50) NOT NULL UNIQUE,
  config_name         VARCHAR2(150) NOT NULL,
  value_number        NUMBER(18,4),
  value_text          VARCHAR2(200),
  value_date          DATE,
  unit_of_measure     VARCHAR2(30),
  status              VARCHAR2(10) NOT NULL,
  effective_from      DATE NOT NULL,
  effective_to        DATE,
  created_by          VARCHAR2(50) NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  approved_by         VARCHAR2(50),
  approved_date       DATE,
  CONSTRAINT chk_charge_config_status CHECK (status IN ('ACTIVE','INACTIVE'))
);

CREATE TABLE pickup_rules_master (
  rule_id             NUMBER PRIMARY KEY,
  pickup_type         VARCHAR2(10) NOT NULL,
  free_limit          NUMBER(10),
  status              VARCHAR2(10) NOT NULL,
  effective_from      DATE NOT NULL,
  effective_to        DATE,
  created_by          VARCHAR2(50) NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  approved_by         VARCHAR2(50),
  approved_date       DATE,
  CONSTRAINT chk_pickup_type CHECK (pickup_type IN ('BEAT','CALL')),
  CONSTRAINT chk_pickup_rules_status CHECK (status IN ('ACTIVE','INACTIVE'))
);

CREATE TABLE vendor_charge_master (
  vendor_charge_id    NUMBER PRIMARY KEY,
  vendor_id           NUMBER NOT NULL,
  pickup_type         VARCHAR2(10) NOT NULL,
  base_charge         NUMBER(18,2) NOT NULL,
  status              VARCHAR2(10) NOT NULL,
  effective_from      DATE NOT NULL,
  effective_to        DATE,
  created_by          VARCHAR2(50) NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  approved_by         VARCHAR2(50),
  approved_date       DATE,
  CONSTRAINT fk_vendor_charge_vendor FOREIGN KEY (vendor_id) REFERENCES vendor_master(vendor_id),
  CONSTRAINT chk_vendor_charge_type CHECK (pickup_type IN ('BEAT','CALL')),
  CONSTRAINT chk_vendor_charge_status CHECK (status IN ('ACTIVE','INACTIVE'))
);

CREATE TABLE waiver_master (
  waiver_id           NUMBER PRIMARY KEY,
  customer_id         VARCHAR2(50) NOT NULL,
  waiver_type         VARCHAR2(20) NOT NULL,
  waiver_percentage   NUMBER(5,2),
  waiver_cap_amount   NUMBER(18,2),
  waiver_from         DATE NOT NULL,
  waiver_to           DATE,
  status              VARCHAR2(10) NOT NULL,
  created_by          VARCHAR2(50) NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  approved_by         VARCHAR2(50),
  approved_date       DATE,
  CONSTRAINT chk_waiver_type CHECK (waiver_type IN ('PERCENT','CAP','BOTH')),
  CONSTRAINT chk_waiver_status CHECK (status IN ('ACTIVE','INACTIVE'))
);

-- =========================
-- Charge Summaries
-- =========================
CREATE TABLE vendor_charge_summary (
  summary_id          NUMBER PRIMARY KEY,
  vendor_id           NUMBER NOT NULL,
  month_key           VARCHAR2(6) NOT NULL,
  beat_pickups        NUMBER(10) DEFAULT 0,
  call_pickups        NUMBER(10) DEFAULT 0,
  base_charge_amount  NUMBER(18,2) DEFAULT 0,
  enhancement_charge  NUMBER(18,2) DEFAULT 0,
  tax_amount          NUMBER(18,2) DEFAULT 0,
  total_charge_amount NUMBER(18,2) DEFAULT 0,
  total_with_tax      NUMBER(18,2) DEFAULT 0,
  status              VARCHAR2(20) NOT NULL,
  computed_by         VARCHAR2(50) NOT NULL,
  computed_at         DATE DEFAULT SYSDATE NOT NULL,
  CONSTRAINT fk_vendor_charge_summary_vendor FOREIGN KEY (vendor_id) REFERENCES vendor_master(vendor_id),
  CONSTRAINT uq_vendor_charge_summary UNIQUE (vendor_id, month_key)
);

CREATE TABLE customer_charge_summary (
  summary_id          NUMBER PRIMARY KEY,
  customer_id         VARCHAR2(50) NOT NULL,
  month_key           VARCHAR2(6) NOT NULL,
  total_remittance    NUMBER(18,2) DEFAULT 0,
  base_charge_amount  NUMBER(18,2) DEFAULT 0,
  waiver_amount       NUMBER(18,2) DEFAULT 0,
  net_charge_amount   NUMBER(18,2) DEFAULT 0,
  tax_amount          NUMBER(18,2) DEFAULT 0,
  total_with_tax      NUMBER(18,2) DEFAULT 0,
  status              VARCHAR2(20) NOT NULL,
  computed_by         VARCHAR2(50) NOT NULL,
  computed_at         DATE DEFAULT SYSDATE NOT NULL,
  CONSTRAINT uq_customer_charge_summary UNIQUE (customer_id, month_key)
);

CREATE TABLE vendor_file_format_config (
  format_id           NUMBER PRIMARY KEY,
  vendor_id           NUMBER NOT NULL,
  format_name         VARCHAR2(100) NOT NULL,
  header_mapping_json CLOB NOT NULL,
  status              VARCHAR2(10) NOT NULL,
  effective_from      DATE NOT NULL,
  effective_to        DATE,
  created_by          VARCHAR2(50) NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  approved_by         VARCHAR2(50),
  approved_date       DATE,
  CONSTRAINT fk_format_vendor FOREIGN KEY (vendor_id) REFERENCES vendor_master(vendor_id),
  CONSTRAINT chk_format_status CHECK (status IN ('ACTIVE','INACTIVE'))
);

-- =========================
-- Upload Batches & Raw Staging
-- =========================
CREATE TABLE finacle_upload_batch (
  batch_id            NUMBER PRIMARY KEY,
  mis_date            DATE NOT NULL,
  file_name           VARCHAR2(255) NOT NULL,
  uploaded_by         VARCHAR2(50) NOT NULL,
  uploaded_at         DATE DEFAULT SYSDATE NOT NULL,
  status              VARCHAR2(20) NOT NULL,
  CONSTRAINT uq_finacle_batch_date UNIQUE (mis_date),
  CONSTRAINT chk_finacle_batch_status CHECK (status IN ('RECEIVED','PROCESSED','FAILED'))
);

CREATE TABLE vendor_upload_batch (
  batch_id            NUMBER PRIMARY KEY,
  vendor_id           NUMBER NOT NULL,
  mis_date            DATE NOT NULL,
  file_name           VARCHAR2(255) NOT NULL,
  uploaded_by         VARCHAR2(50) NOT NULL,
  uploaded_at         DATE DEFAULT SYSDATE NOT NULL,
  status              VARCHAR2(20) NOT NULL,
  CONSTRAINT fk_vendor_batch_vendor FOREIGN KEY (vendor_id) REFERENCES vendor_master(vendor_id),
  CONSTRAINT uq_vendor_batch UNIQUE (vendor_id, mis_date),
  CONSTRAINT chk_vendor_batch_status CHECK (status IN ('RECEIVED','PROCESSED','FAILED'))
);

CREATE TABLE finacle_raw_staging (
  raw_id              NUMBER PRIMARY KEY,
  batch_id            NUMBER NOT NULL,
  row_number          NUMBER NOT NULL,
  row_payload         CLOB NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  CONSTRAINT fk_finacle_raw_batch FOREIGN KEY (batch_id) REFERENCES finacle_upload_batch(batch_id)
);

CREATE TABLE finacle_invalid_records (
  invalid_id          NUMBER PRIMARY KEY,
  batch_id            NUMBER NOT NULL,
  row_number          NUMBER NOT NULL,
  reason              VARCHAR2(255) NOT NULL,
  row_payload         CLOB NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  CONSTRAINT fk_finacle_invalid_batch FOREIGN KEY (batch_id) REFERENCES finacle_upload_batch(batch_id)
);

CREATE TABLE vendor_raw_staging (
  raw_id              NUMBER PRIMARY KEY,
  batch_id            NUMBER NOT NULL,
  row_number          NUMBER NOT NULL,
  row_payload         CLOB NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  CONSTRAINT fk_vendor_raw_batch FOREIGN KEY (batch_id) REFERENCES vendor_upload_batch(batch_id)
);

CREATE TABLE vendor_invalid_records (
  invalid_id          NUMBER PRIMARY KEY,
  batch_id            NUMBER NOT NULL,
  row_number          NUMBER NOT NULL,
  reason              VARCHAR2(255) NOT NULL,
  row_payload         CLOB NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  CONSTRAINT fk_vendor_invalid_batch FOREIGN KEY (batch_id) REFERENCES vendor_upload_batch(batch_id)
);

-- =========================
-- Canonical Data Model
-- =========================
CREATE TABLE canonical_transactions (
  canonical_id        NUMBER PRIMARY KEY,
  source              VARCHAR2(10) NOT NULL,
  bank_store_code     VARCHAR2(30) NOT NULL,
  vendor_store_code   VARCHAR2(50),
  account_no          VARCHAR2(30),
  customer_id         VARCHAR2(50),
  pickup_date         DATE,
  remittance_date     DATE,
  pickup_amount       NUMBER(18,2),
  remittance_amount   NUMBER(18,2),
  pickup_type         VARCHAR2(10),
  raw_batch_id        NUMBER NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  CONSTRAINT chk_canonical_source CHECK (source IN ('FINACLE','VENDOR')),
  CONSTRAINT chk_canonical_pickup_type CHECK (pickup_type IN ('BEAT','CALL'))
);

-- =========================
-- Remittance Entries
-- =========================
CREATE TABLE remittance_entries (
  remittance_id       NUMBER PRIMARY KEY,
  canonical_id        NUMBER NOT NULL,
  source              VARCHAR2(10) NOT NULL,
  status              VARCHAR2(20) NOT NULL,
  rejection_reason    VARCHAR2(255),
  created_by          VARCHAR2(50) NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  approved_by         VARCHAR2(50),
  approved_date       DATE,
  closed_date         DATE,
  CONSTRAINT fk_remittance_canonical FOREIGN KEY (canonical_id) REFERENCES canonical_transactions(canonical_id),
  CONSTRAINT chk_remittance_status CHECK (
    status IN ('UPLOADED','VALIDATED','APPROVED','REJECTED','CLOSED')
  )
);

-- =========================
-- Reconciliation Results
-- =========================
CREATE TABLE reconciliation_results (
  recon_id            NUMBER PRIMARY KEY,
  finacle_canonical_id NUMBER,
  vendor_canonical_id  NUMBER,
  bank_store_code     VARCHAR2(30) NOT NULL,
  pickup_date         DATE,
  remittance_date     DATE,
  pickup_amount       NUMBER(18,2),
  remittance_amount   NUMBER(18,2),
  status              VARCHAR2(20) NOT NULL,
  reason              VARCHAR2(255),
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  CONSTRAINT chk_recon_status CHECK (
    status IN ('MATCHED','AMOUNT_MISMATCH','DATE_MISMATCH','MISSING_FINACLE','MISSING_VENDOR')
  )
);

-- =========================
-- Exception Records
-- =========================
CREATE TABLE exception_records (
  exception_id        NUMBER PRIMARY KEY,
  recon_id            NUMBER,
  exception_type      VARCHAR2(50) NOT NULL,
  status              VARCHAR2(20) NOT NULL,
  details             VARCHAR2(255),
  remarks             VARCHAR2(255),
  created_by          VARCHAR2(50) NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  resolved_by         VARCHAR2(50),
  resolved_date       DATE,
  CONSTRAINT fk_exception_recon FOREIGN KEY (recon_id) REFERENCES reconciliation_results(recon_id),
  CONSTRAINT chk_exception_status CHECK (status IN ('OPEN','RESOLVED','ESCALATED'))
);

-- =========================
-- Maker-Checker Approvals
-- =========================
CREATE TABLE approval_requests (
  approval_id         NUMBER PRIMARY KEY,
  entity_type         VARCHAR2(50) NOT NULL,
  entity_id           NUMBER,
  original_data       CLOB NOT NULL,
  proposed_data       CLOB NOT NULL,
  reason              VARCHAR2(255),
  maker_id            VARCHAR2(50) NOT NULL,
  checker_id          VARCHAR2(50),
  checker_comment     VARCHAR2(255),
  comments_history    CLOB,
  status              VARCHAR2(20) NOT NULL,
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  approved_date       DATE,
  CONSTRAINT chk_approval_status CHECK (status IN ('PENDING','APPROVED','REJECTED','CLARIFICATION'))
);

-- =========================
-- Reconciliation Corrections
-- =========================
CREATE TABLE reconciliation_corrections (
  correction_id       NUMBER PRIMARY KEY,
  recon_id            NUMBER NOT NULL,
  approval_id         NUMBER NOT NULL,
  proposed_data       CLOB NOT NULL,
  status              VARCHAR2(20) NOT NULL,
  maker_id            VARCHAR2(50) NOT NULL,
  checker_id          VARCHAR2(50),
  created_date        DATE DEFAULT SYSDATE NOT NULL,
  approved_date       DATE,
  CONSTRAINT fk_corr_recon FOREIGN KEY (recon_id) REFERENCES reconciliation_results(recon_id),
  CONSTRAINT fk_corr_approval FOREIGN KEY (approval_id) REFERENCES approval_requests(approval_id),
  CONSTRAINT chk_corr_status CHECK (status IN ('PENDING','APPROVED','REJECTED'))
);

-- =========================
-- Audit Logs
-- =========================
CREATE TABLE audit_log (
  audit_id            NUMBER PRIMARY KEY,
  entity_type         VARCHAR2(50) NOT NULL,
  entity_id           NUMBER,
  action              VARCHAR2(50) NOT NULL,
  old_data            CLOB,
  new_data            CLOB,
  changed_by          VARCHAR2(50) NOT NULL,
  changed_at          DATE DEFAULT SYSDATE NOT NULL
);

-- =========================
-- Month End Lock
-- =========================
CREATE TABLE month_lock (
  lock_id             NUMBER PRIMARY KEY,
  month_key           VARCHAR2(6) NOT NULL UNIQUE,
  status              VARCHAR2(10) NOT NULL,
  locked_by           VARCHAR2(50),
  locked_at           DATE,
  CONSTRAINT chk_month_lock_status CHECK (status IN ('OPEN','LOCKED'))
);

-- =========================
-- Optional Seed Data (examples)
-- =========================
-- Charge Configuration (required codes for charge engine)
-- INSERT INTO charge_configuration_master
--   (config_id, config_code, config_name, value_number, value_text, status, effective_from, created_by)
-- VALUES
--   (seq_charge_config_master.nextval, 'ENHANCEMENT_THRESHOLD_AMOUNT', 'Enhancement threshold', 50000, NULL, 'ACTIVE', SYSDATE, 'SYSTEM');
-- INSERT INTO charge_configuration_master
--   (config_id, config_code, config_name, value_number, value_text, status, effective_from, created_by)
-- VALUES
--   (seq_charge_config_master.nextval, 'ENHANCEMENT_CHARGE_AMOUNT', 'Enhancement charge', 60, NULL, 'ACTIVE', SYSDATE, 'SYSTEM');
-- INSERT INTO charge_configuration_master
--   (config_id, config_code, config_name, value_number, value_text, status, effective_from, created_by)
-- VALUES
--   (seq_charge_config_master.nextval, 'GST_ENABLED', 'GST enabled', NULL, 'Y', 'ACTIVE', SYSDATE, 'SYSTEM');
-- INSERT INTO charge_configuration_master
--   (config_id, config_code, config_name, value_number, value_text, status, effective_from, created_by)
-- VALUES
--   (seq_charge_config_master.nextval, 'GST_RATE_PERCENT', 'GST percent', 18, NULL, 'ACTIVE', SYSDATE, 'SYSTEM');
-- INSERT INTO charge_configuration_master
--   (config_id, config_code, config_name, value_number, value_text, status, effective_from, created_by)
-- VALUES
--   (seq_charge_config_master.nextval, 'CUSTOMER_CHARGE_RATE_PERCENT', 'Customer charge rate', 0.5, NULL, 'ACTIVE', SYSDATE, 'SYSTEM');
--
-- Vendor file format mapping example (replace :vendor_id)
-- INSERT INTO vendor_file_format_config
--   (format_id, vendor_id, format_name, header_mapping_json, status, effective_from, created_by)
-- VALUES
--   (seq_vendor_file_format.nextval, :vendor_id, 'Default format',
--    '{"pickup_date_column":"PickUpDate","pickup_amount_column":"Total","vendor_store_code_column":"Pickup Point Code","pickup_type_column":"Beat/oncall","account_no_column":"AccountCode","customer_id_column":"HCM_COUSTOMERCODE","customer_name_column":"CustomerName"}',
--    'ACTIVE', SYSDATE, 'SYSTEM');
