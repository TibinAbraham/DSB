-- Migration: Add customer_id, customer_name, account_no to bank_store_master for store onboarding auto-fill

ALTER TABLE bank_store_master ADD customer_id VARCHAR2(50);
ALTER TABLE bank_store_master ADD customer_name VARCHAR2(150);
ALTER TABLE bank_store_master ADD account_no VARCHAR2(30);
