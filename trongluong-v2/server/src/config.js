require('dotenv').config()

const path = require('path')

const config = {
    PORT: parseInt(process.env.PORT, 10) || 3000,
    DB_PATH: path.resolve(process.env.DB_PATH || './data/trongluong.db'),
    UPLOAD_DIR: path.resolve(process.env.UPLOAD_DIR || './uploads'),
    ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(o => o.trim())
        .filter(Boolean),
    NODE_ENV: process.env.NODE_ENV || 'development',
    IS_DEV: (process.env.NODE_ENV || 'development') === 'development',
    // Security API Key
    API_KEY: process.env.API_KEY || 'TL_SECRET_SECURE_API_KEY_2026',
    // Google Drive Configurations
    GOOGLE_SERVICE_ACCOUNT_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '',
    DRIVE_FOLDER_ID: process.env.DRIVE_FOLDER_ID || '',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN || '',
}
module.exports = config