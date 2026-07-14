-- ============================================
-- TimePick - Initial Database Schema
-- ============================================
-- This consolidated migration replaces migrations 004-014
--
-- The 'users' table is created separately (typically via manual setup or
-- external script). This migration adds the additional columns and creates
-- all other tables required for TimePick functionality.
--
-- Created: 2026-01-25
-- Story: 9.5 - Consolidation des Migrations de Base de Données
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- FUNCTION: Auto-update updated_at
-- ============================================
-- Reusable trigger function for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================
-- TABLE: users - Additional Columns
-- ============================================
-- Note: The base 'users' table should already exist with:
--   id, email, phone, full_name, role, created_at
--
-- This migration adds magic link authentication columns:
ALTER TABLE users
ADD COLUMN IF NOT EXISTS magic_link_token TEXT,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP;

-- Add comments for documentation
COMMENT ON COLUMN users.magic_link_token IS 'JWT token for magic link authentication (can be regenerated)';
COMMENT ON COLUMN users.token_expires_at IS 'Expiration timestamp for the magic link token';

-- ============================================
-- TABLE: events
-- ============================================
-- Stores volunteer events with draft/published workflow
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    invitation_template TEXT,
    is_published BOOLEAN DEFAULT false,
    opens_at TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT events_name_key UNIQUE (name)
);

-- Index for searching by name
CREATE INDEX IF NOT EXISTS idx_events_name ON events(name);

-- Index for published events (partial index for better performance)
CREATE INDEX IF NOT EXISTS idx_events_published ON events(is_published) WHERE is_published = true;

-- Create trigger for events table (drop first to avoid duplicate)
DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON COLUMN events.name IS 'Event name (required, max 200 characters)';
COMMENT ON COLUMN events.description IS 'Detailed description of the event';
COMMENT ON COLUMN events.is_published IS 'Whether the event is published (draft if false)';
COMMENT ON COLUMN events.opens_at IS 'Optional date when registrations open (null means immediately)';
COMMENT ON COLUMN events.invitation_template IS 'Custom HTML email template for event invitations (null = use default template)';

-- ============================================
-- TABLE: app_config
-- ============================================
-- Stores global application configuration
CREATE TABLE IF NOT EXISTS app_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed with default configuration values
INSERT INTO app_config (key, value) VALUES
    ('organization_name', 'Mon Association'),
    ('organization_logo', ''),
    ('organization_description', 'Plateforme de participation'),
    ('polling_interval', '30000'),
    ('magic_link_admin_ttl', '86400'),      -- 24 heures
    ('magic_link_user_ttl', '604800'),      -- 7 jours
    ('session_ttl', '7200')                 -- 2 heures
ON CONFLICT (key) DO NOTHING;

-- Add comments for documentation
COMMENT ON COLUMN app_config.key IS 'Configuration key (unique identifier)';
COMMENT ON COLUMN app_config.value IS 'Configuration value (stored as text)';

-- ============================================
-- TABLE: event_users (many-to-many)
-- ============================================
-- Junction table linking events to authorized users
CREATE TABLE IF NOT EXISTS event_users (
    event_id UUID NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, user_id),
    CONSTRAINT fk_event_users_event
        FOREIGN KEY (event_id)
        REFERENCES events(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_event_users_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_event_users_event_id ON event_users(event_id);
CREATE INDEX IF NOT EXISTS idx_event_users_user_id ON event_users(user_id);

-- Comment on table
COMMENT ON TABLE event_users IS 'Relation many-to-many entre événements et utilisateurs autorisés';

-- ============================================
-- TABLE: slots
-- ============================================
-- Stores volunteer time slots for events with capacity management
CREATE TABLE IF NOT EXISTS slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    capacity INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT slots_end_after_start CHECK (end_time > start_time),
    CONSTRAINT slots_capacity_positive CHECK (capacity > 0),
    CONSTRAINT fk_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- Index for queries by event
CREATE INDEX IF NOT EXISTS idx_slots_event_id ON slots(event_id);

-- Index for chronological sorting
CREATE INDEX IF NOT EXISTS idx_slots_start_time ON slots(start_time);

-- Comments for documentation
COMMENT ON COLUMN slots.event_id IS 'Référence à l''événement (FK vers events.id)';
COMMENT ON COLUMN slots.start_time IS 'Date et heure de début du créneau';
COMMENT ON COLUMN slots.end_time IS 'Date et heure de fin du créneau';
COMMENT ON COLUMN slots.capacity IS 'Nombre maximum de participants pour ce créneau';

-- Trigger for updated_at (reuse existing function)
DROP TRIGGER IF EXISTS update_slots_updated_at ON slots;
CREATE TRIGGER update_slots_updated_at
    BEFORE UPDATE ON slots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MIGRATION: Add description to slots
-- ============================================
-- Story 04-01: Time slot description field
ALTER TABLE slots
ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN slots.description IS 'Description facultative du créneau (max 500 caractères)';

-- ============================================
-- TABLE: invitations
-- ============================================
-- Stores invitation tracking for magic links sent to event users
CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    clicked_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'sent' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT invitations_event_user_unique UNIQUE (event_id, user_id),
    CONSTRAINT invitations_status_check CHECK (status IN ('sent', 'clicked', 'failed'))
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_invitations_event_id ON invitations(event_id);
CREATE INDEX IF NOT EXISTS idx_invitations_user_id ON invitations(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

-- Comments for documentation
COMMENT ON COLUMN invitations.event_id IS 'Référence à l''événement (FK vers events.id)';
COMMENT ON COLUMN invitations.user_id IS 'Référence à l''utilisateur (FK vers users.id)';
COMMENT ON COLUMN invitations.sent_at IS 'Date et heure d''envoi de l''invitation';
COMMENT ON COLUMN invitations.clicked_at IS 'Date et heure de clic sur le lien (null si pas encore cliqué)';
COMMENT ON COLUMN invitations.status IS 'Statut: sent (envoyé), clicked (cliqué), failed (erreur d''envoi)';

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_invitations_updated_at ON invitations;
CREATE TRIGGER update_invitations_updated_at
    BEFORE UPDATE ON invitations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABLE: bookings
-- ============================================
-- Stores volunteer bookings for time slots
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_id UUID NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_slot FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT unique_booking UNIQUE (slot_id, user_id) -- Un utilisateur ne peut réserver qu'une fois le même créneau
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_bookings_slot_id ON bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);

-- Comments for documentation
COMMENT ON COLUMN bookings.slot_id IS 'Référence au créneau réservé (FK vers slots.id)';
COMMENT ON COLUMN bookings.user_id IS 'Référence à l''utilisateur qui réserve (FK vers users.id)';
COMMENT ON COLUMN bookings.created_at IS 'Date et heure de la réservation';
COMMENT ON TABLE bookings IS 'Réservations des participants sur les créneaux horaires';

-- ============================================
-- End of Initial Schema Migration
-- ============================================
