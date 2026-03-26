/**
 * Jest global setup — sets test API key so all function handlers
 * pass authentication without relying on NODE_ENV=development bypass.
 */
process.env.LB_API_KEY = 'test-api-key-for-jest';
