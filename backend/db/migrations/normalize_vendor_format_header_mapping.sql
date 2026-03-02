-- Migration: Replace header_mapping_json CLOB with normalized table
-- Run this on existing DBs that have vendor_file_format_config with header_mapping_json
-- Oracle 12c+ (JSON_VALUE) required

-- 1. Create normalized header mapping table
CREATE TABLE vendor_file_format_header_mapping (
  format_id     NUMBER NOT NULL,
  mapping_key   VARCHAR2(100) NOT NULL,
  source_column VARCHAR2(255) NOT NULL,
  CONSTRAINT pk_vendor_format_header_mapping PRIMARY KEY (format_id, mapping_key),
  CONSTRAINT fk_header_mapping_format FOREIGN KEY (format_id) REFERENCES vendor_file_format_config(format_id) ON DELETE CASCADE
);

-- 2. Migrate existing JSON data using JSON_VALUE (Oracle 12c+)
INSERT INTO vendor_file_format_header_mapping (format_id, mapping_key, source_column)
SELECT format_id, 'pickup_date_column', JSON_VALUE(header_mapping_json, '$.pickup_date_column')
  FROM vendor_file_format_config WHERE header_mapping_json IS NOT NULL AND JSON_VALUE(header_mapping_json, '$.pickup_date_column') IS NOT NULL
UNION ALL
SELECT format_id, 'pickup_amount_column', JSON_VALUE(header_mapping_json, '$.pickup_amount_column')
  FROM vendor_file_format_config WHERE header_mapping_json IS NOT NULL AND JSON_VALUE(header_mapping_json, '$.pickup_amount_column') IS NOT NULL
UNION ALL
SELECT format_id, 'vendor_store_code_column', JSON_VALUE(header_mapping_json, '$.vendor_store_code_column')
  FROM vendor_file_format_config WHERE header_mapping_json IS NOT NULL AND JSON_VALUE(header_mapping_json, '$.vendor_store_code_column') IS NOT NULL
UNION ALL
SELECT format_id, 'pickup_type_column', JSON_VALUE(header_mapping_json, '$.pickup_type_column')
  FROM vendor_file_format_config WHERE header_mapping_json IS NOT NULL AND JSON_VALUE(header_mapping_json, '$.pickup_type_column') IS NOT NULL
UNION ALL
SELECT format_id, 'account_no_column', JSON_VALUE(header_mapping_json, '$.account_no_column')
  FROM vendor_file_format_config WHERE header_mapping_json IS NOT NULL AND JSON_VALUE(header_mapping_json, '$.account_no_column') IS NOT NULL
UNION ALL
SELECT format_id, 'customer_id_column', JSON_VALUE(header_mapping_json, '$.customer_id_column')
  FROM vendor_file_format_config WHERE header_mapping_json IS NOT NULL AND JSON_VALUE(header_mapping_json, '$.customer_id_column') IS NOT NULL
UNION ALL
SELECT format_id, 'customer_name_column', JSON_VALUE(header_mapping_json, '$.customer_name_column')
  FROM vendor_file_format_config WHERE header_mapping_json IS NOT NULL AND JSON_VALUE(header_mapping_json, '$.customer_name_column') IS NOT NULL
UNION ALL
SELECT format_id, 'remittance_amount_column', JSON_VALUE(header_mapping_json, '$.remittance_amount_column')
  FROM vendor_file_format_config WHERE header_mapping_json IS NOT NULL AND JSON_VALUE(header_mapping_json, '$.remittance_amount_column') IS NOT NULL
UNION ALL
SELECT format_id, 'remittance_date_column', JSON_VALUE(header_mapping_json, '$.remittance_date_column')
  FROM vendor_file_format_config WHERE header_mapping_json IS NOT NULL AND JSON_VALUE(header_mapping_json, '$.remittance_date_column') IS NOT NULL;

COMMIT;

-- 3. Drop the CLOB column
ALTER TABLE vendor_file_format_config DROP COLUMN header_mapping_json;
