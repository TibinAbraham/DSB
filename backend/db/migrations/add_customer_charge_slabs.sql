-- Migration: Add customer charge slabs and enhancement_charge to customer_charge_summary
-- Run this if you have an existing deployment.

-- Add enhancement_charge to customer_charge_summary (if not exists)
-- Oracle:
-- ALTER TABLE customer_charge_summary ADD enhancement_charge NUMBER(18,2) DEFAULT 0;

-- Create sequence for customer_charge_slabs
CREATE SEQUENCE seq_customer_charge_slab START WITH 1 INCREMENT BY 1 NOCACHE;

-- Create customer_charge_slabs table
CREATE TABLE customer_charge_slabs (
  slab_id            NUMBER PRIMARY KEY,
  vendor_id          NUMBER NOT NULL,
  amount_from        NUMBER(18,2) NOT NULL,
  amount_to          NUMBER(18,2) NOT NULL,
  charge_amount      NUMBER(18,2) NOT NULL,
  slab_label         VARCHAR2(100),
  status             VARCHAR2(10) NOT NULL,
  effective_from     DATE NOT NULL,
  effective_to       DATE,
  created_by         VARCHAR2(50) NOT NULL,
  created_date       DATE DEFAULT SYSDATE NOT NULL,
  approved_by        VARCHAR2(50),
  approved_date      DATE,
  CONSTRAINT fk_customer_slab_vendor FOREIGN KEY (vendor_id) REFERENCES vendor_master(vendor_id),
  CONSTRAINT chk_customer_slab_status CHECK (status IN ('ACTIVE','INACTIVE'))
);
