-- Runs once when the local Postgres volume is first created.
-- A separate database for automated tests (tests reset its schema freely).
CREATE DATABASE phistream_test;
