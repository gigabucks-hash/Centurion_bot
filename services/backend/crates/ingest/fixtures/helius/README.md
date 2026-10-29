Synthetic fixtures for `source/helius.rs` tests, built from the public Anchor event layout
(discriminator = sha256("event:<Name>")[..8], borsh fields). Not captured traffic: before enabling the
Helius source in staging, add one captured `logsNotification` per event type and assert it decodes.
All addresses are well-known system ids or the test mint; nothing here is a secret.
