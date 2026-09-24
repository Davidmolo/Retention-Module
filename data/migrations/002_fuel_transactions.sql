-- Fuel-card transaction extracts (sftp-files/*.dat).
-- See docs/file-formats.md for the fixed-width record layout.

-- One row per .dat extract file delivered over SFTP.
CREATE TABLE IF NOT EXISTS fuel_batches (
  id INT PRIMARY KEY AUTO_INCREMENT,
  file_name VARCHAR(255) NOT NULL UNIQUE,   -- e.g. EXT_20_2025-11-03.dat
  file_date DATE NOT NULL,                  -- parsed from the filename
  file_sequence VARCHAR(16) NULL,           -- the EXTxxx / EXT_xx token
  record_count INT NOT NULL DEFAULT 0,      -- number of '01' detail rows imported
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_fuel_batches_date (file_date)
);

-- One row per '01' detail record. Offsets referenced in comments are 0-based
-- half-open ranges into the 378-char fixed-width line.
CREATE TABLE IF NOT EXISTS fuel_transactions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  batch_id INT NOT NULL,
  record_type CHAR(2) NOT NULL DEFAULT '01',      -- [0:2]
  account_number VARCHAR(16) NULL,                -- [2:11]
  transaction_date DATE NULL,                     -- [11:17] YYMMDD
  transaction_seq VARCHAR(8) NULL,                -- [17:20]
  transaction_code VARCHAR(4) NULL,               -- [23:25]
  merchant_name VARCHAR(64) NULL,                 -- [37:52]
  merchant_city VARCHAR(48) NULL,                 -- [52:64]
  merchant_state CHAR(2) NULL,                    -- [64:66]
  store_number VARCHAR(16) NULL,                  -- [66:74]
  gallons DECIMAL(10,3) NULL,                     -- [96:103]  (scale provisional)
  price_per_gallon DECIMAL(10,4) NULL,            -- [103:110] (scale provisional)
  amount DECIMAL(12,2) NULL,                      -- [110:117] (scale provisional)
  driver_name VARCHAR(64) NULL,                   -- [157:169]
  card_number VARCHAR(24) NULL,                   -- [212:229] 'U' + 16 digits
  driver_unit_id VARCHAR(16) NULL,                -- [256:264]
  reference_number VARCHAR(16) NULL,              -- [280:285]
  product_code VARCHAR(8) NULL,                   -- [287:290]
  raw_record VARCHAR(400) NULL,                   -- full 378-char line for reprocessing
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ftx_batch FOREIGN KEY (batch_id) REFERENCES fuel_batches(id) ON DELETE CASCADE,
  KEY idx_ftx_txn_date (transaction_date),
  KEY idx_ftx_card (card_number),
  KEY idx_ftx_driver (driver_name),
  KEY idx_ftx_state (merchant_state)
);
