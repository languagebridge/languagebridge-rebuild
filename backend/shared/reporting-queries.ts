/**
 * Reporting Queries
 *
 * Cosmos DB SQL queries that power the teacher/admin dashboard.
 * All queries scoped by schoolCode + gradeBand (maps to a teacher).
 * No student names stored or returned.
 *
 * Note: Cosmos DB does not support COUNT(DISTINCT) or ORDER BY aggregate.
 * Distinct counting and sorting are done in application code.
 */

// ─── Question 1: "Is it being used?" ─────────────────────────────

export const USAGE_BY_WEEK = `
  SELECT
    SUBSTRING(c.timestamp, 0, 10) AS day,
    c.eventType,
    c.language,
    COUNT(1) AS count
  FROM c
  WHERE c.schoolCode = @schoolCode
    AND c.gradeBand = @gradeBand
    AND c.timestamp >= @startDate
    AND c.timestamp <= @endDate
  GROUP BY SUBSTRING(c.timestamp, 0, 10), c.eventType, c.language
`;

export const ACTIVE_STUDENTS_RAW = `
  SELECT DISTINCT c.studentCode, SUBSTRING(c.timestamp, 0, 10) AS day
  FROM c
  WHERE c.schoolCode = @schoolCode
    AND c.gradeBand = @gradeBand
    AND c.timestamp >= @startDate
    AND c.timestamp <= @endDate
`;

// ─── Question 2: "Are students learning?" ────────────────────────

export const TERM_RETENTION_RAW = `
  SELECT
    c.term,
    c.subject,
    c.difficulty,
    c.studentCode,
    SUBSTRING(c.timestamp, 0, 7) AS month
  FROM c
  WHERE c.schoolCode = @schoolCode
    AND c.gradeBand = @gradeBand
    AND c.eventType = 'term_lookup'
    AND c.timestamp >= @startDate
    AND c.timestamp <= @endDate
`;

export const STUDENT_PROGRESS = `
  SELECT
    c.studentCode,
    SUBSTRING(c.timestamp, 0, 7) AS month,
    c.term
  FROM c
  WHERE c.schoolCode = @schoolCode
    AND c.gradeBand = @gradeBand
    AND c.eventType = 'term_lookup'
    AND c.timestamp >= @startDate
    AND c.timestamp <= @endDate
`;

export const SCAFFOLD_ENGAGEMENT = `
  SELECT
    SUBSTRING(c.timestamp, 0, 10) AS day,
    c.eventType,
    COUNT(1) AS count
  FROM c
  WHERE c.schoolCode = @schoolCode
    AND c.gradeBand = @gradeBand
    AND c.eventType IN ('term_lookup', 'scaffold_view')
    AND c.timestamp >= @startDate
    AND c.timestamp <= @endDate
  GROUP BY SUBSTRING(c.timestamp, 0, 10), c.eventType
`;

// ─── Question 3: "Is it a crutch?" ──────────────────────────────

export const AUDIO_ENGAGEMENT = `
  SELECT
    SUBSTRING(c.timestamp, 0, 10) AS day,
    c.eventType,
    COUNT(1) AS count
  FROM c
  WHERE c.schoolCode = @schoolCode
    AND c.gradeBand = @gradeBand
    AND c.eventType IN ('term_lookup', 'tts_play', 'scaffold_view')
    AND c.timestamp >= @startDate
    AND c.timestamp <= @endDate
  GROUP BY SUBSTRING(c.timestamp, 0, 10), c.eventType
`;

export const STUDENT_INDEPENDENCE = `
  SELECT
    c.studentCode,
    SUBSTRING(c.timestamp, 0, 7) AS month,
    c.eventType,
    COUNT(1) AS count
  FROM c
  WHERE c.schoolCode = @schoolCode
    AND c.gradeBand = @gradeBand
    AND c.eventType IN ('term_lookup', 'scaffold_view', 'tts_play')
    AND c.timestamp >= @startDate
    AND c.timestamp <= @endDate
  GROUP BY c.studentCode, SUBSTRING(c.timestamp, 0, 7), c.eventType
`;

// ─── Coverage + Quality ──────────────────────────────────────────

export const BRIDGE_VS_FALLBACK = `
  SELECT
    c.source,
    c.language,
    COUNT(1) AS count
  FROM c
  WHERE c.schoolCode = @schoolCode
    AND c.gradeBand = @gradeBand
    AND c.eventType = 'term_lookup'
    AND c.timestamp >= @startDate
    AND c.timestamp <= @endDate
  GROUP BY c.source, c.language
`;

export const VOCABULARY_BREADTH_RAW = `
  SELECT DISTINCT c.term, SUBSTRING(c.timestamp, 0, 10) AS day, c.language
  FROM c
  WHERE c.schoolCode = @schoolCode
    AND c.gradeBand = @gradeBand
    AND c.eventType = 'term_lookup'
    AND c.timestamp >= @startDate
    AND c.timestamp <= @endDate
`;

export const TOP_FLAGGED_RAW = `
  SELECT
    c.term,
    c.language
  FROM c
  WHERE c.schoolCode = @schoolCode
    AND c.gradeBand = @gradeBand
    AND c.eventType = 'flag_event'
    AND c.timestamp >= @startDate
    AND c.timestamp <= @endDate
`;
