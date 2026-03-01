-- Dummy user accounts for user_account table
-- When AD is used: password is validated by AD; password_hash is a placeholder.
-- When AD_SKIP=true: these users still require AD validation (use test_maker, test_checker, etc. for local dev).

INSERT INTO user_account (user_id, employee_id, full_name, role_code, password_hash, status, created_date)
VALUES (seq_user_account.nextval, 'FED001', 'Maker User', 'MAKER', 'AD', 'ACTIVE', SYSDATE);

INSERT INTO user_account (user_id, employee_id, full_name, role_code, password_hash, status, created_date)
VALUES (seq_user_account.nextval, 'FED002', 'Checker User', 'CHECKER', 'AD', 'ACTIVE', SYSDATE);

INSERT INTO user_account (user_id, employee_id, full_name, role_code, password_hash, status, created_date)
VALUES (seq_user_account.nextval, 'FED003', 'Admin User', 'ADMIN', 'AD', 'ACTIVE', SYSDATE);
