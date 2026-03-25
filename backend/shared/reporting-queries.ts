/**
 * Reporting Queries
 *
 * Cosmos DB SQL queries that power the teacher/admin dashboard.
 * All queries are scoped by schoolCode + gradeBand (which maps to a teacher).
 * No student names are ever stored or returned.
 * Teachers see studentCode (e.g. "LB-7K2M") and nickname them locally.
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

export const ACTIVE_STUDENTS = `
  SELECT
    SUBSTRING(c.timestamp, 0, 10) AS day,
    COUNT(DISTINCT c.studentCode) AS active_students
  FROM c
  WHERE c.schoolCode = @schoolCode
    AND c.gradeBand = @gradeBand
    AND c.timestamp >= @startDate
    AND c.timestamp <= @endDate
  GROUP BY SUBSTRING(c.timestamp, 0, 10)
`;

// ─── Question 2: "Are students learning?" ────────────────────────

export const TERM_RETENTION = `
  SELECT
    c.term,
    c.subject,
    c.difficulty,
    COUNT(DISTINCT c.studentCode) AS unique_students,
    SUBSTRING(c.timestamp, 0, 7) AS month
  FROM c
  WHERE c.schoolCode = @schoolCode
    AND c.gradeBand = @gradeBand
    AND c.eventType = 'term_lookup'
    AND c.timestamp >= @startDate
    AND c.timestamp <= @endDate
  GROUP BY c.term, c.subject, c.difficulty, SUBSTRING(c.timestamp, 0, 7)
`;

export const STUDENT_PROGRESS = `
  SELECT
    c.studentCode,
    SUBSTRING(c.timestamp, 0, 7) AS month,
    COUNT(1) AS total_lookups,
    COUNT(DISTINCT c.term) AS unique_terms
  FROM c
  WHERE c.schoolCode = @schoolCode
    AND c.gradeBand = @gradeBand
    AND c.eventType = 'term_lookup'
    AND c.timestamp >= @startDate
    AND c.timestamp <= @endDate
  GROUP BY c.studentCode, SUBSTRING(c.timestamp, 0, 7)
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

export const VOCABULARY_BREADTH = `
  SELECT
    SUBSTRING(c.timestamp, 0, 10) AS day,
    c.language,
    COUNT(DISTINCT c.term) AS unique_terms
  FROM c
  WHERE c.schoolCode = @schoolCode
    AND c.gradeBand = @gradeBand
    AND c.eventType = 'term_lookup'
    AND c.timestamp >= @startDate
    AND c.timestamp <= @endDate
  GROUP BY SUBSTRING(c.timestamp, 0, 10), c.language
`;

export const TOP_FLAGGED = `
  SELECT
    c.term,
    c.language,
    COUNT(1) AS flag_count
  FROM c
  WHERE c.schoolCode = @schoolCode
    AND c.gradeBand = @gradeBand
    AND c.eventType = 'flag_event'
    AND c.timestamp >= @startDate
    AND c.timestamp <= @endDate
  GROUP BY c.term, c.language
  ORDER BY COUNT(1) DESC
`;
