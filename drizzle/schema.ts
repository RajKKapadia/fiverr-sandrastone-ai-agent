import { pgTable, uuid, timestamp, jsonb, integer, index, unique, text } from 'drizzle-orm/pg-core';

/**
 * Sessions table - stores user session metadata
 * One session per userId for maintaining conversation history
 */
export const sessions = pgTable('sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().unique(),
    sessionId: uuid('session_id').defaultRandom().notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Session items table - stores individual conversation items (messages, tool calls, etc.)
 * Items are stored as JSONB for flexibility with AgentInputItem structure
 */
export const sessionItems = pgTable('session_items', {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
        .references(() => sessions.sessionId, { onDelete: 'cascade' })
        .notNull(),
    itemData: jsonb('item_data').notNull(),
    sequence: integer('sequence').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
    // Index for efficient querying by session and sequence
    index('session_sequence_idx').on(table.sessionId, table.sequence),
    // Unique constraint to prevent duplicate sequences within a session
    unique('session_sequence_unique').on(table.sessionId, table.sequence),
]);

/**
 * Chat users table - maps channel type to internal user IDs
 * Allows tracking which user corresponds to which channel in the system
 */
export const chatUsers = pgTable('chat_users', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull(),
    username: text('username'),
    channelType: text('channel_type').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
    // Index for efficient lookup by channel type
    index('user_channel_type_idx').on(table.channelType),
]);

// Type exports for use in queries
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SessionItem = typeof sessionItems.$inferSelect;
export type NewSessionItem = typeof sessionItems.$inferInsert;
export type ChatUser = typeof chatUsers.$inferSelect;
export type NewChatUser = typeof chatUsers.$inferInsert;
