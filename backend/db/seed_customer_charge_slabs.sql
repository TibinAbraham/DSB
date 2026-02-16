-- Seed Customer Charge Slabs (reference from charge slab image)
-- Replace :vendor_id with actual vendor_id when adding slabs for a vendor.
-- Run after customer_charge_slabs table exists.

-- Example: Insert default slabs for vendor_id 1
/*
INSERT INTO customer_charge_slabs (slab_id, vendor_id, amount_from, amount_to, charge_amount, slab_label, status, effective_from, created_by)
SELECT seq_customer_charge_slab.nextval, 1, 0, 50000, 4000, 'Upto 50K', 'ACTIVE', SYSDATE, 'SYSTEM' FROM dual
UNION ALL SELECT seq_customer_charge_slab.nextval, 1, 50001, 100000, 4500, 'Above 50K to 1L', 'ACTIVE', SYSDATE, 'SYSTEM' FROM dual
UNION ALL SELECT seq_customer_charge_slab.nextval, 1, 100001, 200000, 5750, 'Above 1L to 2L', 'ACTIVE', SYSDATE, 'SYSTEM' FROM dual
UNION ALL SELECT seq_customer_charge_slab.nextval, 1, 200001, 400000, 8750, 'Above 2L to 4L', 'ACTIVE', SYSDATE, 'SYSTEM' FROM dual
UNION ALL SELECT seq_customer_charge_slab.nextval, 1, 400001, 600000, 12000, 'Above 4L to 6L', 'ACTIVE', SYSDATE, 'SYSTEM' FROM dual
UNION ALL SELECT seq_customer_charge_slab.nextval, 1, 600001, 800000, 16000, 'Above 6L to 8L', 'ACTIVE', SYSDATE, 'SYSTEM' FROM dual
UNION ALL SELECT seq_customer_charge_slab.nextval, 1, 800001, 1000000, 18500, 'Above 8L to 10L', 'ACTIVE', SYSDATE, 'SYSTEM' FROM dual
UNION ALL SELECT seq_customer_charge_slab.nextval, 1, 1000001, 1500000, 26000, 'Above 10L to 15L', 'ACTIVE', SYSDATE, 'SYSTEM' FROM dual
UNION ALL SELECT seq_customer_charge_slab.nextval, 1, 1500001, 2000000, 33000, 'Above 15L to 20L', 'ACTIVE', SYSDATE, 'SYSTEM' FROM dual
UNION ALL SELECT seq_customer_charge_slab.nextval, 1, 2000001, 5000000, 42000, 'Above 20L to 50L', 'ACTIVE', SYSDATE, 'SYSTEM' FROM dual
UNION ALL SELECT seq_customer_charge_slab.nextval, 1, 5000001, 10000000, 58500, 'Above 50L to 1 Cr', 'ACTIVE', SYSDATE, 'SYSTEM' FROM dual;
*/
