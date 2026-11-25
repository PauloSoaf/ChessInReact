/**
 * ChessInReact - Redis Lua Atomic Matchmaking Script (Spec 08 § 6, § 11 #3, § 13.1 #1, US08-D02)
 *
 * Indivisible Redis EVAL script for matching N players from a Sorted Set:
 * 1. Takes queue key (KEYS[1]), required group size (ARGV[1]), max tolerance (ARGV[2]), and current timestamp (ARGV[3]).
 * 2. Fetches candidates ordered by wait time or ELO score.
 * 3. Finds a contiguous cluster of N candidates within tolerance.
 * 4. Atomically removes them from the queue (ZREM) in the same Lua execution.
 * 5. Returns the matched ticket IDs to the calling worker.
 *
 * Guarantees zero race conditions across multi-worker clusters.
 */

export const REDIS_MATCHMAKING_LUA_SCRIPT = `
-- KEYS[1]: queue sorted set key (e.g. "queue:variant_hex4")
-- ARGV[1]: groupSize (number of players needed: 2, 3, 4, 6, 8)
-- ARGV[2]: maxTolerance (maximum allowable ELO delta between lowest and highest in group)

local queueKey = KEYS[1]
local groupSize = tonumber(ARGV[1])
local maxTolerance = tonumber(ARGV[2])

-- 1. Fetch all elements with scores
local members = redis.call('ZRANGE', queueKey, 0, -1, 'WITHSCORES')
local count = #members / 2

if count < groupSize then
    return {}
end

-- 2. Slide a window of size 'groupSize' to find a valid cluster
for i = 1, (count - groupSize + 1) do
    local baseIdx = (i - 1) * 2 + 1
    local minScore = tonumber(members[baseIdx + 1])
    local maxScore = minScore
    local matchedIds = {}

    for j = 0, (groupSize - 1) do
        local curIdx = baseIdx + (j * 2)
        local memberId = members[curIdx]
        local score = tonumber(members[curIdx + 1])

        table.insert(matchedIds, memberId)
        if score < minScore then minScore = score end
        if score > maxScore then maxScore = score end
    end

    -- Check if spread is within tolerance
    if (maxScore - minScore) <= maxTolerance then
        -- Atomically remove matched players from queue
        for _, id in ipairs(matchedIds) do
            redis.call('ZREM', queueKey, id)
        end
        return matchedIds
    end
end

return {}
`;

export interface ILuaMatchClusterResult {
  readonly matched: boolean;
  readonly playerIds: readonly string[];
  readonly minScore: number;
  readonly maxScore: number;
}

/**
 * Pure simulation executor of REDIS_MATCHMAKING_LUA_SCRIPT for unit testing and offline fallbacks.
 */
export function executeSimulatedLuaMatcher(
  sortedSet: Array<{ id: string; score: number }>,
  groupSize: number,
  maxTolerance: number
): ILuaMatchClusterResult {
  if (sortedSet.length < groupSize) {
    return { matched: false, playerIds: [], minScore: 0, maxScore: 0 };
  }

  // Sort by score ascending (identical to Redis ZRANGE)
  const sorted = [...sortedSet].sort((a, b) => a.score - b.score);

  for (let i = 0; i <= sorted.length - groupSize; i++) {
    const window = sorted.slice(i, i + groupSize);
    const minScore = window[0]?.score ?? 0;
    const maxScore = window[window.length - 1]?.score ?? 0;

    if (maxScore - minScore <= maxTolerance) {
      const playerIds = window.map((p) => p.id);
      return {
        matched: true,
        playerIds,
        minScore,
        maxScore,
      };
    }
  }

  return { matched: false, playerIds: [], minScore: 0, maxScore: 0 };
}

