-- Drop SSN (sensitive PII) from the TMS drivers source table.
ALTER TABLE tms_drivers DROP COLUMN soc_sec_no;
