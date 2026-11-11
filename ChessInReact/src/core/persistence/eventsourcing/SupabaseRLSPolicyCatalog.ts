/**
 * ChessInReact - Supabase RLS Policies & Database Governance (Spec 09 § 5, RF-09, RF-11, RF-12)
 *
 * Defines the canonical PostgreSQL Row Level Security (RLS) policies
 * and index migration scripts for production Supabase deployments.
 */

export interface IRLSPolicyDefinition {
  readonly tableName: string;
  readonly policyName: string;
  readonly command: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  readonly usingExpression: string;
  readonly withCheckExpression?: string;
  readonly description: string;
}

export interface IDatabaseIndexDefinition {
  readonly tableName: string;
  readonly indexName: string;
  readonly columns: readonly string[];
  readonly isUnique: boolean;
  readonly rationale: string;
}

export class SupabaseRLSPolicyCatalog {
  /**
   * Authoritative RLS Policies guaranteeing player data privacy and anti-tampering (RF-11).
   */
  public static readonly POLICIES: readonly IRLSPolicyDefinition[] = [
    {
      tableName: 'User',
      policyName: 'user_read_own_private',
      command: 'SELECT',
      usingExpression: 'auth.uid()::text = id',
      description: 'Players may only read their own sensitive profile record including email (Spec 09 § 5, RF-11).',
    },
    {
      tableName: 'User',
      policyName: 'user_read_service_or_owner',
      command: 'SELECT',
      usingExpression: 'auth.role() = \'service_role\' OR auth.uid()::text = id',
      description: 'Restricts direct User table SELECT to owner or service_role; public reads must use PublicUserProfile projection view (RF-11).',
    },
    {
      tableName: 'User',
      policyName: 'user_update_own_profile',
      command: 'UPDATE',
      usingExpression: 'auth.uid()::text = id',
      withCheckExpression: 'auth.uid()::text = id',
      description: 'Players may only mutate their own profile information.',
    },
    {
      tableName: 'CustomVariant',
      policyName: 'variants_read_public_or_own',
      command: 'SELECT',
      usingExpression: '("isPublic" = true OR auth.uid()::text = "authorId") AND "deletedAt" IS NULL',
      description: 'Only public or author-owned variants are visible; soft-deleted records hidden (RF-09).',
    },
    {
      tableName: 'CustomVariant',
      policyName: 'variants_author_manage',
      command: 'ALL',
      usingExpression: 'auth.uid()::text = "authorId"',
      withCheckExpression: 'auth.uid()::text = "authorId"',
      description: 'Only the author can edit or soft-delete their custom variant workshop models.',
    },
    {
      tableName: 'MatchHistory',
      policyName: 'match_read_participants_or_public',
      command: 'SELECT',
      usingExpression: 'true', // Matches are publicly replayable by link or ID
      description: 'Match histories are publicly replayable by ID or PGN link (Spec 09 § 4).',
    },
    {
      tableName: 'PlayerRating',
      policyName: 'ratings_public_read',
      command: 'SELECT',
      usingExpression: 'true',
      description: 'Leaderboard ratings are public for global competitive rankings.',
    },
  ];

  /**
   * Compound B-Tree and GIN Index definitions ensuring < 30ms query performance (RF-12).
   */
  public static readonly INDEXES: readonly IDatabaseIndexDefinition[] = [
    {
      tableName: 'PlayerRating',
      indexName: 'idx_player_rating_leaderboard_btree',
      columns: ['variantId', 'ratingValue DESC'],
      isUnique: false,
      rationale: 'Compound B-Tree index enabling ultra-fast (< 30ms) top-100 leaderboard pagination.',
    },
    {
      tableName: 'MatchHistory',
      indexName: 'idx_match_history_ended_at_btree',
      columns: ['endedAt DESC'],
      isUnique: false,
      rationale: 'Recent matches retrieval for user match history views.',
    },
    {
      tableName: 'MatchHistory',
      indexName: 'idx_match_history_variant_btree',
      columns: ['variantId'],
      isUnique: false,
      rationale: 'Variant-filtered match discovery.',
    },
    {
      tableName: 'MatchEvent',
      indexName: 'idx_match_event_stream_ply',
      columns: ['matchId', 'ply ASC'],
      isUnique: true,
      rationale: 'Strict sequential ordering of Event Sourcing move tape playback.',
    },
  ];

  /**
   * Generates production SQL script for Supabase migration execution.
   */
  public static generatePostgresMigrationSql(): string {
    const rlsSql = this.POLICIES.map((p) => {
      const withCheck = p.withCheckExpression ? ` WITH CHECK (${p.withCheckExpression})` : '';
      return `-- ${p.description}\nALTER TABLE "${p.tableName}" ENABLE ROW LEVEL SECURITY;\nCREATE POLICY "${p.policyName}" ON "${p.tableName}" FOR ${p.command} USING (${p.usingExpression})${withCheck};`;
    }).join('\n\n');

    const indexSql = this.INDEXES.map((idx) => {
      const unique = idx.isUnique ? 'UNIQUE ' : '';
      return `-- ${idx.rationale}\nCREATE ${unique}INDEX IF NOT EXISTS "${idx.indexName}" ON "${idx.tableName}" (${idx.columns.join(', ')});`;
    }).join('\n\n');

    const viewSql = `-- Secure public projection view for user profiles hiding private email addresses (Spec 09 § 5, RF-11)\nCREATE OR REPLACE VIEW "PublicUserProfile" AS\n  SELECT id, username, "avatarUrl", "createdAt", "updatedAt"\n  FROM "User";\nGRANT SELECT ON "PublicUserProfile" TO anon, authenticated;`;

    return `-- ====================================================================\n-- Supabase PostgreSQL Governance: Row Level Security & Indexes\n-- Spec 09 (RF-09, RF-11, RF-12)\n-- ====================================================================\n\n${rlsSql}\n\n${viewSql}\n\n${indexSql}\n`;
  }
}
