-- Stage 0: the ground. Extensions the later stages rely on, and nothing else.
--   pgcrypto: gen_random_uuid() for ids
--   vector:   pgvector, for Poocho's hybrid search (Stage 9)
create extension if not exists pgcrypto;
create extension if not exists vector;
